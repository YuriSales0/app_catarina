import { and, eq } from "drizzle-orm";
import { matchAnswer, ANSWER_MATCH_POLICY } from "@/lib/assessment/answer-match";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import { NotFoundError, ValidationError } from "@/lib/authorization/errors";
import { roleAllows } from "@/lib/authorization/permissions";
import { buildLessonContext, resolveHandle } from "@/lib/context/build";
import type { AIProvider, Result, ResponseItem } from "@/lib/ai/provider";
import type { HandleMap, ContextPack } from "@/schemas/context-pack";
import type { ActivityProposal, EvaluationProposal, ReportNarrativeProposal } from "@/schemas/ai-proposals";
import { recordEvidence, recordLessonEvent } from "./service";
import { lessonReportSchema, REPORT_SCHEMA_VERSION } from "@/schemas/lesson-report";
import { metric, log } from "@/lib/logging/logger";

/**
 * Where AI output meets the system. A provider returns a proposal; this
 * module decides what, if anything, to persist. Handles are resolved against
 * the pack that was issued, every write goes through the same services a
 * human uses, and every proposal, accepted or rejected, is a lesson event.
 */
export async function hasAiConsent(studentId: string, dbh: DbOrTx = db()): Promise<boolean> {
  const row = await dbh.query.consents.findFirst({ where: and(eq(s.consents.studentId, studentId), eq(s.consents.kind, "AI_PROCESSING")) });
  return Boolean(row && !row.revokedAt);
}

async function requireAiAllowed(access: StudentAccess, dbh: DbOrTx) {
  if (!roleAllows(access.role, "RUN_LESSON")) throw new NotFoundError();
  if (!(await hasAiConsent(access.studentId, dbh))) throw new ValidationError("AI processing has not been enabled for this student. The owner can enable it on the student profile.");
}

async function logProposal(access: StudentAccess, lessonId: string, activityId: string | null, kind: string, result: Result<unknown>, extra: Record<string, unknown> = {}, dbh: DbOrTx = db()) {
  const accepted = result.ok;
  await recordLessonEvent(
    access,
    {
      lessonId,
      activityId: activityId ?? undefined,
      eventType: accepted ? "AI_PROPOSAL_RECEIVED" : "AI_PROPOSAL_REJECTED",
      payload: { kind, provider: result.meta.provider, model: result.meta.model, prompt_version: result.meta.promptVersion, latency_ms: result.meta.latencyMs, pack_id: result.meta.packId, ...(result.ok ? { proposal: result.value } : { error: result.error }), ...extra },
    },
    dbh,
  );
  metric(accepted ? "ai_proposal_received" : "ai_proposal_rejected", { lessonId, kind, provider: result.meta.provider });
  if (!accepted && result.error.kind !== "INVALID_OUTPUT" && result.error.kind !== "REFUSED") metric("ai_provider_error", { kind: result.error.kind, provider: result.meta.provider });
}

export type ActivityContent = { proposal: ActivityProposal; packId: string };

/** Asks the provider for activity content. Returns the proposal for display; it is never persisted as fact. */
export async function requestActivityContent(access: StudentAccess, provider: AIProvider, lessonId: string, activityId: string, dbh: DbOrTx = db()): Promise<Result<ActivityContent>> {
  await requireAiAllowed(access, dbh);
  const lesson = await dbh.query.lessons.findFirst({ where: and(eq(s.lessons.id, lessonId), eq(s.lessons.studentId, access.studentId)) });
  if (!lesson) throw new NotFoundError();
  const activity = await dbh.query.lessonActivities.findFirst({ where: and(eq(s.lessonActivities.id, activityId), eq(s.lessonActivities.lessonId, lessonId)) });
  if (!activity) throw new NotFoundError();
  const { pack, handles } = await buildLessonContext(access, lesson.subjectId, lessonId, {}, dbh);
  const planned = pack.lesson_plan.activities.find((a) => a.sequence === activity.sequence);
  if (!planned) throw new ValidationError("Activity is not in the pack.");
  const result = await provider.generateLessonActivity(pack, planned);
  let checked: Result<ActivityContent>;
  if (result.ok) {
    const problems = validateActivityProposal(result.value, planned, handles);
    checked = problems.length
      ? { ok: false, error: { kind: "INVALID_OUTPUT", message: "proposal refers outside the pack", issues: problems }, meta: result.meta }
      : { ok: true, value: { proposal: result.value, packId: pack.pack_id }, meta: result.meta };
  } else checked = result;
  await logProposal(access, lessonId, activityId, "activity", checked, {}, dbh);
  return checked;
}

