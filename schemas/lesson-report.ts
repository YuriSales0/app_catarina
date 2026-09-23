import { z } from "zod";
import { EVIDENCE_RESULTS, GRADED_BY, OBJECTIVE_STATUSES, CONFIDENCE_LEVELS, ACTIVITY_TYPES, INFERENCE_SOURCES } from "@/lib/db/enums";

export const REPORT_SCHEMA_VERSION = "report.v1" as const;
const uuid = z.string().uuid();

const countByResult = z.object(Object.fromEntries(EVIDENCE_RESULTS.map((r) => [r, z.number().int().min(0)])) as Record<(typeof EVIDENCE_RESULTS)[number], z.ZodNumber>).strict();
const countByGrader = z.object(Object.fromEntries(GRADED_BY.map((g) => [g, z.number().int().min(0)])) as Record<(typeof GRADED_BY)[number], z.ZodNumber>).strict();

/** OBSERVED: computed from the ledger by deterministic code. The AI never writes this. */
export const observedSectionSchema = z
  .object({
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    actual_duration_minutes: z.number().int().nullable(),
    objectives_attempted: z.array(
      z
        .object({
          objective_id: uuid,
          code: z.string(),
          title: z.string(),
          attempts: z.number().int(),
          correct: z.number().int(),
          partially_correct: z.number().int(),
          incorrect: z.number().int(),
          success_rate: z.number().nullable(),
          evidence_ids: z.array(uuid),
        })
        .strict(),
    ),
    objectives_progressed: z.array(z.object({ objective_id: uuid, from_status: z.enum(OBJECTIVE_STATUSES), to_status: z.enum(OBJECTIVE_STATUSES) }).strict()),
    skills_practised: z.array(z.object({ skill_id: uuid, name: z.string(), attempt_count: z.number().int() }).strict()),
    vocabulary_introduced: z.array(z.object({ term: z.string(), first_evidence_id: uuid }).strict()),
    errors_observed: z.array(z.object({ error_tag: z.string(), human_label: z.string(), count: z.number().int(), evidence_ids: z.array(uuid) }).strict()),
    activities_completed: z.array(z.object({ sequence: z.number().int(), activity_type: z.enum(ACTIVITY_TYPES), completed: z.boolean(), evidence_count: z.number().int() }).strict()),
    evidence_summary: z.object({ total: z.number().int(), by_result: countByResult, by_grader: countByGrader }).strict(),
    state_transitions: z.array(
      z
        .object({
          objective_id: uuid,
          from_status: z.enum(OBJECTIVE_STATUSES),
          to_status: z.enum(OBJECTIVE_STATUSES),
          from_confidence: z.enum(CONFIDENCE_LEVELS),
          to_confidence: z.enum(CONFIDENCE_LEVELS),
          transition_id: uuid,
          rule_version: z.string(),
        })
        .strict(),
    ),
    teacher_notes: z.array(z.object({ event_id: uuid, text: z.string(), at: z.string() }).strict()),
  })
  .strict();

/** INFERRED: opinions, each with a source and non-empty basis. Never feeds the engines. */
export const inferredSectionSchema = z
  .object({
    statements: z.array(
      z
        .object({
          statement: z.string().min(1).max(1000),
          about: z.object({ objective_id: uuid.optional(), skill_id: uuid.optional() }).strict().nullable(),
          basis_evidence_ids: z.array(uuid).min(1),
          source: z.enum(INFERENCE_SOURCES),
          confidence: z.enum(CONFIDENCE_LEVELS),
        })
        .strict(),
    ),
    recurring_errors: z.array(
      z
        .object({
          error_tag: z.string(),
          human_label: z.string(),
          occurrences_this_lesson: z.number().int(),
          occurrences_last_30_days: z.number().int(),
          first_seen_at: z.string(),
          is_recurring: z.boolean(),
        })
        .strict(),
    ),
    successful_patterns: z.array(z.string().max(500)),
    failed_patterns: z.array(z.string().max(500)),
    pronunciation_targets: z.array(z.object({ target: z.string(), note: z.string(), basis_evidence_ids: z.array(uuid).min(1) }).strict()),
    teacher_observations: z.array(z.string().max(2000)),
  })
  .strict();

/** RECOMMENDED: proposals only. Nothing here is applied automatically. */
export const recommendedSectionSchema = z
  .object({
    recommended_review: z.array(z.object({ objective_id: uuid, reason: z.string(), priority: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict()),
    recommended_next_objective: z.object({ objective_id: uuid, title: z.string(), reason: z.string() }).strict().nullable(),
    recommended_activities: z.array(z.object({ activity_type: z.enum(ACTIVITY_TYPES), objective_id: uuid, reason: z.string() }).strict()),
    pacing: z.object({ suggestion: z.enum(["SLOW_DOWN", "HOLD", "ADVANCE"]), reason: z.string() }).strict().nullable(),
    parent_actions: z.array(z.object({ action: z.string(), reason: z.string() }).strict()),
  })
  .strict();

export const lessonReportSchema = z
  .object({
    schema_version: z.literal(REPORT_SCHEMA_VERSION),
    lesson_id: uuid,
    student_id: uuid,
    subject_id: uuid,
    lesson_number: z.number().int(),
    generated_at: z.string(),
    generated_by: z.enum(["SYSTEM", "AI_PROVIDER", "HUMAN"]),
    generator_ref: z.record(z.string(), z.unknown()).nullable(),
    observed: observedSectionSchema,
    inferred: inferredSectionSchema,
    recommended: recommendedSectionSchema,
  })
  .strict();
export type LessonReport = z.infer<typeof lessonReportSchema>;
export type ObservedSection = z.infer<typeof observedSectionSchema>;
export type InferredSection = z.infer<typeof inferredSectionSchema>;
export type RecommendedSection = z.infer<typeof recommendedSectionSchema>;
