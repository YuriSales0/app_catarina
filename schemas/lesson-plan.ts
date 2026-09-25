import { z } from "zod";
import { ACTIVITY_TYPES, OBJECTIVE_STATUSES, CONFIDENCE_LEVELS } from "@/lib/db/enums";

export const PLAN_VERSION = "nlp.v1" as const;

export const plannedActivitySchema = z
  .object({
    sequence: z.number().int().min(1),
    activity_type: z.enum(ACTIVITY_TYPES),
    objective_id: z.string().uuid().nullable(),
    skill_id: z.string().uuid().nullable(),
    instructions: z.string().min(1).max(2000),
    expected_evidence_count: z.number().int().min(0).max(50).nullable(),
    planned_minutes: z.number().int().min(1).max(90),
  })
  .strict();
export type PlannedActivity = z.infer<typeof plannedActivitySchema>;

export const rationaleReasonSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MANUAL_SELECTION"), by_user_id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("DEVELOPING_CONTINUATION"), evidence_ids: z.array(z.string().uuid()) }).strict(),
  z.object({ kind: z.literal("PRACTISING_CONTINUATION"), evidence_ids: z.array(z.string().uuid()) }).strict(),
  z.object({ kind: z.literal("REVIEW_DUE"), days_overdue: z.number(), last_success_at: z.string().nullable() }).strict(),
  z.object({ kind: z.literal("RECURRING_ERROR"), error_tag: z.string(), occurrences: z.number().int(), lesson_ids: z.array(z.string().uuid()) }).strict(),
  z.object({ kind: z.literal("NEXT_IN_SEQUENCE"), unit: z.string(), position: z.number().int() }).strict(),
  z.object({ kind: z.literal("RETENTION_CHECK"), proficient_since: z.string() }).strict(),
  z.object({ kind: z.literal("INTRODUCED_CONTINUATION"), evidence_ids: z.array(z.string().uuid()) }).strict(),
  z.object({ kind: z.literal("PLACEMENT_TEST"), units: z.number().int().min(1) }).strict(),
]);

export const engineRationaleSchema = z
  .object({
    selected_because: z.array(rationaleReasonSchema),
    prerequisites_satisfied: z.array(z.object({ objective_code: z.string(), status: z.enum(OBJECTIVE_STATUSES) }).strict()),
    alternatives_rejected: z.array(
      z
        .object({
          objective_code: z.string(),
          reason: z.enum(["LOCKED", "RECENTLY_TAUGHT", "LOWER_PRIORITY", "MASTERED", "INACTIVE", "PLACED_OUT", "UNIT_NOT_OPEN"]),
          blocking: z.array(z.string()).optional(),
          score: z.number().optional(),
        })
        .strict(),
    ),
    score_breakdown: z.array(z.object({ component: z.string(), value: z.number() }).strict()),
    policy_version: z.string(),
  })
  .strict();
export type EngineRationale = z.infer<typeof engineRationaleSchema>;

export const objectiveSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    title: z.string(),
    status: z.enum(OBJECTIVE_STATUSES),
    confidence: z.enum(CONFIDENCE_LEVELS),
  })
  .strict();

export const nextLessonPlanSchema = z
  .object({
    plan_version: z.literal(PLAN_VERSION),
    engine_version: z.string(),
    source: z.enum(["ENGINE", "MANUAL"]),
    generated_at: z.string(),
    student_id: z.string().uuid(),
    subject_id: z.string().uuid(),
    curriculum_version_id: z.string().uuid(),
    outcome: z.enum(["PLANNED", "CURRICULUM_COMPLETE", "BLOCKED", "NEEDS_CURRICULUM", "REVIEW_ONLY"]),
    primary_objective: objectiveSummarySchema.nullable(),
    review_objectives: z.array(objectiveSummarySchema.extend({ days_overdue: z.number().nullable() }).strict()),
    blocking_objectives: z.array(objectiveSummarySchema).default([]),
    planned_duration_minutes: z.number().int().min(1).max(180),
    activities: z.array(plannedActivitySchema),
    /** Course or module opening, when this lesson starts one (plans made before openings have none). */
    opening: z
      .object({
        kind: z.enum(["COURSE_START", "UNIT_START"]),
        unit_name: z.string(),
        unit_objectives: z.array(z.object({ id: z.string().uuid(), title: z.string() }).strict()).max(20),
      })
      .strict()
      .nullable()
      .default(null),
    /** A level check instead of a lesson: one quick challenge per unit, easiest first (lib/lessons/placement.ts). */
    placement_test: z
      .object({
        units: z.array(z.object({ unit_key: z.string(), unit_name: z.string(), objective_id: z.string().uuid(), objective_title: z.string() }).strict()).min(1).max(12),
      })
      .strict()
      .nullable()
      .default(null),
    rationale: engineRationaleSchema,
    candidates_considered: z.number().int().min(0),
  })
  .strict();
export type NextLessonPlan = z.infer<typeof nextLessonPlanSchema>;
