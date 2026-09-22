import { pgTable, text, uuid, integer, numeric, boolean, jsonb, index, unique } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt, ts } from "./_common";
import { objectiveStatusEnum, confidenceLevelEnum } from "./enums";
import { students, subjects } from "./students";
import { learningObjectives } from "./curriculum";

/**
 * Derived projection of the evidence ledger. Never written by hand; only by
 * lib/learning/state-engine inside the same transaction as an evidence insert.
 */
export const studentObjectiveState = pgTable(
  "student_objective_state",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => learningObjectives.id, { onDelete: "restrict" }),
    objectiveLineageId: uuid("objective_lineage_id").notNull(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    status: objectiveStatusEnum("status").notNull().default("NOT_STARTED"),
    confidence: confidenceLevelEnum("confidence").notNull().default("LOW"),
    assessedAttempts: integer("assessed_attempts").notNull().default(0),
    successRateRecent: numeric("success_rate_recent", { precision: 4, scale: 3 }),
    distinctLessonCount: integer("distinct_lesson_count").notNull().default(0),
    hasHumanOrSystemGradedEvidence: boolean("has_human_or_system_graded_evidence").notNull().default(false),
    firstSeenAt: ts("first_seen_at"),
    lastAssessedAt: ts("last_assessed_at"),
    proficientSince: ts("proficient_since"),
    ruleVersion: text("rule_version").notNull(),
    decidedByEvidenceIds: uuid("decided_by_evidence_ids").array().notNull().default([]),
    computedAt: ts("computed_at").notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("student_objective_state_student_objective_uq").on(t.studentId, t.objectiveId),
    index("student_objective_state_student_subject_status_idx").on(t.studentId, t.subjectId, t.status),
    index("student_objective_state_student_lineage_idx").on(t.studentId, t.objectiveLineageId),
    index("student_objective_state_objective_idx").on(t.objectiveId),
    index("student_objective_state_subject_idx").on(t.subjectId),
  ],
);

/** Append-only audit of every state change. */
export const studentObjectiveStateTransition = pgTable(
  "student_objective_state_transition",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => learningObjectives.id, { onDelete: "restrict" }),
    fromStatus: objectiveStatusEnum("from_status").notNull(),
    toStatus: objectiveStatusEnum("to_status").notNull(),
    fromConfidence: confidenceLevelEnum("from_confidence").notNull(),
    toConfidence: confidenceLevelEnum("to_confidence").notNull(),
    ruleVersion: text("rule_version").notNull(),
    triggeredByEvidenceId: uuid("triggered_by_evidence_id"),
    decidedByEvidenceIds: uuid("decided_by_evidence_ids").array().notNull().default([]),
    rationale: jsonb("rationale").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("sost_student_objective_created_idx").on(t.studentId, t.objectiveId, t.createdAt),
    index("sost_created_idx").on(t.createdAt),
    index("sost_objective_idx").on(t.objectiveId),
  ],
);

/** Spaced-repetition surface. Computed alongside state. */
export const studentObjectiveReview = pgTable(
  "student_objective_review",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => learningObjectives.id, { onDelete: "restrict" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    introducedAt: ts("introduced_at"),
    lastPractisedAt: ts("last_practised_at"),
    lastSuccessAt: ts("last_success_at"),
    reviewCount: integer("review_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    intervalDays: integer("interval_days").notNull().default(1),
    ease: numeric("ease", { precision: 4, scale: 2 }),
    nextReviewAt: ts("next_review_at"),
    schedulerVersion: text("scheduler_version").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("student_objective_review_student_objective_uq").on(t.studentId, t.objectiveId),
    index("student_objective_review_student_next_idx").on(t.studentId, t.nextReviewAt),
    index("student_objective_review_next_idx").on(t.nextReviewAt),
    index("student_objective_review_objective_idx").on(t.objectiveId),
    index("student_objective_review_subject_idx").on(t.subjectId),
  ],
);

export type StudentObjectiveStateRow = typeof studentObjectiveState.$inferSelect;
export type StudentObjectiveReviewRow = typeof studentObjectiveReview.$inferSelect;

export type StudentObjectiveStateTransitionRow = typeof studentObjectiveStateTransition.$inferSelect;
