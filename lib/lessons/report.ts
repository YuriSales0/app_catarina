import { STATUS } from "@/lib/copy/pt";
import { placementCheck, type Opening } from "./opening";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { Tx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import { lessonReportSchema, REPORT_SCHEMA_VERSION, type LessonReport, type ObservedSection } from "@/schemas/lesson-report";
import { findRecurringErrors, RECURRING_ERROR_POLICY } from "@/lib/assessment/recurring-errors";
import { effectiveEvidence, isAssessed, score, type EvidenceRow } from "@/lib/learning/evidence-view";
import { CURRENT_STATE_POLICY } from "@/lib/learning/state-policy";

const PACING_LOW_RATE = 0.4;
const PACING_LESSONS = 3;

/**
 * Computes the OBSERVED section from the ledger and events, the INFERRED
 * section from deterministic rules, and the RECOMMENDED section from state.
 * Persists the report, plus inference and recommendation rows. SYSTEM-generated:
 * no model is involved; Phase 12 may add prose to two of the three sections
 * but never to `observed`.
 */
export async function generateSystemReport(tx: Tx, access: StudentAccess, lesson: s.LessonRow): Promise<s.LessonReportRow> {
  const now = new Date();
  const [activities, events, evidenceRows, version] = await Promise.all([
    tx.query.lessonActivities.findMany({ where: eq(s.lessonActivities.lessonId, lesson.id), orderBy: asc(s.lessonActivities.sequence) }),
    tx.query.lessonEvents.findMany({ where: eq(s.lessonEvents.lessonId, lesson.id), orderBy: asc(s.lessonEvents.sequence) }),
    tx.query.learningEvidence.findMany({ where: eq(s.learningEvidence.lessonId, lesson.id), orderBy: asc(s.learningEvidence.occurredAt) }),
    tx.query.curriculumVersions.findFirst({ where: eq(s.curriculumVersions.id, lesson.curriculumVersionId) }),
  ]);
  const vocabulary = version?.errorTagVocabulary ?? {};
  const asView = (r: s.LearningEvidenceRow): EvidenceRow => ({
    id: r.id,
    lessonId: r.lessonId,
    result: r.result,
    evidenceType: r.evidenceType,
    gradedBy: r.gradedBy,
    confidence: r.confidence,
    supersedesEvidenceId: r.supersedesEvidenceId,
    errorTags: r.errorTags,
    occurredAt: r.occurredAt,
  });
  const effective = effectiveEvidence(evidenceRows.map(asView));
  const effectiveIds = new Set(effective.map((e) => e.id));
  const rowsById = new Map(evidenceRows.map((r) => [r.id, r]));

  const objectiveIds = [...new Set(evidenceRows.map((e) => e.objectiveId).concat(activities.map((a) => a.objectiveId).filter((x): x is string => Boolean(x))))];
  const objectives = objectiveIds.length ? await tx.query.learningObjectives.findMany({ where: inArray(s.learningObjectives.id, objectiveIds) }) : [];
  const objById = new Map(objectives.map((o) => [o.id, o]));

  // OBSERVED
  const attempted: ObservedSection["objectives_attempted"] = [];
  for (const o of objectives) {
    const rows = effective.filter((e) => rowsById.get(e.id)?.objectiveId === o.id && isAssessed(e));
    if (!rows.length) continue;
    const correct = rows.filter((r) => r.result === "CORRECT").length;
    const partial = rows.filter((r) => r.result === "PARTIALLY_CORRECT").length;
    const incorrect = rows.filter((r) => r.result === "INCORRECT").length;
    attempted.push({
      objective_id: o.id,
      code: o.code,
      title: o.title,
      attempts: rows.length,
      correct,
      partially_correct: partial,
      incorrect,
      success_rate: rows.reduce((a, r) => a + score(r, CURRENT_STATE_POLICY.partialCreditScore), 0) / rows.length,
      evidence_ids: rows.map((r) => r.id),
    });
  }
  const skillCounts = new Map<string, number>();
  for (const r of evidenceRows) if (r.skillId && effectiveIds.has(r.id)) skillCounts.set(r.skillId, (skillCounts.get(r.skillId) ?? 0) + 1);
  const skillRows = skillCounts.size ? await tx.query.skills.findMany({ where: inArray(s.skills.id, [...skillCounts.keys()]) }) : [];
  const errorsObserved = new Map<string, { count: number; ids: string[] }>();
  for (const r of evidenceRows) {
    if (!effectiveIds.has(r.id)) continue;
    for (const t of r.errorTags) {
      const cur = errorsObserved.get(t) ?? { count: 0, ids: [] };
      cur.count++;
      cur.ids.push(r.id);
      errorsObserved.set(t, cur);
    }
  }
  const transitions = lesson.startedAt
    ? await tx.query.studentObjectiveStateTransition.findMany({
        where: and(eq(s.studentObjectiveStateTransition.studentId, access.studentId), gte(s.studentObjectiveStateTransition.createdAt, lesson.startedAt)),
        orderBy: asc(s.studentObjectiveStateTransition.createdAt),
      })
    : [];
  const lessonEvidenceIds = new Set(evidenceRows.map((e) => e.id));
  const lessonTransitions = transitions.filter((t) => t.triggeredByEvidenceId && lessonEvidenceIds.has(t.triggeredByEvidenceId));
  const byResult = { CORRECT: 0, PARTIALLY_CORRECT: 0, INCORRECT: 0, NOT_ASSESSED: 0 };
  const byGrader = { SYSTEM: 0, HUMAN: 0, AI_PROVIDER: 0 };
  for (const e of effective) {
    byResult[e.result]++;
    byGrader[e.gradedBy]++;
  }
  const teacherNotes = events.filter((e) => e.eventType === "TEACHER_NOTE").map((e) => ({ event_id: e.id, text: String((e.payload as { text?: string }).text ?? ""), at: e.occurredAt.toISOString() }));
  const observed: ObservedSection = {
    started_at: lesson.startedAt?.toISOString() ?? null,
    completed_at: lesson.completedAt?.toISOString() ?? null,
    actual_duration_minutes: lesson.actualDurationMinutes,
    objectives_attempted: attempted,
    objectives_progressed: lessonTransitions
      .filter((t) => t.fromStatus !== t.toStatus)
      .map((t) => ({ objective_id: t.objectiveId, from_status: t.fromStatus, to_status: t.toStatus })),
    skills_practised: skillRows.map((k) => ({ skill_id: k.id, name: k.name, attempt_count: skillCounts.get(k.id) ?? 0 })),
    vocabulary_introduced: [],
    errors_observed: [...errorsObserved.entries()].map(([tag, v]) => ({ error_tag: tag, human_label: vocabulary[tag] ?? tag, count: v.count, evidence_ids: v.ids })),
    activities_completed: activities.map((a) => ({
      sequence: a.sequence,
      activity_type: a.activityType,
      completed: events.some((e) => e.activityId === a.id && e.eventType === "ACTIVITY_COMPLETED") || evidenceRows.some((e) => e.activityId === a.id),
      evidence_count: evidenceRows.filter((e) => e.activityId === a.id).length,
    })),
    evidence_summary: { total: effective.length, by_result: byResult, by_grader: byGrader },
    state_transitions: lessonTransitions.map((t) => ({
      objective_id: t.objectiveId,
      from_status: t.fromStatus,
      to_status: t.toStatus,
      from_confidence: t.fromConfidence,
      to_confidence: t.toConfidence,
      transition_id: t.id,
      rule_version: t.ruleVersion,
    })),
    teacher_notes: teacherNotes,
  };

  // INFERRED (rule engine)
  const since = new Date(now.getTime() - RECURRING_ERROR_POLICY.windowDays * 86_400_000);
  const windowRows = await tx.query.learningEvidence.findMany({
    where: and(eq(s.learningEvidence.studentId, access.studentId), eq(s.learningEvidence.subjectId, lesson.subjectId), gte(s.learningEvidence.occurredAt, since)),
  });
  const recurring = findRecurringErrors(
    windowRows.map((r) => ({ id: r.id, lessonId: r.lessonId, objectiveId: r.objectiveId, errorTags: r.errorTags, occurredAt: r.occurredAt })),
    now,
  );
  const recurringByTag = new Map(recurring.map((r) => [r.errorTag, r]));
  const inferredRecurring = [...errorsObserved.keys()].map((tag) => {
    const rec = recurringByTag.get(tag);
    const inWindow = windowRows.filter((r) => r.errorTags.includes(tag));
    const first = inWindow.reduce<Date | null>((a, r) => (!a || r.occurredAt < a ? r.occurredAt : a), null) ?? now;
    return {
      error_tag: tag,
      human_label: vocabulary[tag] ?? tag,
      occurrences_this_lesson: errorsObserved.get(tag)!.count,
      occurrences_last_30_days: inWindow.length,
      first_seen_at: first.toISOString(),
      is_recurring: Boolean(rec),
    };
  });
  const statements: LessonReport["inferred"]["statements"] = [];
  for (const rec of recurring) {
    if (!errorsObserved.has(rec.errorTag)) continue;
    statements.push({
      statement: `"${vocabulary[rec.errorTag] ?? rec.errorTag}" apareceu ${rec.occurrences} vezes em ${rec.lessonIds.length || 1} ${(rec.lessonIds.length || 1) === 1 ? "sessão" : "sessões"} nos últimos ${RECURRING_ERROR_POLICY.windowDays} dias e parece um padrão, não um deslize.`,
      about: { objective_id: rec.objectiveIds[0] },
      basis_evidence_ids: rec.evidenceIds,
      source: "RULE_ENGINE",
      confidence: rec.occurrences >= 5 ? "HIGH" : "MEDIUM",
    });
  }
  const successful: string[] = [];
  const failed: string[] = [];
  for (const a of attempted) {
    if (a.attempts >= 3 && (a.success_rate ?? 0) >= 0.8) successful.push(`${a.title}: ${a.correct} de ${a.attempts} certas.`);
    if (a.attempts >= 3 && (a.success_rate ?? 0) < 0.5) failed.push(`${a.title}: só ${a.correct} de ${a.attempts} certas.`);
  }

  // RECOMMENDED (from state, proposals only)
  const primary = objById.get(lesson.primaryObjectiveId);
  const primaryState = await tx.query.studentObjectiveState.findFirst({
    where: and(eq(s.studentObjectiveState.studentId, access.studentId), eq(s.studentObjectiveState.objectiveId, lesson.primaryObjectiveId)),
  });
  const recentLessons = await tx.query.lessons.findMany({
    where: and(eq(s.lessons.studentId, access.studentId), eq(s.lessons.subjectId, lesson.subjectId), eq(s.lessons.primaryObjectiveId, lesson.primaryObjectiveId), eq(s.lessons.status, "COMPLETED")),
    orderBy: asc(s.lessons.completedAt),
  });
  let pacing: LessonReport["recommended"]["pacing"] = null;
  if (recentLessons.length >= PACING_LESSONS) {
    const lastIds = recentLessons.slice(-PACING_LESSONS).map((l) => l.id);
    const rows = await tx.query.learningEvidence.findMany({ where: and(eq(s.learningEvidence.objectiveId, lesson.primaryObjectiveId), inArray(s.learningEvidence.lessonId, lastIds)) });
    const eff = effectiveEvidence(rows.map(asView)).filter(isAssessed);
    const rate = eff.length ? eff.reduce((a, r) => a + score(r, CURRENT_STATE_POLICY.partialCreditScore), 0) / eff.length : null;
    if (rate !== null && rate < PACING_LOW_RATE) {
      pacing = { suggestion: "SLOW_DOWN", reason: `O acerto em "${primary?.title}" ficou em ${(rate * 100).toFixed(0)}% nas últimas ${PACING_LESSONS} aulas. Divida em passos menores ou volte ao que vem antes.` };
    }
  }
  const review: LessonReport["recommended"]["recommended_review"] = [];
  if (primaryState && (primaryState.status === "PRACTISING" || primaryState.status === "DEVELOPING")) {
    review.push({ objective_id: lesson.primaryObjectiveId, reason: `Ainda em "${STATUS[primaryState.status].label.toLowerCase()}" depois desta aula; vale manter na próxima.`, priority: 1 });
  }
  const parentActions: LessonReport["recommended"]["parent_actions"] = [];
  // Opening diagnostic: if the starting point looks wrong, say so to the family. The level never changes by itself.
  const opening = (lesson.planPayload as { opening?: Opening | null } | null)?.opening ?? null;
  const orientation = activities.find((a) => a.activityType === "ORIENTATION");
  if (opening && orientation) {
    const curriculum = version ? await tx.query.curricula.findFirst({ where: eq(s.curricula.id, version.curriculumId), columns: { name: true } }) : null;
    const diagnostic = effective.filter((e) => rowsById.get(e.id)?.activityId === orientation.id).map((e) => e.result);
    const check = placementCheck(opening, diagnostic, curriculum?.name ?? "", CURRENT_STATE_POLICY.partialCreditScore);
    if (check) parentActions.push(check);
  }
  if (recurring.some((r) => errorsObserved.has(r.errorTag))) {
    parentActions.push({ action: "Durante a semana, preste atenção ao erro que se repete e fale a forma certa uma vez, sem transformar em exercício.", reason: "Um erro recorrente melhora mais com exposição frequente e leve do que com pressão de correção." });
  }

  const report: LessonReport = {
    schema_version: REPORT_SCHEMA_VERSION,
    lesson_id: lesson.id,
    student_id: access.studentId,
    subject_id: lesson.subjectId,
    lesson_number: lesson.lessonNumber,
    generated_at: now.toISOString(),
    generated_by: "SYSTEM",
    generator_ref: { generator: "lib/lessons/report.ts", state_policy: CURRENT_STATE_POLICY.version },
    observed,
    inferred: {
      statements,
      recurring_errors: inferredRecurring,
      successful_patterns: successful,
      failed_patterns: failed,
      pronunciation_targets: [],
      teacher_observations: teacherNotes.map((n) => n.text),
    },
    recommended: {
      recommended_review: review,
      recommended_next_objective: null,
      recommended_activities: [],
      pacing,
      parent_actions: parentActions,
    },
  };
  const validated = lessonReportSchema.parse(report);

  const [row] = await tx
    .insert(s.lessonReports)
    .values({ lessonId: lesson.id, studentId: access.studentId, schemaVersion: REPORT_SCHEMA_VERSION, payload: validated, generatedBy: "SYSTEM", generatorRef: validated.generator_ref ?? {} })
    .returning();

  if (statements.length) {
    await tx.insert(s.learningInference).values(
      statements.map((st) => ({
        studentId: access.studentId,
        subjectId: lesson.subjectId,
        objectiveId: st.about?.objective_id ?? null,
        lessonId: lesson.id,
        statement: st.statement,
        basisEvidenceIds: st.basis_evidence_ids,
        source: st.source,
        sourceRef: { report_id: row.id },
        confidence: st.confidence,
      })),
    );
  }
  const recs: Array<typeof s.learningRecommendation.$inferInsert> = [];
  for (const r of review) recs.push({ studentId: access.studentId, subjectId: lesson.subjectId, kind: "REVIEW", objectiveId: r.objective_id, lessonId: lesson.id, statement: r.reason, rationale: { priority: r.priority }, source: "NEXT_LESSON_ENGINE", sourceRef: { report_id: row.id } });
  if (pacing) recs.push({ studentId: access.studentId, subjectId: lesson.subjectId, kind: "PACING", objectiveId: lesson.primaryObjectiveId, lessonId: lesson.id, statement: pacing.reason, rationale: { suggestion: pacing.suggestion }, source: "NEXT_LESSON_ENGINE", sourceRef: { report_id: row.id } });
  for (const a of parentActions) recs.push({ studentId: access.studentId, subjectId: lesson.subjectId, kind: "PARENT_ACTION", lessonId: lesson.id, statement: a.action, rationale: { reason: a.reason }, source: "NEXT_LESSON_ENGINE", sourceRef: { report_id: row.id } });
  if (recs.length) await tx.insert(s.learningRecommendation).values(recs);
  return row;
}