function validateActivityProposal(p: ActivityProposal, planned: ContextPack["lesson_plan"]["activities"][number], handles: HandleMap): string[] {
  const problems: string[] = [];
  if (p.activity_ref !== planned.sequence) problems.push(`activity_ref ${p.activity_ref} is not the requested activity ${planned.sequence}`);
  if (!resolveHandle(handles, "objectives", p.objective_ref)) problems.push(`unknown objective handle ${p.objective_ref}`);
  if (planned.objective_ref && p.objective_ref !== planned.objective_ref) problems.push(`objective ${p.objective_ref} is not the planned objective ${planned.objective_ref}`);
  for (const it of p.items) if (it.skill_ref && !resolveHandle(handles, "skills", it.skill_ref)) problems.push(`unknown skill handle ${it.skill_ref}`);
  return problems;
}

/**
 * Machine-checkable items are graded by the system without a model. Open
 * items go to the provider; the result is labelled AI-graded and enters the
 * ledger through recordEvidence like any attempt, capped by the state policy.
 */
export async function gradeAndRecord(
  access: StudentAccess,
  provider: AIProvider,
  input: { lessonId: string; activityId: string; packId: string; item: ResponseItem; errorTagVocabulary: string[]; inputMode?: "typed" | "speech" },
  dbh: DbOrTx = db(),
) {
  const lesson = await dbh.query.lessons.findFirst({ where: and(eq(s.lessons.id, input.lessonId), eq(s.lessons.studentId, access.studentId)) });
  if (!lesson) throw new NotFoundError();
  const packs = (lesson.metadata as { context_packs?: Record<string, HandleMap> }).context_packs ?? {};
  const handles = packs[input.packId];
  if (!handles) throw new ValidationError("Unknown pack; grading must reference a pack issued for this lesson.");
  const objectiveId = resolveHandle(handles, "objectives", input.item.objective_ref);
  if (!objectiveId) throw new ValidationError(`Unknown objective handle ${input.item.objective_ref}`);

  const accepted = [input.item.expected_response, ...input.item.accept_also].filter((x): x is string => Boolean(x));
  if (accepted.length) {
    const m = matchAnswer(input.item.student_response, accepted);
    return recordEvidence(
      access,
      { lessonId: input.lessonId, activityId: input.activityId, objectiveId, prompt: input.item.prompt, studentResponse: input.item.student_response, expectedResponse: input.item.expected_response ?? undefined, result: m.result, evidenceType: "PRACTICE", confidence: "HIGH", errorTags: [] },
      { gradedBy: "SYSTEM", graderRef: { method: `${m.method}_match`, policy: ANSWER_MATCH_POLICY.version, input: input.inputMode ?? "typed" } },
      dbh,
    );
  }

  await requireAiAllowed(access, dbh);
  const { pack } = await buildLessonContext(access, lesson.subjectId, input.lessonId, {}, dbh);
  const result = await provider.evaluateResponse(pack, input.item);
  let checked: Result<EvaluationProposal> = result;
  if (result.ok) {
    const problems: string[] = [];
    if (result.value.objective_ref !== input.item.objective_ref) problems.push("evaluation names a different objective than the item");
    const unknownTags = result.value.error_tags.filter((t) => !input.errorTagVocabulary.includes(t));
    if (problems.length) checked = { ok: false, error: { kind: "INVALID_OUTPUT", message: "evaluation refers outside the item", issues: problems }, meta: result.meta };
    else if (unknownTags.length) {
      log.warn("ai.unknown_error_tags", { tags: unknownTags });
      checked = { ...result, value: { ...result.value, error_tags: result.value.error_tags.filter((t) => input.errorTagVocabulary.includes(t)) } };
    }
  }
  await logProposal(access, input.lessonId, input.activityId, "evaluation", checked, { item_prompt_len: input.item.prompt.length }, dbh);
  if (!checked.ok) {
    // The attempt happened; it is recorded as not assessed rather than lost.
    return recordEvidence(
      access,
      { lessonId: input.lessonId, activityId: input.activityId, objectiveId, prompt: input.item.prompt, studentResponse: input.item.student_response, result: "NOT_ASSESSED", evidenceType: "PRACTICE", confidence: "LOW", errorTags: [] },
      { gradedBy: "SYSTEM", graderRef: { method: "ai_unavailable", reason: checked.error.kind } },
      dbh,
    );
  }
  const v = checked.value;
  return recordEvidence(
    access,
    { lessonId: input.lessonId, activityId: input.activityId, objectiveId, prompt: input.item.prompt, studentResponse: input.item.student_response, expectedResponse: input.item.expected_response ?? undefined, result: v.result, correction: v.correction ?? undefined, evidenceType: "PRACTICE", confidence: v.confidence, errorTags: v.error_tags },
    { gradedBy: "AI_PROVIDER", graderRef: { provider: checked.meta.provider, model: checked.meta.model ?? undefined, promptVersion: checked.meta.promptVersion ?? undefined } },
    dbh,
  );
}

/**
 * Adds AI prose to a completed lesson's report as a new report row whose
 * OBSERVED section is copied verbatim from the SYSTEM report. Inference and
 * recommendation rows are inserted with resolved evidence ids; anything the
 * model cannot ground in the pack is dropped and logged.
 */
