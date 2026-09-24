import { pgTable, text, uuid, integer, bigint, jsonb, index, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, ts, metadata } from "./_common";
import {
  evidenceResultEnum,
  evidenceTypeEnum,
  confidenceLevelEnum,
  gradedByEnum,
  lessonEventTypeEnum,
  actorTypeEnum,
  auditResultEnum,
} from "./enums";
import { students, subjects } from "./students";
import { learningObjectives } from "./curriculum";
import { skills } from "./students";
import { lessons, lessonActivities } from "./lessons";
import { users } from "./identity";

export type GraderRef = {
  provider?: string;
  model?: string;
  promptVersion?: string;
  userId?: string;
  method?: string;
  reason?: string;
  /** Version of the deterministic policy that graded, e.g. answer-match.v1. */
  policy?: string;
  /** How the child answered: typed, spoken (browser speech) or in a live voice session. */
  input?: "typed" | "speech" | "voice_live";
};

/**
 * Append-only. No updated_at, no deleted_at. UPDATE and DELETE are refused by
 * a trigger and by the runtime role's privileges (see drizzle custom migration).
 */
export const learningEvidence = pgTable(
  "learning_evidence",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    activityId: uuid("activity_id").references(() => lessonActivities.id, { onDelete: "set null" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => learningObjectives.id, { onDelete: "restrict" }),
    objectiveLineageId: uuid("objective_lineage_id").notNull(),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    attemptNumber: integer("attempt_number").notNull(),
    prompt: text("prompt").notNull(),
    studentResponse: text("student_response"),
    expectedResponse: text("expected_response"),
    result: evidenceResultEnum("result").notNull(),
    correction: text("correction"),
    evidenceType: evidenceTypeEnum("evidence_type").notNull(),
    confidence: confidenceLevelEnum("confidence").notNull().default("MEDIUM"),
    gradedBy: gradedByEnum("graded_by").notNull(),
    graderRef: jsonb("grader_ref").$type<GraderRef>().notNull().default({}),
    supersedesEvidenceId: uuid("supersedes_evidence_id"),
    errorTags: text("error_tags").array().notNull().default([]),
    metadata: metadata(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("learning_evidence_attempt_uq").on(t.studentId, t.objectiveId, t.lessonId, t.activityId, t.attemptNumber),
    index("learning_evidence_student_objective_occurred_idx").on(t.studentId, t.objectiveId, t.occurredAt),
    index("learning_evidence_student_subject_created_idx").on(t.studentId, t.subjectId, t.createdAt),
    index("learning_evidence_lesson_idx").on(t.lessonId),
    index("learning_evidence_supersedes_idx").on(t.supersedesEvidenceId),
    index("learning_evidence_error_tags_gin").using("gin", t.errorTags),
    index("learning_evidence_subject_idx").on(t.subjectId),
    index("learning_evidence_activity_idx").on(t.activityId),
    index("learning_evidence_objective_idx").on(t.objectiveId),
    index("learning_evidence_skill_idx").on(t.skillId),
    check(
      "learning_evidence_correction_supersedes_ck",
      sql`${t.evidenceType} NOT IN ('CORRECTION','RETRACTION') OR ${t.supersedesEvidenceId} IS NOT NULL`,
    ),
  ],
);

export const lessonEvents = pgTable(
  "lesson_events",
  {
    id: id(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id").references(() => lessonActivities.id, { onDelete: "set null" }),
    eventType: lessonEventTypeEnum("event_type").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("lesson_events_lesson_sequence_uq").on(t.lessonId, t.sequence),
    index("lesson_events_student_occurred_idx").on(t.studentId, t.occurredAt),
    index("lesson_events_type_idx").on(t.eventType),
    index("lesson_events_activity_idx").on(t.activityId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorType: actorTypeEnum("actor_type").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    studentId: uuid("student_id"),
    result: auditResultEnum("result").notNull(),
    reason: text("reason"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    metadata: metadata(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_student_created_idx").on(t.studentId, t.createdAt),
    index("audit_log_actor_created_idx").on(t.actorUserId, t.createdAt),
    index("audit_log_denied_idx").on(t.result).where(sql`${t.result} = 'DENIED'`),
  ],
);

export type LearningEvidenceRow = typeof learningEvidence.$inferSelect;
export type LessonEventRow = typeof lessonEvents.$inferSelect;
