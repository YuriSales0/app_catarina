import { z } from "zod";
import { CURRICULUM_SOURCES, VISIBILITIES, OBJECTIVE_STATUSES, PREREQUISITE_STRENGTHS } from "@/lib/db/enums";

/**
 * The curriculum file format (decision D15). One schema validates a YAML file,
 * a pasted draft in the Curriculum Studio, and an AI-generated draft alike.
 */
export const CURRICULUM_FILE_SCHEMA_VERSION = "curriculum-file.v1" as const;

const key = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "keys use letters, digits, dot, underscore or hyphen");

const bcp47 = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "expected a BCP-47 language tag such as en or pt-BR");

export const prerequisiteRefSchema = z.union([
  key,
  z
    .object({
      key,
      required_status: z.enum(OBJECTIVE_STATUSES).default("PROFICIENT"),
      strength: z.enum(PREREQUISITE_STRENGTHS).default("HARD"),
    })
    .strict(),
]);

export const teachingNotesSchema = z
  .object({
    vocabulary: z.array(z.string().max(120)).max(40).default([]),
    structures: z.array(z.string().max(200)).max(20).default([]),
    example_prompts: z.array(z.string().max(300)).max(20).default([]),
    activity_ideas: z.array(z.string().max(300)).max(20).default([]),
    success_criteria: z.array(z.string().max(300)).max(10).default([]),
  })
  .strict()
  .default({ vocabulary: [], structures: [], example_prompts: [], activity_ideas: [], success_criteria: [] });

export const objectiveFileSchema = z
  .object({
    key,
    code: z.string().max(64).optional(),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).default(""),
    difficulty: z.number().int().min(1).max(5).default(1),
    estimated_sessions: z.number().int().min(1).max(50).optional(),
    skills: z.array(key).max(10).default([]),
    prerequisites: z.array(prerequisiteRefSchema).max(10).default([]),
    error_tags: z.array(key).max(20).default([]),
    teaching_notes: teachingNotesSchema,
    assessment_policy: z
      .object({
        developingMinAttempts: z.number().int().min(1).optional(),
        proficientMinAttempts: z.number().int().min(1).optional(),
        proficientMinRate: z.number().min(0).max(1).optional(),
        masteryRetentionDays: z.number().int().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ObjectiveFile = z.infer<typeof objectiveFileSchema>;

const unitBase = {
  key,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  objectives: z.array(objectiveFileSchema).max(12).default([]),
};

/** Sub-units carry objectives but no further nesting: two levels is enough for any syllabus we target. */
export const subUnitFileSchema = z.object(unitBase).strict();
export const unitFileSchema = z
  .object({ ...unitBase, units: z.array(subUnitFileSchema).max(20).default([]) })
  .strict();

export type SubUnitFile = z.infer<typeof subUnitFileSchema>;
export type UnitFile = z.infer<typeof unitFileSchema>;

export const skillFileSchema = z
  .object({ key, name: z.string().min(1).max(100), description: z.string().max(500).default("") })
  .strict();

export const curriculumFileSchema = z
  .object({
    schema_version: z.literal(CURRICULUM_FILE_SCHEMA_VERSION),
    subject: key,
    subject_name: z.string().min(1).max(100).optional(),
    slug: key,
    name: z.string().min(1).max(200),
    description: z.string().max(4000).default(""),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver like 1.0.0"),
    source: z.enum(CURRICULUM_SOURCES),
    source_url: z.string().url().optional(),
    visibility: z.enum(VISIBILITIES).default("PRIVATE"),
    instruction_language: bcp47.default("pt-BR"),
    target_language: bcp47.optional(),
    is_demo: z.boolean().default(false),
    provenance: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
    notes: z.string().max(4000).default(""),
    skills: z.array(skillFileSchema).max(30).default([]),
    error_tags: z.record(key, z.string().min(1).max(200)).default({}),
    units: z.array(unitFileSchema).min(1).max(40),
  })
  .strict();

export type CurriculumFile = z.infer<typeof curriculumFileSchema>;
