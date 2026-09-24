import { getLongTermProgress } from "@/lib/learning/long-term";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import { NotFoundError, ValidationError } from "@/lib/authorization/errors";
import { getStudentProgress } from "@/lib/learning/progress";
import { getNextLessonPlan } from "@/lib/learning/next-lesson";
import { findRecurringErrors, RECURRING_ERROR_POLICY } from "@/lib/assessment/recurring-errors";
import { contextPackSchema, CONTEXT_VERSION, CONTEXT_CAPS, type ContextPack, type HandleMap } from "@/schemas/context-pack";
import { lessonReportSchema } from "@/schemas/lesson-report";
import type { NextLessonPlan } from "@/schemas/lesson-plan";
import { ageYears } from "@/lib/students/age";
import { writeAudit } from "@/lib/audit/write";
import { randomBytes } from "node:crypto";

const DAY_MS = 86_400_000;

/** Issues short per-pack handles; the map stays on the server. */
class Handles {
  readonly map: HandleMap = { objectives: {}, skills: {}, evidence: {} };
  private counters = { obj: 0, sk: 0, ev: 0 };
  private reverse = { obj: new Map<string, string>(), sk: new Map<string, string>(), ev: new Map<string, string>() };
  private issue(kind: "obj" | "sk" | "ev", id: string, bucket: keyof HandleMap): string {
    const existing = this.reverse[kind].get(id);
    if (existing) return existing;
    const h = `${kind}_${++this.counters[kind]}`;
    this.reverse[kind].set(id, h);
    this.map[bucket][h] = id;
    return h;
  }
  objective(id: string) {
    return this.issue("obj", id, "objectives");
  }
  skill(id: string) {
    return this.issue("sk", id, "skills");
  }
  evidence(id: string) {
    return this.issue("ev", id, "evidence");
  }
}

const clip = (v: string | null | undefined, n: number) => (v == null ? null : v.length > n ? v.slice(0, n - 1) + "…" : v);

/**
 * The bridge to any AI or voice system. Authorization first; then an explicit
 * allowlist of exactly what one lesson needs, with opaque handles, caps, and
 * no prior inferences or recommendations.
 */
