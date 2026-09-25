import { and, asc, desc, eq, inArray, sql, isNull } from "drizzle-orm";
import { recordPlacementResultIfAny } from "./placement";
import { db } from "@/lib/db/client";
import type { DbOrTx, Tx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/authorization/errors";
import { roleAllows } from "@/lib/authorization/permissions";
import { writeAudit } from "@/lib/audit/write";
import { metric } from "@/lib/logging/logger";
import { recomputeObjectiveState } from "@/lib/learning/recompute";
import { getStudentProgress } from "@/lib/learning/progress";
import { buildLessonStructure } from "./structure";
import { decideOpening } from "./opening";
import { nextLessonPlanSchema, PLAN_VERSION, type NextLessonPlan } from "@/schemas/lesson-plan";
import type { CreateManualLessonInput, RecordEvidenceInput, RecordEventInput, CompleteLessonInput, CorrectEvidenceInput } from "@/schemas/lessons";
import { generateSystemReport } from "./report";
import { generateSnapshot } from "@/lib/snapshots/generate";

export const MANUAL_ENGINE_VERSION = "manual.v1";

function requireCapability(access: StudentAccess, cap: "RUN_LESSON" | "RECORD_EVIDENCE") {
  if (!roleAllows(access.role, cap)) throw new NotFoundError();
}

/** Builds a validated manual plan: the parent picks the objective; the prerequisite gate still applies. */
export async function buildManualPlan(access: StudentAccess, input: CreateManualLessonInput, dbh: DbOrTx = db()): Promise<NextLessonPlan> {
  const progress = await getStudentProgress(access, input.subjectId, dbh);
  const primary = progress.objectives.find((o) => o.objective.id === input.primaryObjectiveId);
  if (!primary) throw new ValidationError("That objective is not in the student's curriculum.");
  if (!primary.unlock.unlocked) {
    const blockers = primary.unlock.hardBlockers.map((b) => progress.objectives.find((o) => o.objective.id === b.prerequisiteObjectiveId)?.objective.code ?? b.prerequisiteObjectiveId);
    throw new ValidationError(`"${primary.objective.title}" is locked until ${blockers.join(", ")} reaches the required level.`);
  }
  if (primary.status === "MASTERED") throw new ValidationError("That objective is already mastered; choose it as a review instead.");
  const reviews = input.reviewObjectiveIds
    .map((id) => progress.objectives.find((o) => o.objective.id === id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o) && o!.objective.id !== primary.objective.id);
  const minutes = input.plannedDurationMinutes ?? progress.enrolment.plannedLessonMinutes;
  const completedOnVersion = await dbh.query.lessons.findFirst({
    where: and(eq(s.lessons.studentId, access.studentId), eq(s.lessons.subjectId, input.subjectId), eq(s.lessons.curriculumVersionId, progress.version.id), eq(s.lessons.status, "COMPLETED")),
    columns: { id: true },
  });
  const opening = decideOpening({
    completedLessonsOnVersion: completedOnVersion ? 1 : 0,
    unitName: primary.unit.name,
    unitObjectives: progress.objectives.filter((o) => o.unit.id === primary.unit.id).map((o) => ({ id: o.objective.id, title: o.objective.title, status: o.status })),
  });

  const plan: NextLessonPlan = {
    plan_version: PLAN_VERSION,
    engine_version: MANUAL_ENGINE_VERSION,
    source: "MANUAL",
    generated_at: new Date().toISOString(),
    student_id: access.studentId,
    subject_id: input.subjectId,
    curriculum_version_id: progress.version.id,
    outcome: "PLANNED",
    primary_objective: { id: primary.objective.id, code: primary.objective.code, title: primary.objective.title, status: primary.status, confidence: primary.confidence },
    review_objectives: reviews.map((r) => ({
      id: r.objective.id,
      code: r.objective.code,
      title: r.objective.title,
      status: r.status,
      confidence: r.confidence,
      days_overdue: r.review?.nextReviewAt ? Math.floor((Date.now() - r.review.nextReviewAt.getTime()) / 86_400_000) : null,
    })),
    blocking_objectives: [],
    planned_duration_minutes: minutes,
    activities: buildLessonStructure(
      { id: primary.objective.id, title: primary.objective.title, status: primary.status },
      reviews.map((r) => ({ id: r.objective.id, title: r.objective.title, status: r.status })),
      minutes,
      opening,
    ),
    opening,
    placement_test: null,
    rationale: {
      selected_because: [{ kind: "MANUAL_SELECTION", by_user_id: access.userId }],
      prerequisites_satisfied: primary.unlock.satisfied.map((p) => ({
        objective_code: progress.objectives.find((o) => o.objective.id === p.prerequisiteObjectiveId)?.objective.code ?? p.prerequisiteObjectiveId,
        status: p.actual,
      })),
      alternatives_rejected: [],
      score_breakdown: [],
      policy_version: MANUAL_ENGINE_VERSION,
    },
    candidates_considered: progress.summary.unlocked,
  };
  return nextLessonPlanSchema.parse(plan);
}

/** Persists a plan as a PLANNED lesson with its activities. Lesson numbers are allocated under an advisory lock. */
export async function createLessonFromPlan(access: StudentAccess, plan: NextLessonPlan, opts: { idempotencyKey?: string } = {}, dbh: DbOrTx = db()) {
  requireCapability(access, "RUN_LESSON");
  if (plan.student_id !== access.studentId) throw new NotFoundError();
  if (plan.outcome !== "PLANNED" || !plan.primary_objective) throw new ValidationError("This plan has no lesson to create.");
  const validated = nextLessonPlanSchema.parse(plan);

  return dbh.transaction(async (tx) => {
    if (opts.idempotencyKey) {
      const existing = await tx.query.lessons.findFirst({ where: and(eq(s.lessons.studentId, access.studentId), eq(s.lessons.idempotencyKey, opts.idempotencyKey)) });
      // A repeated request gets the same lesson, unless that lesson was cancelled: then it is a new request.
      if (existing && existing.status !== "CANCELLED") return existing;
      if (existing) opts = { ...opts, idempotencyKey: undefined };
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${access.studentId + ":" + validated.subject_id}))`);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${s.lessons.lessonNumber}), 0) + 1` })
      .from(s.lessons)
      .where(and(eq(s.lessons.studentId, access.studentId), eq(s.lessons.subjectId, validated.subject_id)));

    const [lesson] = await tx
      .insert(s.lessons)
      .values({
        studentId: access.studentId,
        subjectId: validated.subject_id,
        curriculumVersionId: validated.curriculum_version_id,
        primaryObjectiveId: validated.primary_objective!.id,
        lessonNumber: Number(next),
        plannedDurationMinutes: validated.planned_duration_minutes,
        status: "PLANNED",
        planPayload: validated,
        planEngineVersion: validated.engine_version,
        idempotencyKey: opts.idempotencyKey ?? null,
        createdByUserId: access.userId,
      })
      .returning();
    if (validated.activities.length) {
      await tx.insert(s.lessonActivities).values(
        validated.activities.map((a) => ({
          lessonId: lesson.id,
          studentId: access.studentId,
          sequence: a.sequence,
          activityType: a.activity_type,
          objectiveId: a.objective_id,
          skillId: a.skill_id,
          instructions: a.instructions,
          expectedEvidenceCount: a.expected_evidence_count,
          plannedMinutes: a.planned_minutes,
        })),
      );
    }
    await writeAudit(tx, {
      actorUserId: access.userId,
      actorType: "USER",
      action: "lesson.create",
      resourceType: "lesson",
      resourceId: lesson.id,
      studentId: access.studentId,
      result: "ALLOWED",
      requestId: access.requestId,
      metadata: { source: validated.source, engine: validated.engine_version },
    });
    return lesson;
  });
}

