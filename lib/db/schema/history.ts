import { pgTable, text, uuid, integer, jsonb, index, unique } from "drizzle-orm/pg-core";
import { id, createdAt } from "./_common";
import { snapshotScopeEnum } from "./enums";
import { students, subjects } from "./students";

export const learningSnapshots = pgTable(
  "learning_snapshots",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    snapshotVersion: integer("snapshot_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    scope: snapshotScopeEnum("scope").notNull(),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "restrict" }),
    generatedFrom: jsonb("generated_from").$type<Record<string, unknown>>().notNull(),
    statePayload: jsonb("state_payload").$type<Record<string, unknown>>().notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("learning_snapshots_student_version_uq").on(t.studentId, t.snapshotVersion),
    index("learning_snapshots_student_created_idx").on(t.studentId, t.createdAt),
    index("learning_snapshots_subject_idx").on(t.subjectId),
  ],
);
