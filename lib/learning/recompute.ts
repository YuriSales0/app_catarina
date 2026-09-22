import { and, eq, asc } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import { CURRENT_STATE_POLICY, applyObjectiveOverride } from "./state-policy";
import { evaluateObjectiveState, type StateDecision } from "./state-engine";
import { computeReviewSchedule } from "./review-scheduler";
import type { EvidenceRow } from "./evidence-view";
import { metric } from "@/lib/logging/logger";

/**
 * The only writer of student_objective_state and student_objective_review.
 * Called inside the same transaction as every evidence insert, and by the
 * rebuild script. Reads the ledger by objective lineage so evidence recorded
 * under an earlier curriculum version still counts (D8).
 */
export type RecomputeResult = {
  decision: StateDecision;
  changed: boolean;
  previous: { status: s.StudentObjectiveStateRow["status"]; confidence: s.StudentObjectiveStateRow["confidence"] } | null;
};

export async function loadEvidenceForObjective(dbh: DbOrTx, studentId: string, objectiveLineageId: string): Promise<EvidenceRow[]> {
  const rows = await dbh
    .select({
      id: s.learningEvidence.id,
      lessonId: s.learningEvidence.lessonId,
      result: s.learningEvidence.result,
      evidenceType: s.learningEvidence.evidenceType,
      gradedBy: s.learningEvidence.gradedBy,
      confidence: s.learningEvidence.confidence,
      supersedesEvidenceId: s.learningEvidence.supersedesEvidenceId,
      errorTags: s.learningEvidence.errorTags,
      occurredAt: s.learningEvidence.occurredAt,
    })
    .from(s.learningEvidence)
    .where(and(eq(s.learningEvidence.studentId, studentId), eq(s.learningEvidence.objectiveLineageId, objectiveLineageId)))
    .orderBy(asc(s.learningEvidence.occurredAt), asc(s.learningEvidence.id));
  return rows;
}

export async function recomputeObjectiveState(
  dbh: DbOrTx,
  input: { studentId: string; objectiveId: string; triggeredByEvidenceId?: string | null; now?: Date; recordTransition?: boolean },
): Promise<RecomputeResult> {
  const now = input.now ?? new Date();
  const recordTransition = input.recordTransition ?? true;
  const objective = await dbh.query.learningObjectives.findFirst({ where: eq(s.learningObjectives.id, input.objectiveId) });
  if (!objective) throw new Error(`objective ${input.objectiveId} not found`);
  const student = await dbh.query.students.findFirst({ where: eq(s.students.id, input.studentId) });
  if (!student) throw new Error(`student ${input.studentId} not found`);
  const version = await dbh.query.curriculumVersions.findFirst({ where: eq(s.curriculumVersions.id, objective.curriculumVersionId) });
  const curriculum = version ? await dbh.query.curricula.findFirst({ where: eq(s.curricula.id, version.curriculumId) }) : null;
  if (!curriculum) throw new Error("objective has no curriculum");

  const policy = applyObjectiveOverride(CURRENT_STATE_POLICY, objective.assessmentPolicy);
  const evidence = await loadEvidenceForObjective(dbh, input.studentId, objective.lineageId);
  const decision = evaluateObjectiveState(evidence, policy, student.timezone, now);
  const schedule = computeReviewSchedule(evidence, policy.partialCreditScore);

  const existing = await dbh.query.studentObjectiveState.findFirst({
    where: and(eq(s.studentObjectiveState.studentId, input.studentId), eq(s.studentObjectiveState.objectiveId, input.objectiveId)),
  });

  const values = {
    studentId: input.studentId,
    objectiveId: input.objectiveId,
    objectiveLineageId: objective.lineageId,
    subjectId: curriculum.subjectId,
    status: decision.status,
    confidence: decision.confidence,
    assessedAttempts: decision.assessedAttempts,
    successRateRecent: decision.successRateRecent === null ? null : decision.successRateRecent.toFixed(3),
    distinctLessonCount: decision.distinctLessonCount,
    hasHumanOrSystemGradedEvidence: decision.hasHumanOrSystemGradedEvidence,
    firstSeenAt: decision.firstSeenAt,
    lastAssessedAt: decision.lastAssessedAt,
    proficientSince: decision.proficientSince,
    ruleVersion: decision.ruleVersion,
    decidedByEvidenceIds: decision.decidedByEvidenceIds,
    computedAt: now,
  };

  if (existing) {
    await dbh.update(s.studentObjectiveState).set(values).where(eq(s.studentObjectiveState.id, existing.id));
  } else {
    await dbh.insert(s.studentObjectiveState).values(values);
  }

  const reviewValues = {
    studentId: input.studentId,
    objectiveId: input.objectiveId,
    subjectId: curriculum.subjectId,
    introducedAt: schedule.introducedAt,
    lastPractisedAt: schedule.lastPractisedAt,
    lastSuccessAt: schedule.lastSuccessAt,
    reviewCount: schedule.reviewCount,
    failureCount: schedule.failureCount,
    intervalDays: schedule.intervalDays,
    nextReviewAt: schedule.nextReviewAt,
    schedulerVersion: schedule.schedulerVersion,
  };
  const existingReview = await dbh.query.studentObjectiveReview.findFirst({
    where: and(eq(s.studentObjectiveReview.studentId, input.studentId), eq(s.studentObjectiveReview.objectiveId, input.objectiveId)),
  });
  if (existingReview) await dbh.update(s.studentObjectiveReview).set(reviewValues).where(eq(s.studentObjectiveReview.id, existingReview.id));
  else await dbh.insert(s.studentObjectiveReview).values(reviewValues);

  const previous = existing ? { status: existing.status, confidence: existing.confidence } : null;
  const changed = !existing || existing.status !== decision.status || existing.confidence !== decision.confidence;

  if (changed && recordTransition) {
    await dbh.insert(s.studentObjectiveStateTransition).values({
      studentId: input.studentId,
      objectiveId: input.objectiveId,
      fromStatus: existing?.status ?? "NOT_STARTED",
      toStatus: decision.status,
      fromConfidence: existing?.confidence ?? "LOW",
      toConfidence: decision.confidence,
      ruleVersion: decision.ruleVersion,
      triggeredByEvidenceId: input.triggeredByEvidenceId ?? null,
      decidedByEvidenceIds: decision.decidedByEvidenceIds,
      rationale: decision.rationale,
    });
    metric("state_transition", {
      studentId: input.studentId,
      objectiveId: input.objectiveId,
      from: existing?.status ?? "NOT_STARTED",
      to: decision.status,
    });
  }

  return { decision, changed, previous };
}