export async function createManualLesson(access: StudentAccess, input: CreateManualLessonInput, dbh: DbOrTx = db()) {
  const plan = await buildManualPlan(access, input, dbh);
  return createLessonFromPlan(access, plan, { idempotencyKey: input.idempotencyKey }, dbh);
}

async function loadOwnedLesson(tx: DbOrTx, access: StudentAccess, lessonId: string, forUpdate = false) {
  const lesson = forUpdate
    ? (await tx.select().from(s.lessons).where(and(eq(s.lessons.id, lessonId), eq(s.lessons.studentId, access.studentId))).for("update"))[0]
    : await tx.query.lessons.findFirst({ where: and(eq(s.lessons.id, lessonId), eq(s.lessons.studentId, access.studentId)) });
  if (!lesson) throw new NotFoundError();
  return lesson;
}

async function appendEvent(tx: Tx, access: StudentAccess, lessonId: string, eventType: s.LessonEventRow["eventType"], payload: Record<string, unknown>, activityId: string | null = null) {
  const [{ next }] = await tx
    .select({ next: sql<number>`coalesce(max(${s.lessonEvents.sequence}), 0) + 1` })
    .from(s.lessonEvents)
    .where(eq(s.lessonEvents.lessonId, lessonId));
  const [row] = await tx
    .insert(s.lessonEvents)
    .values({ lessonId, studentId: access.studentId, activityId, eventType, sequence: Number(next), payload })
    .returning();
  return row;
}

