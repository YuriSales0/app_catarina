import { pgTable, text, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { id, createdAt, ts } from "./_common";
import {
  confidenceLevelEnum,
  inferenceSourceEnum,
  recommendationKindEnum,
  recommendationSourceEnum,
  recommendationStatusEnum,
} from "./enums";
import { students, subjects, skills } from "./students";
import { learningObjectives } from "./curriculum";
import { lessons } from "./lessons";
import { users } from "./identity";

/** INFERRED. Never read by the state engine or the Next Lesson Engine. */
export const learningInference = pgTable(
  "learning_inference",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    objectiveId: uuid("objective_id").references(() => learningObjectives.id, { onDelete: "set null" }),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    statement: text("statement").notNull(),
    basisEvidenceIds: uuid("basis_evidence_ids").array().notNull(),
    source: inferenceSourceEnum("source").notNull(),
    sourceRef: jsonb("source_ref").$type<Record<string, unknown>>().notNull().default({}),
    confidence: confidenceLevelEnum("confidence").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("learning_inference_student_created_idx").on(t.studentId, t.createdAt),
    index("learning_inference_lesson_idx").on(t.lessonId),
    index("learning_inference_subject_idx").on(t.subjectId),
    index("learning_inference_objective_idx").on(t.objectiveId),
    index("learning_inference_skill_idx").on(t.skillId),
  ],
);

/** RECOMMENDED. Status is the only mutable field. */
export const learningRecommendation = pgTable(
  "learning_recommendation",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    kind: recommendationKindEnum("kind").notNull(),
    objectiveId: uuid("objective_id").references(() => learningObjectives.id, { onDelete: "set null" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    statement: text("statement").notNull(),
    rationale: jsonb("rationale").$type<Record<string, unknown>>().notNull().default({}),
    source: recommendationSourceEnum("source").notNull(),
    sourceRef: jsonb("source_ref").$type<Record<string, unknown>>().notNull().default({}),
    status: recommendationStatusEnum("status").notNull().default("PROPOSED"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("learning_recommendation_student_status_idx").on(t.studentId, t.status),
    index("learning_recommendation_lesson_idx").on(t.lessonId),
    index("learning_recommendation_subject_idx").on(t.subjectId),
    index("learning_recommendation_objective_idx").on(t.objectiveId),
    index("learning_recommendation_decided_by_idx").on(t.decidedByUserId),
  ],
);