export async function buildLessonContext(
  access: StudentAccess,
  subjectId: string,
  lessonId?: string,
  opts: { now?: Date } = {},
  dbh: DbOrTx = db(),
): Promise<{ pack: ContextPack; handles: HandleMap; plan: NextLessonPlan }> {
  const now = opts.now ?? new Date();
  const student = await dbh.query.students.findFirst({ where: eq(s.students.id, access.studentId) });
  if (!student) throw new NotFoundError();
  const progress = await getStudentProgress(access, subjectId, dbh, now);

  let plan: NextLessonPlan;
  let lesson: s.LessonRow | null = null;
  if (lessonId) {
    lesson = (await dbh.query.lessons.findFirst({ where: and(eq(s.lessons.id, lessonId), eq(s.lessons.studentId, access.studentId), eq(s.lessons.subjectId, subjectId)) })) ?? null;
    if (!lesson) throw new NotFoundError();
    plan = lesson.planPayload as unknown as NextLessonPlan;
  } else {
    plan = await getNextLessonPlan(access, subjectId, { now }, dbh);
  }
  if (plan.outcome !== "PLANNED" || !plan.primary_objective) throw new ValidationError(`No lesson to build context for: ${plan.outcome}`);

  const H = new Handles();
  const primary = progress.objectives.find((o) => o.objective.id === plan.primary_objective!.id);
  if (!primary) throw new NotFoundError();
  const byId = new Map(progress.objectives.map((o) => [o.objective.id, o]));

  // Prerequisites (direct) and mastered ancestors.
  const directPrereqIds = progress.edges.filter((e) => e.objectiveId === primary.objective.id).map((e) => e.prerequisiteObjectiveId);
  const ancestors = new Set<string>();
  const stack = [...directPrereqIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    for (const e of progress.edges) if (e.objectiveId === id) stack.push(e.prerequisiteObjectiveId);
  }
  const masteredRelevant = progress.objectives
    .filter((o) => o.status === "MASTERED" && (ancestors.has(o.objective.id) || o.unit.id === primary.unit.id))
    .slice(0, CONTEXT_CAPS.masteredConcepts);

  // Evidence for the primary objective and its direct prerequisites, newest first, capped.
  const relevantIds = [primary.objective.id, ...directPrereqIds];
  const lineageIds = relevantIds.map((id) => byId.get(id)?.objective.lineageId).filter((x): x is string => Boolean(x));
  const evidenceRows = await dbh.query.learningEvidence.findMany({
    where: and(eq(s.learningEvidence.studentId, access.studentId), inArray(s.learningEvidence.objectiveLineageId, lineageIds), inArray(s.learningEvidence.evidenceType, ["PRACTICE", "ASSESSMENT", "OBSERVATION", "PARENT_REPORT"])),
    orderBy: desc(s.learningEvidence.occurredAt),
    limit: CONTEXT_CAPS.evidence,
  });
  const objectiveIdByLineage = new Map(progress.objectives.map((o) => [o.objective.lineageId, o.objective.id]));

  // Recurring errors in this subject, capped.
  const since = new Date(now.getTime() - RECURRING_ERROR_POLICY.windowDays * DAY_MS);
  const windowRows = await dbh.query.learningEvidence.findMany({
    where: and(eq(s.learningEvidence.studentId, access.studentId), eq(s.learningEvidence.subjectId, subjectId)),
    orderBy: desc(s.learningEvidence.occurredAt),
    limit: 500,
  });
  const recurring = findRecurringErrors(
    windowRows.filter((r) => r.occurredAt >= since).map((r) => ({ id: r.id, lessonId: r.lessonId, objectiveId: r.objectiveId, errorTags: r.errorTags, occurredAt: r.occurredAt })),
    now,
  ).slice(0, CONTEXT_CAPS.recurringErrors);
  const evidenceIncluded = new Set(evidenceRows.map((e) => e.id));

  // Previous lesson: observed facts only, from its SYSTEM-computed report section.
  const previous = await dbh.query.lessons.findFirst({
    where: and(eq(s.lessons.studentId, access.studentId), eq(s.lessons.subjectId, subjectId), eq(s.lessons.status, "COMPLETED")),
    orderBy: desc(s.lessons.completedAt),
  });
  let previousSummary: ContextPack["previous_lesson_summary"] = null;
  if (previous && previous.completedAt) {
    const report = await dbh.query.lessonReports.findFirst({ where: eq(s.lessonReports.lessonId, previous.id), orderBy: desc(s.lessonReports.generatedAt) });
    const parsed = report ? lessonReportSchema.safeParse(report.payload) : null;
    const observed = parsed?.success ? parsed.data.observed : null;
    previousSummary = {
      lesson_number: previous.lessonNumber,
      completed_at: previous.completedAt.toISOString(),
      objectives_practised: (observed?.objectives_attempted ?? []).slice(0, 6).map((a) => ({ ref: H.objective(a.objective_id), title: a.title })),
      observed_facts: (observed?.objectives_attempted ?? []).slice(0, 10).map((a) => `${a.title}: ${a.correct} of ${a.attempts} correct`),
      what_went_well: (observed?.objectives_attempted ?? []).filter((a) => a.attempts >= 3 && (a.success_rate ?? 0) >= 0.8).slice(0, 5).map((a) => a.title),
      what_was_hard: (observed?.objectives_attempted ?? []).filter((a) => a.attempts >= 3 && (a.success_rate ?? 0) < 0.5).slice(0, 5).map((a) => a.title),
    };
  }

  const skillRows = await dbh
    .select({ objectiveId: s.objectiveSkills.objectiveId, id: s.skills.id, name: s.skills.name })
    .from(s.objectiveSkills)
    .innerJoin(s.skills, eq(s.skills.id, s.objectiveSkills.skillId))
    .where(eq(s.objectiveSkills.objectiveId, primary.objective.id))
    .orderBy(asc(s.skills.name));

  const notes = primary.objective.teachingNotes as Partial<Record<"vocabulary" | "structures" | "example_prompts" | "activity_ideas" | "success_criteria", string[]>>;
  const age = ageYears(student.dateOfBirth, now);
  const enrolment = progress.enrolment;
  const instructions = (enrolment.metadata as { teacher_instructions?: { text?: string; authored_at?: string } }).teacher_instructions;
  const vocabulary = progress.version.errorTagVocabulary;
  const unitPosition = progress.units.filter((u) => u.parentUnitId === null).findIndex((u) => u.id === (primary.unit.parentUnitId ?? primary.unit.id)) + 1;

  // The long view (weeks, trend), computed by rules from the ledger.
  const longTerm = await getLongTermProgress(access, subjectId, { secure: progress.summary.MASTERED + progress.summary.PROFICIENT, total: progress.summary.total }, student.timezone, dbh, now);

  const pack: ContextPack = {
    context_version: CONTEXT_VERSION,
    generated_at: now.toISOString(),
    pack_id: `pack_${randomBytes(9).toString("hex")}`,
    student: {
      display_name: student.name,
      age_years: age,
      instruction_language: enrolment.instructionLanguage,
      target_language: enrolment.targetLanguage,
      timezone: student.timezone,
    },
    subject: { name: progress.subject.name, slug: progress.subject.slug },
    curriculum: { name: progress.curriculum.name, version: progress.version.version, source: progress.curriculum.source },
    current_unit: { name: primary.unit.name, description: progress.units.find((u) => u.id === primary.unit.id)?.description ?? "", position: Math.max(1, unitPosition) },
    primary_objective: {
      ref: H.objective(primary.objective.id),
      code: primary.objective.code,
      title: primary.objective.title,
      description: primary.objective.description,
      difficulty: primary.objective.difficulty,
      skills: skillRows.map((k) => ({ ref: H.skill(k.id), name: k.name })),
      teaching_notes: {
        vocabulary: notes.vocabulary ?? [],
        structures: notes.structures ?? [],
        example_prompts: notes.example_prompts ?? [],
        activity_ideas: notes.activity_ideas ?? [],
        success_criteria: notes.success_criteria ?? [],
      },
    },
    prerequisites: directPrereqIds
      .map((id) => byId.get(id))
      .filter((o): o is NonNullable<typeof o> => Boolean(o))
      .slice(0, CONTEXT_CAPS.prerequisites)
      .map((o) => ({ ref: H.objective(o.objective.id), code: o.objective.code, title: o.objective.title, student_status: o.status })),
    current_student_state: {
      status: primary.status,
      confidence: primary.confidence,
      assessed_attempts: primary.state?.assessedAttempts ?? 0,
      success_rate_recent: primary.state?.successRateRecent == null ? null : Number(primary.state.successRateRecent),
      first_seen_at: primary.state?.firstSeenAt?.toISOString() ?? null,
      last_assessed_at: primary.state?.lastAssessedAt?.toISOString() ?? null,
    },
    relevant_recent_evidence: evidenceRows.map((e) => ({
      ref: H.evidence(e.id),
      objective_ref: H.objective(objectiveIdByLineage.get(e.objectiveLineageId) ?? e.objectiveId),
      occurred_at: e.occurredAt.toISOString(),
      prompt: clip(e.prompt, 500)!,
      student_response: clip(e.studentResponse, 500),
      result: e.result,
      correction: clip(e.correction, 500),
      graded_by: e.gradedBy,
    })),
    recurring_errors: recurring.map((r) => ({
      error_tag: r.errorTag,
      human_label: vocabulary[r.errorTag] ?? r.errorTag,
      occurrences: r.occurrences,
      last_seen_at: r.lastSeenAt.toISOString(),
      example_ref: r.evidenceIds.find((id) => evidenceIncluded.has(id)) ? H.evidence(r.evidenceIds.find((id) => evidenceIncluded.has(id))!) : null,
    })),
    mastered_relevant_concepts: masteredRelevant.map((o) => ({ ref: H.objective(o.objective.id), code: o.objective.code, title: o.objective.title, mastered_at: o.state?.lastAssessedAt?.toISOString() ?? null })),
    previous_lesson_summary: previousSummary,
    long_term: longTerm,
    lesson_plan: {
      planned_duration_minutes: plan.planned_duration_minutes,
      activities: plan.activities.slice(0, CONTEXT_CAPS.activities).map((a) => ({
        sequence: a.sequence,
        activity_type: a.activity_type,
        objective_ref: a.objective_id ? H.objective(a.objective_id) : null,
        skill_ref: a.skill_id ? H.skill(a.skill_id) : null,
        instructions: a.instructions,
        expected_evidence_count: a.expected_evidence_count,
        planned_minutes: a.planned_minutes,
      })),
    },
    pedagogical_constraints: {
      age_appropriate_for_years: age,
      instruction_language: enrolment.instructionLanguage,
      target_language: enrolment.targetLanguage,
      max_new_vocabulary_items: age !== null && age <= 7 ? 6 : 8,
      avoid_topics: [],
      reading_level: age === null ? null : age <= 6 ? "PRE_READER" : age <= 8 ? "EARLY_READER" : "FLUENT",
      session_minutes: plan.planned_duration_minutes,
      correction_style: "GENTLE_RECAST",
    },
    teacher_instructions: {
      source: access.role === "TEACHER" ? "TEACHER" : "PARENT",
      text: clip(instructions?.text ?? enrolment.goal ?? null, CONTEXT_CAPS.teacherInstructionChars),
      authored_at: instructions?.authored_at ?? null,
    },
  };

  const validated = contextPackSchema.parse(pack);
  const bytes = Buffer.byteLength(JSON.stringify(validated));
  if (bytes > CONTEXT_CAPS.maxBytes * 4) throw new ValidationError(`context pack too large: ${bytes} bytes`);

  await writeAudit(dbh, {
    actorUserId: access.userId,
    actorType: "USER",
    action: "context.build",
    resourceType: "lesson",
    resourceId: lesson?.id ?? null,
    studentId: access.studentId,
    result: "ALLOWED",
    requestId: access.requestId,
    metadata: { pack_id: validated.pack_id, context_version: validated.context_version, bytes },
  });
  if (lesson) {
    await dbh
      .update(s.lessons)
      .set({ metadata: { ...(lesson.metadata as Record<string, unknown>), context_packs: { ...((lesson.metadata as { context_packs?: Record<string, unknown> }).context_packs ?? {}), [validated.pack_id]: H.map } } })
      .where(eq(s.lessons.id, lesson.id));
  }
  return { pack: validated, handles: H.map, plan };
}

/** Resolves a handle issued for a lesson's pack, or null if it was never issued. */
export function resolveHandle(handles: HandleMap, kind: keyof HandleMap, handle: string): string | null {
  return handles[kind][handle] ?? null;
}