export async function startLesson(access: StudentAccess, lessonId: string, dbh: DbOrTx = db()) {
  requireCapability(access, "RUN_LESSON");
  return dbh.transaction(async (tx) => {
    const lesson = await loadOwnedLesson(tx, access, lessonId, true);
    if (lesson.status === "IN_PROGRESS") return lesson;
    if (lesson.status !== "PLANNED") throw new ConflictError(`Lesson is ${lesson.status.toLowerCase()} and cannot be started.`);
    const [updated] = await tx.update(s.lessons).set({ status: "IN_PROGRESS", startedAt: new Date() }).where(eq(s.lessons.id, lesson.id)).returning();
    await appendEvent(tx, access, lesson.id, "LESSON_STARTED", { by_user_id: access.userId });
    metric("lesson_started", { studentId: access.studentId, lessonId: lesson.id });
    return updated;
  });
}

export async function recordLessonEvent(access: StudentAccess, input: RecordEventInput, dbh: DbOrTx = db()) {
  requireCapability(access, "RUN_LESSON");
  return dbh.transaction(async (tx) => {
    const lesson = await loadOwnedLesson(tx, access, input.lessonId, true);
    const alwaysAllowed = input.eventType === "TEACHER_NOTE" || input.eventType === "AI_PROPOSAL_RECEIVED" || input.eventType === "AI_PROPOSAL_REJECTED";
    if (!alwaysAllowed && lesson.status !== "IN_PROGRESS") throw new ConflictError("Lesson is not in progress.");
    if (input.activityId) {
      const act = await tx.query.lessonActivities.findFirst({ where: and(eq(s.lessonActivities.id, input.activityId), eq(s.lessonActivities.lessonId, lesson.id)) });
      if (!act) throw new NotFoundError();
    }
    return appendEvent(tx, access, lesson.id, input.eventType, input.payload, input.activityId ?? null);
  });
}

/**
 * The only path that creates OBSERVED facts. Validates that the objective is in
 * the student's curriculum, appends the ledger row, and recomputes derived
 * state in the same transaction.
 */
