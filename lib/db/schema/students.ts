import {
  pgTable,
  text,
  uuid,
  date,
  integer,
  boolean,
  index,
  uniqueIndex,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, updatedAt, ts, isDemo, metadata } from "./_common";
import { guardianRoleEnum, consentKindEnum } from "./enums";
import { users } from "./identity";
import { curriculumVersions } from "./curriculum";

export const students = pgTable(
  "students",
  {
    id: id(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    schoolYear: text("school_year"),
    educationSystem: text("education_system"),
    timezone: text("timezone").notNull().default("Europe/Lisbon"),
    metadata: metadata(),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("students_created_by_idx").on(t.createdByUserId)],
);

/** The single authorization chokepoint. */
export const studentGuardians = pgTable(
  "student_guardians",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: guardianRoleEnum("role").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("student_guardians_student_user_uq").on(t.studentId, t.userId),
    index("student_guardians_user_id_idx").on(t.userId),
    index("student_guardians_student_revoked_idx").on(t.studentId, t.revokedAt),
    index("student_guardians_invited_by_idx").on(t.invitedByUserId),
    uniqueIndex("student_guardians_one_owner_uq")
      .on(t.studentId)
      .where(sql`${t.role} = 'OWNER' AND ${t.revokedAt} IS NULL`),
  ],
);

export const consents = pgTable(
  "consents",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    kind: consentKindEnum("kind").notNull(),
    policyVersion: text("policy_version").notNull(),
    grantedAt: ts("granted_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("consents_student_kind_idx").on(t.studentId, t.kind), index("consents_user_idx").on(t.userId)],
);

export const subjects = pgTable("subjects", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  metadata: metadata(),
  isDemo: isDemo(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const skills = pgTable(
  "skills",
  {
    id: id(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    metadata: metadata(),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("skills_subject_slug_uq").on(t.subjectId, t.slug), index("skills_subject_idx").on(t.subjectId)],
);

export const studentSubjects = pgTable(
  "student_subjects",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    /** Pinned curriculum version; nullable until the parent chooses one. */
    curriculumVersionId: uuid("curriculum_version_id").references((): AnyPgColumn => curriculumVersions.id, {
      onDelete: "set null",
    }),
    active: boolean("active").notNull().default(true),
    instructionLanguage: text("instruction_language").notNull().default("pt-BR"),
    targetLanguage: text("target_language"),
    targetLevel: text("target_level"),
    goal: text("goal"),
    plannedLessonMinutes: integer("planned_lesson_minutes").notNull().default(20),
    startedAt: ts("started_at").notNull().defaultNow(),
    metadata: metadata(),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("student_subjects_student_subject_uq").on(t.studentId, t.subjectId),
    index("student_subjects_student_active_idx").on(t.studentId, t.active),
    index("student_subjects_subject_idx").on(t.subjectId),
    index("student_subjects_curriculum_version_idx").on(t.curriculumVersionId),
  ],
);

export type StudentRow = typeof students.$inferSelect;
export type SubjectRow = typeof subjects.$inferSelect;
export type SkillRow = typeof skills.$inferSelect;
export type StudentSubjectRow = typeof studentSubjects.$inferSelect;
