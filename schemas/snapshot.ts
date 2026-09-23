import { z } from "zod";
import { OBJECTIVE_STATUSES, CONFIDENCE_LEVELS, EVIDENCE_RESULTS, GRADED_BY, CURRICULUM_SOURCES } from "@/lib/db/enums";

export const SNAPSHOT_SCHEMA_VERSION = "snapshot.v1" as const;
const uuid = z.string().uuid();
const byStatus = z.object(Object.fromEntries(OBJECTIVE_STATUSES.map((k) => [k, z.number().int().min(0)])) as Record<(typeof OBJECTIVE_STATUSES)[number], z.ZodNumber>).strict();
const byResult = z.object(Object.fromEntries(EVIDENCE_RESULTS.map((k) => [k, z.number().int().min(0)])) as Record<(typeof EVIDENCE_RESULTS)[number], z.ZodNumber>).strict();
const byGrader = z.object(Object.fromEntries(GRADED_BY.map((k) => [k, z.number().int().min(0)])) as Record<(typeof GRADED_BY)[number], z.ZodNumber>).strict();

export const snapshotSubjectSchema = z
  .object({
    subject: z.object({ id: uuid, name: z.string(), slug: z.string() }).strict(),
    active: z.boolean(),
    curriculum: z.object({ name: z.string(), version: z.string(), source: z.enum(CURRICULUM_SOURCES), version_id: uuid }).strict(),
    instruction_language: z.string(),
    target_language: z.string().nullable(),
    progress: z
      .object({
        objectives_total: z.number().int(),
        by_status: byStatus,
        mastered_percent: z.number(),
        units_completed: z.number().int(),
        units_total: z.number().int(),
      })
      .strict(),
    current_objectives: z.array(
      z
        .object({
          objective_id: uuid,
          code: z.string(),
          title: z.string(),
          status: z.enum(OBJECTIVE_STATUSES),
          confidence: z.enum(CONFIDENCE_LEVELS),
          assessed_attempts: z.number().int(),
          success_rate_recent: z.number().nullable(),
          last_assessed_at: z.string().nullable(),
          proficient_since: z.string().nullable(),
        })
        .strict(),
    ),
    objective_states: z.array(
      z.object({ objective_id: uuid, lineage_id: uuid, code: z.string(), status: z.enum(OBJECTIVE_STATUSES), confidence: z.enum(CONFIDENCE_LEVELS), last_assessed_at: z.string().nullable() }).strict(),
    ),
    skill_states: z.array(
      z
        .object({
          skill_id: uuid,
          name: z.string(),
          attempts_30d: z.number().int(),
          success_rate_30d: z.number().nullable(),
          trend: z.enum(["IMPROVING", "STABLE", "DECLINING", "INSUFFICIENT_DATA"]),
        })
        .strict(),
    ),
    recurring_difficulties: z.array(
      z
        .object({
          error_tag: z.string(),
          human_label: z.string(),
          occurrences_30d: z.number().int(),
          affected_objective_ids: z.array(uuid),
          first_seen_at: z.string(),
          trend: z.enum(["IMPROVING", "PERSISTENT", "WORSENING"]),
        })
        .strict(),
    ),
    recent_evidence_summary: z
      .object({ window_days: z.literal(30), total_attempts: z.number().int(), by_result: byResult, by_grader: byGrader, distinct_objectives: z.number().int() })
      .strict(),
    recent_lessons: z.array(
      z
        .object({
          lesson_id: uuid,
          lesson_number: z.number().int(),
          completed_at: z.string(),
          primary_objective: z.object({ id: uuid, title: z.string() }).strict(),
          attempts: z.number().int(),
          success_rate: z.number().nullable(),
        })
        .strict(),
    ),
    review_priorities: z.array(
      z.object({ objective_id: uuid, code: z.string(), title: z.string(), next_review_at: z.string(), days_overdue: z.number().int(), interval_days: z.number().int() }).strict(),
    ),
    recommended_next_objectives: z.array(z.object({ objective_id: uuid, code: z.string(), title: z.string(), reason: z.string() }).strict()),
  })
  .strict();

export const snapshotPayloadSchema = z
  .object({
    schema_version: z.literal(SNAPSHOT_SCHEMA_VERSION),
    snapshot_version: z.number().int().min(1),
    student: z.object({ display_name: z.string(), age_years: z.number().int().nullable(), school_year: z.string().nullable() }).strict(),
    generated_at: z.string(),
    subjects: z.array(snapshotSubjectSchema),
    epistemic_key: z.object({ observed: z.array(z.string()), inferred: z.array(z.string()), recommended: z.array(z.string()) }).strict(),
  })
  .strict();
export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;
export type SnapshotSubject = z.infer<typeof snapshotSubjectSchema>;

export const EPISTEMIC_KEY = {
  observed: ["subjects[].progress", "subjects[].objective_states", "subjects[].current_objectives", "subjects[].recent_evidence_summary", "subjects[].recent_lessons", "subjects[].review_priorities", "subjects[].skill_states[].attempts_30d", "subjects[].skill_states[].success_rate_30d"],
  inferred: ["subjects[].recurring_difficulties", "subjects[].skill_states[].trend"],
  recommended: ["subjects[].recommended_next_objectives"],
} as const;

export const generatedFromSchema = z
  .object({
    rule_version: z.string(),
    engine_version: z.string(),
    snapshot_generator_version: z.string(),
    evidence_watermark: z.string().nullable(),
    evidence_count: z.number().int(),
    lesson_ids: z.array(uuid),
    trigger: z.enum(["LESSON_COMPLETED", "SCHEDULED", "MANUAL", "PRE_MIGRATION"]),
  })
  .strict();
export type GeneratedFrom = z.infer<typeof generatedFromSchema>;
