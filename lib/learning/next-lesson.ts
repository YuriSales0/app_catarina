import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import { NotFoundError } from "@/lib/authorization/errors";
import { getStudentProgress } from "./progress";
import { selectNextObjective, type EngineInput, type EngineObjective } from "./engine";
import { CURRENT_ENGINE_POLICY, ENGINE_VERSION } from "./engine-policy";
import { findRecurringErrors, RECURRING_ERROR_POLICY } from "@/lib/assessment/recurring-errors";
import { buildLessonStructure } from "@/lib/lessons/structure";
import { decideOpening } from "@/lib/lessons/opening";
import { nextLessonPlanSchema, PLAN_VERSION, type NextLessonPlan } from "@/schemas/lesson-plan";
import { effectiveEvidence, isAssessed, type EvidenceRow } from "./evidence-view";

/**
 * Load, compute, plan. The I/O boundary around the pure engine. Returns a
 * validated NextLessonPlan whose rationale is what the parent sees when asking
 * "why is she learning this?".
 */
export async function getNextLessonPlan(
  access: StudentAccess,
  subjectId: string,
  opts: { now?: Date; lessonMinutes?: number } = {},
  dbh: DbOrTx = db(),
): Promise<NextLessonPlan> {
  const now = opts.now ?? new Date();
  let progress;
  try {
    progress = await getStudentProgress(access, subjectId, dbh, now);
  } catch (err) {
    if (err instanceof NotFoundError) {
      const enrolment = await dbh.query.studentSubjects.findFirst({ where: and(eq(s.studentSubjects.studentId, access.studentId), eq(s.studentSubjects.subjectId, subjectId)) });
      if (!enrolment) throw err;
      return nextLessonPlanSchema.parse(emptyPlan(access.studentId, subjectId, "00000000-0000-7000-8000-000000000000", "NEEDS_CURRICULUM", now, enrolment.plannedLessonMinutes));
    }
    throw err;
  }

  const since = new Date(now.getTime() - RECURRING_ERROR_POLICY.windowDays * 86_400_000);
  const [windowEvidence, recentLessons] = await Promise.all([
    dbh.query.learningEvidence.findMany({
      where: and(eq(s.learningEvidence.studentId, access.studentId), eq(s.learningEvidence.subjectId, subjectId), gte(s.learningEvidence.occurredAt, since)),
    }),
    dbh.query.lessons.findMany({
      where: and(eq(s.lessons.studentId, access.studentId), eq(s.lessons.subjectId, subjectId), inArray(s.lessons.status, ["COMPLETED", "IN_PROGRESS", "PLANNED"])),
      orderBy: desc(s.lessons.createdAt),
      limit: 10,
    }),
  ]);
  const recurring = findRecurringErrors(
    windowEvidence.map((r) => ({ id: r.id, lessonId: r.lessonId, objectiveId: r.objectiveId, errorTags: r.errorTags, occurredAt: r.occurredAt })),
    now,
  );

  // Success within the last N lessons of each objective.
  const successWithinWindow = new Set<string>();
  const lessonIdsByObjective = new Map<string, string[]>();
  for (const l of recentLessons) {
    if (l.status !== "COMPLETED") continue;
    const list = lessonIdsByObjective.get(l.primaryObjectiveId) ?? [];
    if (list.length < CURRENT_ENGINE_POLICY.noSuccessWindow) list.push(l.id);
    lessonIdsByObjective.set(l.primaryObjectiveId, list);
  }
  const allRecentIds = [...lessonIdsByObjective.values()].flat();
  const recentEvidence = allRecentIds.length ? await dbh.query.learningEvidence.findMany({ where: inArray(s.learningEvidence.lessonId, allRecentIds) }) : [];
  for (const [objectiveId, ids] of lessonIdsByObjective) {
    const rows: EvidenceRow[] = recentEvidence
      .filter((e) => e.objectiveId === objectiveId && ids.includes(e.lessonId!))
      .map((r) => ({ id: r.id, lessonId: r.lessonId, result: r.result, evidenceType: r.evidenceType, gradedBy: r.gradedBy, confidence: r.confidence, supersedesEvidenceId: r.supersedesEvidenceId, errorTags: r.errorTags, occurredAt: r.occurredAt }));
    if (effectiveEvidence(rows).some((r) => isAssessed(r) && r.result !== "INCORRECT")) successWithinWindow.add(objectiveId);
  }

  const unitOrder = new Map<string, number>();
  progress.objectives.forEach((o, i) => {
    if (!unitOrder.has(o.unit.id)) unitOrder.set(o.unit.id, i);
  });
  const objectives: EngineObjective[] = progress.objectives.map((o) => ({
    id: o.objective.id,
    code: o.objective.code,
    title: o.objective.title,
    lineageId: o.objective.lineageId,
    unitKey: o.unit.unitKey,
    unitOrder: unitOrder.get(o.unit.id)!,
    sequence: o.objective.sequence,
    difficulty: o.objective.difficulty,
    unitActive: true,
    status: o.status,
    confidence: o.confidence,
    decidedByEvidenceIds: o.state?.decidedByEvidenceIds ?? [],
    proficientSince: o.state?.proficientSince ?? null,
    nextReviewAt: o.review?.nextReviewAt ?? null,
    lastSuccessAt: o.review?.lastSuccessAt ?? null,
  }));

  const input: EngineInput = {
    objectives,
    edges: progress.edges,
    recurringErrors: recurring.map((r) => ({ errorTag: r.errorTag, occurrences: r.occurrences, lessonIds: r.lessonIds, objectiveIds: r.objectiveIds })),
    recentLessons: recentLessons.map((l) => ({ id: l.id, primaryObjectiveId: l.primaryObjectiveId, completedAt: l.completedAt, status: l.status })),
    successWithinWindow,
    now,
    hasCurriculum: true,
  };
  const decision = selectNextObjective(input, CURRENT_ENGINE_POLICY);
  const completedOnVersion = await dbh.query.lessons.findFirst({
    where: and(eq(s.lessons.studentId, access.studentId), eq(s.lessons.subjectId, subjectId), eq(s.lessons.curriculumVersionId, progress.version.id), eq(s.lessons.status, "COMPLETED")),
    columns: { id: true },
  });
  const primaryRow = decision.primary ? progress.objectives.find((o) => o.objective.id === decision.primary!.objective.id) : null;
  const opening = primaryRow
    ? decideOpening({
        completedLessonsOnVersion: completedOnVersion ? 1 : 0,
        unitName: primaryRow.unit.name,
        unitObjectives: progress.objectives.filter((o) => o.unit.id === primaryRow.unit.id).map((o) => ({ id: o.objective.id, title: o.objective.title, status: o.status })),
      })
    : null;
  const minutes = opts.lessonMinutes ?? progress.enrolment.plannedLessonMinutes;
  const codeOf = (id: string) => objectives.find((o) => o.id === id)?.code ?? id;
  const summary = (o: EngineObjective) => ({ id: o.id, code: o.code, title: o.title, status: o.status, confidence: o.confidence });

  const plan: NextLessonPlan = {
    plan_version: PLAN_VERSION,
    engine_version: ENGINE_VERSION,
    source: "ENGINE",
    generated_at: now.toISOString(),
    student_id: access.studentId,
    subject_id: subjectId,
    curriculum_version_id: progress.version.id,
    outcome: decision.outcome,
    primary_objective: decision.primary ? summary(decision.primary.objective) : null,
    review_objectives: decision.reviews.map((r) => ({ ...summary(r.objective), days_overdue: r.daysOverdue })),
    blocking_objectives: decision.blocking.map(summary),
    planned_duration_minutes: minutes,
    activities: decision.primary
      ? buildLessonStructure(
          { id: decision.primary.objective.id, title: decision.primary.objective.title, status: decision.primary.objective.status },
          decision.reviews.map((r) => ({ id: r.objective.id, title: r.objective.title, status: r.objective.status })),
          minutes,
          opening,
        )
      : [],
    opening,
    rationale: {
      selected_because: decision.primary?.reasons ?? [],
      prerequisites_satisfied: (decision.primary?.unlock.satisfied ?? []).map((p) => ({ objective_code: codeOf(p.prerequisiteObjectiveId), status: p.actual })),
      alternatives_rejected: decision.rejected,
      score_breakdown: decision.primary?.breakdown ?? [],
      policy_version: decision.policyVersion,
    },
    candidates_considered: decision.candidatesConsidered,
  };
  return nextLessonPlanSchema.parse(plan);
}

function emptyPlan(studentId: string, subjectId: string, versionId: string, outcome: NextLessonPlan["outcome"], now: Date, minutes: number): NextLessonPlan {
  return {
    plan_version: PLAN_VERSION,
    engine_version: ENGINE_VERSION,
    source: "ENGINE",
    generated_at: now.toISOString(),
    student_id: studentId,
    subject_id: subjectId,
    curriculum_version_id: versionId,
    outcome,
    primary_objective: null,
    review_objectives: [],
    blocking_objectives: [],
    planned_duration_minutes: minutes,
    activities: [],
    opening: null,
    rationale: { selected_because: [], prerequisites_satisfied: [], alternatives_rejected: [], score_breakdown: [], policy_version: CURRENT_ENGINE_POLICY.version },
    candidates_considered: 0,
  };
}