export async function recordEvidence(access: StudentAccess, input: RecordEvidenceInput, grader: { gradedBy: s.LearningEvidenceRow["gradedBy"]; graderRef?: s.GraderRef } = { gradedBy: "HUMAN" }, dbh: DbOrTx = db()) {
  requireCapability(access, "RECORD_EVIDENCE");
  return dbh.transaction(async (tx) => {
    const objective = await tx.query.learningObjectives.findFirst({ where: eq(s.learningObjectives.id, input.objectiveId) });
    if (!objective) throw new NotFoundError();
    const version = (await tx.query.curriculumVersions.findFirst({ where: eq(s.curriculumVersions.id, objective.curriculumVersionId) }))!;
    const curriculum = (await tx.query.curricula.findFirst({ where: eq(s.curricula.id, version.curriculumId) }))!;
    const enrolment = await tx.query.studentSubjects.findFirst({
      where: and(eq(s.studentSubjects.studentId, access.studentId), eq(s.studentSubjects.subjectId, curriculum.subjectId)),
    });
    if (!enrolment) throw new ValidationError("The student is not enrolled in this subject.");

    let lesson: s.LessonRow | null = null;
    if (input.lessonId) {
      lesson = await loadOwnedLesson(tx, access, input.lessonId, true);
      if (lesson.status !== "IN_PROGRESS") throw new ConflictError("Lesson is not in progress.");
      if (input.activityId) {
        const act = await tx.query.lessonActivities.findFirst({ where: and(eq(s.lessonActivities.id, input.activityId), eq(s.lessonActivities.lessonId, lesson.id)) });
        if (!act) throw new NotFoundError();
      }
    }
    const unknownTags = input.errorTags.filter((t) => !(t in version.errorTagVocabulary));
    if (unknownTags.length) throw new ValidationError(`Unknown error tags for this curriculum: ${unknownTags.join(", ")}`);

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"evidence:" + access.studentId + ":" + input.objectiveId}))`);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${s.learningEvidence.attemptNumber}), 0) + 1` })
      .from(s.learningEvidence)
      .where(
        and(
          eq(s.learningEvidence.studentId, access.studentId),
          eq(s.learningEvidence.objectiveId, input.objectiveId),
          input.lessonId ? eq(s.learningEvidence.lessonId, input.lessonId) : isNull(s.learningEvidence.lessonId),
          input.activityId ? eq(s.learningEvidence.activityId, input.activityId) : isNull(s.learningEvidence.activityId),
        ),
      );

    const [row] = await tx
      .insert(s.learningEvidence)
      .values({
        studentId: access.studentId,
        subjectId: curriculum.subjectId,
        lessonId: lesson?.id ?? null,
        activityId: input.activityId ?? null,
        objectiveId: objective.id,
        objectiveLineageId: objective.lineageId,
        skillId: input.skillId ?? null,
        attemptNumber: Number(next),
        prompt: input.prompt,
        studentResponse: input.studentResponse ?? null,
        expectedResponse: input.expectedResponse ?? null,
        result: input.result,
        correction: input.correction ?? null,
        evidenceType: input.evidenceType,
        confidence: input.confidence,
        gradedBy: grader.gradedBy,
        graderRef: grader.graderRef ?? (grader.gradedBy === "HUMAN" ? { userId: access.userId } : {}),
        errorTags: input.errorTags,
        occurredAt: input.occurredAt ?? new Date(),
      })
      .returning();

    if (lesson) {
      await appendEvent(
        tx,
        access,
        lesson.id,
        input.evidenceType === "ASSESSMENT" ? "ASSESSMENT_RESULT" : "STUDENT_RESPONSE",
        { evidence_id: row.id, objective_id: objective.id, result: row.result, graded_by: row.gradedBy },
        input.activityId ?? null,
      );
    }
    const state = await recomputeObjectiveState(tx, { studentId: access.studentId, objectiveId: objective.id, triggeredByEvidenceId: row.id });
    metric("evidence_recorded", { studentId: access.studentId, objectiveId: objective.id, result: row.result, gradedBy: row.gradedBy });
    return { evidence: row, state };
  });
}