export async function attachReportNarrative(access: StudentAccess, provider: AIProvider, lessonId: string, dbh: DbOrTx = db()) {
  await requireAiAllowed(access, dbh);
  const lesson = await dbh.query.lessons.findFirst({ where: and(eq(s.lessons.id, lessonId), eq(s.lessons.studentId, access.studentId)) });
  if (!lesson || lesson.status !== "COMPLETED") throw new ValidationError("Only a completed lesson has a report to narrate.");
  const systemReport = await dbh.query.lessonReports.findFirst({ where: and(eq(s.lessonReports.lessonId, lessonId), eq(s.lessonReports.generatedBy, "SYSTEM")) });
  if (!systemReport) throw new NotFoundError();
  const base = lessonReportSchema.parse(systemReport.payload);
  const { pack, handles } = await buildLessonContext(access, lesson.subjectId, lessonId, {}, dbh);
  const result = await provider.generateLessonReport(pack, base.observed);
  let checked: Result<ReportNarrativeProposal> = result;
  const dropped: string[] = [];
  if (result.ok) {
    const ev = (refs: string[]) => refs.map((r) => resolveHandle(handles, "evidence", r)).filter((x): x is string => Boolean(x));
    const statements = result.value.inferred.statements
      .map((st) => ({ ...st, ids: ev(st.basis_evidence_refs), objectiveId: st.objective_ref ? resolveHandle(handles, "objectives", st.objective_ref) : null }))
      .filter((st) => {
        if (st.ids.length === 0) dropped.push(`statement without resolvable evidence: ${st.statement.slice(0, 60)}`);
        return st.ids.length > 0;
      });
    const pron = result.value.inferred.pronunciation_targets.map((p) => ({ ...p, ids: ev(p.basis_evidence_refs) })).filter((p) => p.ids.length > 0);
    const activities = result.value.recommended.recommended_activities.map((a) => ({ ...a, objectiveId: resolveHandle(handles, "objectives", a.objective_ref) })).filter((a) => a.objectiveId);
    const merged = lessonReportSchema.parse({
      ...base,
      generated_at: new Date().toISOString(),
      generated_by: "AI_PROVIDER",
      generator_ref: { provider: result.meta.provider, model: result.meta.model, prompt_version: result.meta.promptVersion, based_on_report_id: systemReport.id, refused_instructions: result.value.refused_instructions, dropped },
      observed: base.observed,
      inferred: {
        ...base.inferred,
        statements: [...base.inferred.statements, ...statements.map((st) => ({ statement: st.statement, about: st.objectiveId ? { objective_id: st.objectiveId } : null, basis_evidence_ids: st.ids, source: "AI_PROVIDER" as const, confidence: st.confidence }))],
        successful_patterns: [...base.inferred.successful_patterns, ...result.value.inferred.successful_patterns],
        failed_patterns: [...base.inferred.failed_patterns, ...result.value.inferred.failed_patterns],
        pronunciation_targets: [...base.inferred.pronunciation_targets, ...pron.map((p) => ({ target: p.target, note: p.note, basis_evidence_ids: p.ids }))],
      },
      recommended: {
        ...base.recommended,
        recommended_activities: [...base.recommended.recommended_activities, ...activities.map((a) => ({ activity_type: a.activity_type, objective_id: a.objectiveId!, reason: a.reason }))],
        parent_actions: [...base.recommended.parent_actions, ...result.value.recommended.parent_actions],
      },
    });
    await dbh.transaction(async (tx) => {
      const [row] = await tx
        .insert(s.lessonReports)
        .values({ lessonId, studentId: access.studentId, schemaVersion: REPORT_SCHEMA_VERSION, payload: merged, generatedBy: "AI_PROVIDER", generatorRef: merged.generator_ref ?? {} })
        .returning();
      if (statements.length) {
        await tx.insert(s.learningInference).values(
          statements.map((st) => ({ studentId: access.studentId, subjectId: lesson.subjectId, objectiveId: st.objectiveId, lessonId, statement: st.statement, basisEvidenceIds: st.ids, source: "AI_PROVIDER" as const, sourceRef: { report_id: row.id, provider: result.meta.provider, model: result.meta.model }, confidence: st.confidence })),
        );
      }
      const recs = [
        ...activities.map((a) => ({ studentId: access.studentId, subjectId: lesson.subjectId, kind: "ACTIVITY" as const, objectiveId: a.objectiveId, lessonId, statement: a.reason, rationale: { activity_type: a.activity_type }, source: "AI_PROVIDER" as const, sourceRef: { report_id: row.id } })),
        ...result.value.recommended.parent_actions.map((a) => ({ studentId: access.studentId, subjectId: lesson.subjectId, kind: "PARENT_ACTION" as const, lessonId, statement: a.action, rationale: { reason: a.reason }, source: "AI_PROVIDER" as const, sourceRef: { report_id: row.id } })),
      ];
      if (recs.length) await tx.insert(s.learningRecommendation).values(recs);
    });
    checked = result;
  }
  await logProposal(access, lessonId, null, "report_narrative", checked, { dropped }, dbh);
  return checked;
}
