import { pgTable, text, uuid, integer, smallint, jsonb, index, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, ts, isDemo, metadata } from "./_common";
import { lessonStatusEnum, activityTypeEnum, reportGeneratorEnum } from "./enums";
import { students, subjects, skills } from "./students";
import { curriculumVersions, learningObjectives } from "./curriculum";
import { users } from "./identity";

export const lessons = pgTable(
  "lessons",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    curriculumVersionId: uuid("curriculum_version_id")
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: "restrict" }),
    primaryObjectiveId: uuid("primary_objective_id")
      .notNull()
      .references(() => learningObjectives.id, { onDelete: "restrict" }),
    lessonNumber: integer("lesson_number").notNull(),
    plannedDurationMinutes: integer("planned_duration_minutes").notNull().default(20),
    actualDurationMinutes: integer("actual_duration_minutes"),
    status: lessonStatusEnum("status").notNull().default("PLANNED"),
    /** The NextLessonPlan (or manual plan) that produced this lesson, frozen. */
    planPayload: jsonb("plan_payload").$type<Record<string, unknown>>().notNull().default({}),
    planEngineVersion: text("plan_engine_version").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    metadata: metadata(),
    isDemo: isDemo(),
    createdAt: createdAt(),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
  },
  (t) => [
    unique("lessons_student_subject_number_uq").on(t.studentId, t.subjectId, t.lessonNumber),
    uniqueIndex("lessons_student_idempotency_uq")
      .on(t.studentId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    index("lessons_student_subject_created_idx").on(t.studentId, t.subjectId, t.createdAt),
    index("lessons_status_idx").on(t.status),
    index("lessons_primary_objective_idx").on(t.primaryObjectiveId),
    index("lessons_curriculum_version_idx").on(t.curriculumVersionId),
    index("lessons_subject_idx").on(t.subjectId),
    index("lessons_created_by_idx").on(t.createdByUserId),
  ],
);

export const lessonActivities = pgTable(
  "lesson_activities",
  {
    id: id(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    sequence: smallint("sequence").notNull(),
    activityType: activityTypeEnum("activity_type").notNull(),
    objectiveId: uuid("objective_id").references(() => learningObjectives.id, { onDelete: "restrict" }),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    instructions: text("instructions").notNull(),
    expectedEvidenceCount: smallint("expected_evidence_count"),
    plannedMinutes: smallint("planned_minutes"),
    metadata: metadata(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("lesson_activities_lesson_sequence_uq").on(t.lessonId, t.sequence),
    index("lesson_activities_objective_idx").on(t.objectiveId),
    index("lesson_activities_student_idx").on(t.studentId),
    index("lesson_activities_skill_idx").on(t.skillId),
  ],
);

export const lessonReports = pgTable(
  "lesson_reports",
  {
    id: id(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    schemaVersion: text("schema_version").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    generatedBy: reportGeneratorEnum("generated_by").notNull(),
    generatorRef: jsonb("generator_ref").$type<Record<string, unknown>>().notNull().default({}),
    generatedAt: ts("generated_at").notNull().defaultNow(),
  },
  (t) => [
    index("lesson_reports_lesson_generated_idx").on(t.lessonId, t.generatedAt),
    index("lesson_reports_student_idx").on(t.studentId),
  ],
);