/** A mistake is fixed by a new row; the original stays. */
export async function correctEvidence(access: StudentAccess, input: CorrectEvidenceInput, dbh: DbOrTx = db()) {
  requireCapability(access, "RECORD_EVIDENCE");
  return dbh.transaction(async (tx) => {
    const original = await tx.query.learningEvidence.findFirst({ where: and(eq(s.learningEvidence.id, input.evidenceId), eq(s.learningEvidence.studentId, access.studentId)) });
    if (!original) throw new NotFoundError();
    if (original.evidenceType === "CORRECTION" || original.evidenceType === "RETRACTION") throw new ValidationError("Correct the original row, not a correction.");
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${s.learningEvidence.attemptNumber}), 0) + 1` })
      .from(s.learningEvidence)
      .where(
        and(
          eq(s.learningEvidence.studentId, access.studentId),
          eq(s.learningEvidence.objectiveId, original.objectiveId),
          original.lessonId ? eq(s.learningEvidence.lessonId, original.lessonId) : isNull(s.learningEvidence.lessonId),
          original.activityId ? eq(s.learningEvidence.activityId, original.activityId) : isNull(s.learningEvidence.activityId),
        ),
      );
    const [row] = await tx
      .insert(s.learningEvidence)
      .values({
        studentId: original.studentId,
        subjectId: original.subjectId,
        lessonId: original.lessonId,
        activityId: original.activityId,
        objectiveId: original.objectiveId,
        objectiveLineageId: original.objectiveLineageId,
        skillId: original.skillId,
        attemptNumber: Number(next),
        prompt: original.prompt,
        studentResponse: original.studentResponse,
        expectedResponse: original.expectedResponse,
        result: input.mode === "RETRACTION" ? "NOT_ASSESSED" : (input.result ?? original.result),
        correction: input.correction ?? original.correction,
        evidenceType: input.mode,
        confidence: original.confidence,
        gradedBy: "HUMAN",
        graderRef: { userId: access.userId, method: input.mode.toLowerCase() },
        supersedesEvidenceId: original.id,
        errorTags: original.errorTags,
        metadata: { reason: input.reason },
        occurredAt: new Date(),
      })
      .returning();
    await writeAudit(tx, {
      actorUserId: access.userId,
      actorType: "USER",
      action: `evidence.${input.mode.toLowerCase()}`,
      resourceType: "learning_evidence",
      resourceId: original.id,
      studentId: access.studentId,
      result: "ALLOWED",
      requestId: access.requestId,
      metadata: { newEvidenceId: row.id },
    });
    const state = await recomputeObjectiveState(tx, { studentId: access.studentId, objectiveId: original.objectiveId, triggeredByEvidenceId: row.id });
    return { evidence: row, state };
  });
}

export async function completeLesson(access: StudentAccess, input: CompleteLessonInput, dbh: DbOrTx = db()) {
  requireCapability(access, "RUN_LESSON");
  return dbh.transaction(async (tx) => {
    const lesson = await loadOwnedLesson(tx, access, input.lessonId, true);
    if (lesson.status === "COMPLETED") {
      const existing = await tx.query.lessonReports.findFirst({ where: eq(s.lessonReports.lessonId, lesson.id), orderBy: desc(s.lessonReports.generatedAt) });
      return { lesson, report: existing };
    }
    if (lesson.status !== "IN_PROGRESS") throw new ConflictError("Only a lesson in progress can be completed.");
    if (input.teacherNote) await appendEvent(tx, access, lesson.id, "TEACHER_NOTE", { text: input.teacherNote, by_user_id: access.userId });
    const completedAt = new Date();
    const actual = input.actualDurationMinutes ?? (lesson.startedAt ? Math.max(1, Math.round((completedAt.getTime() - lesson.startedAt.getTime()) / 60_000)) : null);
    const [updated] = await tx
      .update(s.lessons)
      .set({ status: "COMPLETED", completedAt, actualDurationMinutes: actual })
      .where(eq(s.lessons.id, lesson.id))
      .returning();
    await appendEvent(tx, access, lesson.id, "LESSON_COMPLETED", { by_user_id: access.userId, actual_duration_minutes: actual });
    const report = await generateSystemReport(tx, access, updated);
    // A level check stores its suggested starting point for the family to confirm.
    await recordPlacementResultIfAny(tx, updated, completedAt);
    await generateSnapshot(access, { scope: "STUDENT", trigger: "LESSON_COMPLETED", now: completedAt }, tx);
    metric("lesson_completed", { studentId: access.studentId, lessonId: lesson.id });
    return { lesson: updated, report };
  });
}

export async function cancelLesson(access: StudentAccess, lessonId: string, dbh: DbOrTx = db()) {
  requireCapability(access, "RUN_LESSON");
  return dbh.transaction(async (tx) => {
    const lesson = await loadOwnedLesson(tx, access, lessonId, true);
    if (lesson.status === "COMPLETED") throw new ConflictError("A completed lesson cannot be cancelled.");
    if (lesson.status === "CANCELLED") return lesson;
    const [updated] = await tx.update(s.lessons).set({ status: "CANCELLED" }).where(eq(s.lessons.id, lesson.id)).returning();
    await appendEvent(tx, access, lesson.id, "LESSON_CANCELLED", { by_user_id: access.userId });
    return updated;
  });
}

export async function getLesson(access: StudentAccess, lessonId: string, dbh: DbOrTx = db()) {
  const lesson = await dbh.query.lessons.findFirst({ where: and(eq(s.lessons.id, lessonId), eq(s.lessons.studentId, access.studentId)) });
  if (!lesson) throw new NotFoundError();
  const [activities, events, evidence, reports, subject, version, primary] = await Promise.all([
    dbh.query.lessonActivities.findMany({ where: eq(s.lessonActivities.lessonId, lesson.id), orderBy: asc(s.lessonActivities.sequence) }),
    dbh.query.lessonEvents.findMany({ where: eq(s.lessonEvents.lessonId, lesson.id), orderBy: asc(s.lessonEvents.sequence) }),
    dbh.query.learningEvidence.findMany({ where: eq(s.learningEvidence.lessonId, lesson.id), orderBy: asc(s.learningEvidence.createdAt) }),
    dbh.query.lessonReports.findMany({ where: eq(s.lessonReports.lessonId, lesson.id), orderBy: desc(s.lessonReports.generatedAt) }),
    dbh.query.subjects.findFirst({ where: eq(s.subjects.id, lesson.subjectId) }),
    dbh.query.curriculumVersions.findFirst({ where: eq(s.curriculumVersions.id, lesson.curriculumVersionId) }),
    dbh.query.learningObjectives.findFirst({ where: eq(s.learningObjectives.id, lesson.primaryObjectiveId) }),
  ]);
  const objectiveIds = [...new Set(activities.map((a) => a.objectiveId).filter((x): x is string => Boolean(x)))];
  const objectives = objectiveIds.length ? await dbh.query.learningObjectives.findMany({ where: inArray(s.learningObjectives.id, objectiveIds) }) : [];
  return { lesson, activities, events, evidence, report: reports[0] ?? null, subject: subject!, version: version!, primaryObjective: primary!, objectives };
}

export async function listLessons(access: StudentAccess, subjectId?: string, limit = 20, dbh: DbOrTx = db()) {
  return dbh
    .select({
      id: s.lessons.id,
      lessonNumber: s.lessons.lessonNumber,
      status: s.lessons.status,
      subjectId: s.lessons.subjectId,
      subjectName: s.subjects.name,
      primaryObjectiveId: s.lessons.primaryObjectiveId,
      primaryObjectiveTitle: s.learningObjectives.title,
      plannedDurationMinutes: s.lessons.plannedDurationMinutes,
      actualDurationMinutes: s.lessons.actualDurationMinutes,
      planEngineVersion: s.lessons.planEngineVersion,
      createdAt: s.lessons.createdAt,
      startedAt: s.lessons.startedAt,
      completedAt: s.lessons.completedAt,
    })
    .from(s.lessons)
    .innerJoin(s.subjects, eq(s.subjects.id, s.lessons.subjectId))
    .innerJoin(s.learningObjectives, eq(s.learningObjectives.id, s.lessons.primaryObjectiveId))
    .where(and(eq(s.lessons.studentId, access.studentId), subjectId ? eq(s.lessons.subjectId, subjectId) : undefined))
    .orderBy(desc(s.lessons.createdAt))
    .limit(limit);
}

/** Chronological record: lessons and evidence, oldest first. */
export async function getLearningHistory(access: StudentAccess, subjectId?: string, dbh: DbOrTx = db()) {
  const lessons = await dbh.query.lessons.findMany({
    where: and(eq(s.lessons.studentId, access.studentId), subjectId ? eq(s.lessons.subjectId, subjectId) : undefined),
    orderBy: asc(s.lessons.createdAt),
  });
  const evidence = await dbh
    .select({
      id: s.learningEvidence.id,
      lessonId: s.learningEvidence.lessonId,
      objectiveId: s.learningEvidence.objectiveId,
      objectiveTitle: s.learningObjectives.title,
      objectiveCode: s.learningObjectives.code,
      result: s.learningEvidence.result,
      evidenceType: s.learningEvidence.evidenceType,
      gradedBy: s.learningEvidence.gradedBy,
      prompt: s.learningEvidence.prompt,
      studentResponse: s.learningEvidence.studentResponse,
      errorTags: s.learningEvidence.errorTags,
      supersedesEvidenceId: s.learningEvidence.supersedesEvidenceId,
      occurredAt: s.learningEvidence.occurredAt,
    })
    .from(s.learningEvidence)
    .innerJoin(s.learningObjectives, eq(s.learningObjectives.id, s.learningEvidence.objectiveId))
    .where(and(eq(s.learningEvidence.studentId, access.studentId), subjectId ? eq(s.learningEvidence.subjectId, subjectId) : undefined))
    .orderBy(asc(s.learningEvidence.occurredAt));
  const transitions = await dbh.query.studentObjectiveStateTransition.findMany({
    where: eq(s.studentObjectiveStateTransition.studentId, access.studentId),
    orderBy: asc(s.studentObjectiveStateTransition.createdAt),
  });
  return { lessons, evidence, transitions };
}
