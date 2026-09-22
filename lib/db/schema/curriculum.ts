import {
  pgTable,
  text,
  uuid,
  integer,
  smallint,
  jsonb,
  index,
  unique,
  primaryKey,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, updatedAt, ts, isDemo, metadata } from "./_common";
import {
  curriculumSourceEnum,
  curriculumStatusEnum,
  visibilityEnum,
  objectiveStatusEnum,
  prerequisiteStrengthEnum,
} from "./enums";
import { users } from "./identity";
import { subjects, skills } from "./students";

export const curricula = pgTable(
  "curricula",
  {
    id: id(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    source: curriculumSourceEnum("source").notNull(),
    sourceUrl: text("source_url"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    visibility: visibilityEnum("visibility").notNull().default("PRIVATE"),
    metadata: metadata(),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("curricula_subject_slug_uq").on(t.subjectId, t.slug),
    index("curricula_subject_idx").on(t.subjectId),
    index("curricula_owner_idx").on(t.ownerUserId),
  ],
);

export type CurriculumProvenance = {
  origin?: string;
  textbook?: string;
  pages?: string;
  url?: string;
  retrievedAt?: string;
  importJobId?: string;
  provider?: string;
  model?: string;
  promptVersion?: string;
  fileHash?: string;
  notes?: string;
};

export const curriculumVersions = pgTable(
  "curriculum_versions",
  {
    id: id(),
    curriculumId: uuid("curriculum_id")
      .notNull()
      .references(() => curricula.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    status: curriculumStatusEnum("status").notNull().default("DRAFT"),
    instructionLanguage: text("instruction_language").notNull().default("pt-BR"),
    targetLanguage: text("target_language"),
    /** Per-subject controlled vocabulary of error tags: code -> human label. */
    errorTagVocabulary: jsonb("error_tag_vocabulary").$type<Record<string, string>>().notNull().default({}),
    provenance: jsonb("provenance").$type<CurriculumProvenance>().notNull().default({}),
    notes: text("notes").notNull().default(""),
    publishedAt: ts("published_at"),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("curriculum_versions_curriculum_version_uq").on(t.curriculumId, t.version),
    index("curriculum_versions_curriculum_idx").on(t.curriculumId),
    index("curriculum_versions_published_by_idx").on(t.publishedByUserId),
  ],
);

export const curriculumUnits = pgTable(
  "curriculum_units",
  {
    id: id(),
    curriculumVersionId: uuid("curriculum_version_id")
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: "cascade" }),
    parentUnitId: uuid("parent_unit_id").references((): AnyPgColumn => curriculumUnits.id, {
      onDelete: "cascade",
    }),
    unitKey: text("unit_key").notNull(),
    lineageId: uuid("lineage_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    sequence: integer("sequence").notNull(),
    metadata: metadata(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("curriculum_units_version_key_uq").on(t.curriculumVersionId, t.unitKey),
    index("curriculum_units_version_idx").on(t.curriculumVersionId),
    index("curriculum_units_parent_idx").on(t.parentUnitId),
    index("curriculum_units_lineage_idx").on(t.lineageId),
  ],
);

export type AssessmentPolicyOverride = Partial<{
  developingMinAttempts: number;
  proficientMinAttempts: number;
  proficientMinRate: number;
  masteryRetentionDays: number;
}>;

export const learningObjectives = pgTable(
  "learning_objectives",
  {
    id: id(),
    curriculumVersionId: uuid("curriculum_version_id")
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: "cascade" }),
    curriculumUnitId: uuid("curriculum_unit_id")
      .notNull()
      .references(() => curriculumUnits.id, { onDelete: "cascade" }),
    objectiveKey: text("objective_key").notNull(),
    lineageId: uuid("lineage_id").notNull(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    sequence: integer("sequence").notNull(),
    difficulty: smallint("difficulty").notNull().default(1),
    estimatedSessions: smallint("estimated_sessions"),
    /** Normalized error tags this objective is known to produce. */
    errorTags: text("error_tags").array().notNull().default([]),
    /** Optional teaching hints: example prompts, vocabulary, structures. */
    teachingNotes: jsonb("teaching_notes").$type<Record<string, unknown>>().notNull().default({}),
    assessmentPolicy: jsonb("assessment_policy").$type<AssessmentPolicyOverride | null>(),
    metadata: metadata(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("learning_objectives_version_key_uq").on(t.curriculumVersionId, t.objectiveKey),
    unique("learning_objectives_unit_sequence_uq").on(t.curriculumUnitId, t.sequence),
    index("learning_objectives_version_idx").on(t.curriculumVersionId),
    index("learning_objectives_unit_idx").on(t.curriculumUnitId),
    index("learning_objectives_lineage_idx").on(t.lineageId),
    check("learning_objectives_difficulty_ck", sql`${t.difficulty} BETWEEN 1 AND 5`),
  ],
);

export const objectivePrerequisites = pgTable(
  "objective_prerequisites",
  {
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => learningObjectives.id, { onDelete: "cascade" }),
    prerequisiteObjectiveId: uuid("prerequisite_objective_id")
      .notNull()
      .references(() => learningObjectives.id, { onDelete: "cascade" }),
    requiredStatus: objectiveStatusEnum("required_status").notNull().default("PROFICIENT"),
    strength: prerequisiteStrengthEnum("strength").notNull().default("HARD"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.objectiveId, t.prerequisiteObjectiveId] }),
    index("objective_prerequisites_objective_idx").on(t.objectiveId),
    index("objective_prerequisites_prerequisite_idx").on(t.prerequisiteObjectiveId),
    check("objective_prerequisites_not_self_ck", sql`${t.objectiveId} <> ${t.prerequisiteObjectiveId}`),
  ],
);

export const objectiveSkills = pgTable(
  "objective_skills",
  {
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => learningObjectives.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    weight: smallint("weight").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.objectiveId, t.skillId] }),
    index("objective_skills_skill_idx").on(t.skillId),
  ],
);
