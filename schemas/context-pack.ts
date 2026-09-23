import { z } from "zod";
import { OBJECTIVE_STATUSES, CONFIDENCE_LEVELS, EVIDENCE_RESULTS, GRADED_BY, CURRICULUM_SOURCES, ACTIVITY_TYPES } from "@/lib/db/enums";

/**
 * context.v1: the only thing an AI provider ever receives about a student.
 * An allowlist projection with opaque handles instead of database ids, and
 * caps that are part of the schema so no student can produce an unbounded pack.
 */
export const CONTEXT_VERSION = "context.v1" as const;
export const CONTEXT_CAPS = { evidence: 10, recurringErrors: 5, masteredConcepts: 8, activities: 8, teacherInstructionChars: 2000, prerequisites: 8, maxBytes: 8 * 1024 } as const;

const handle = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_\\d+$`), `expected a ${prefix}_n handle`);
const bcp47 = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/);

export const contextPackSchema = z
  .object({
    context_version: z.literal(CONTEXT_VERSION),
    generated_at: z.string().datetime(),
    pack_id: z.string().regex(/^pack_[a-z0-9]{12,}$/),
    student: z
      .object({
        display_name: z.string().min(1).max(60),
        age_years: z.number().int().min(2).max(120).nullable(),
        instruction_language: bcp47,
        target_language: bcp47.nullable(),
        timezone: z.string().min(1),
      })
      .strict(),
    subject: z.object({ name: z.string(), slug: z.string() }).strict(),
    curriculum: z.object({ name: z.string(), version: z.string(), source: z.enum(CURRICULUM_SOURCES) }).strict(),
    current_unit: z.object({ name: z.string(), description: z.string(), position: z.number().int().min(1) }).strict(),
    primary_objective: z
      .object({
        ref: handle("obj"),
        code: z.string(),
        title: z.string(),
        description: z.string(),
        difficulty: z.number().int().min(1).max(5),
        skills: z.array(z.object({ ref: handle("sk"), name: z.string() }).strict()).max(10),
        teaching_notes: z
          .object({
            vocabulary: z.array(z.string()).max(40),
            structures: z.array(z.string()).max(20),
            example_prompts: z.array(z.string()).max(20),
            activity_ideas: z.array(z.string()).max(20),
            success_criteria: z.array(z.string()).max(10),
          })
          .strict(),
      })
      .strict(),
    prerequisites: z.array(z.object({ ref: handle("obj"), code: z.string(), title: z.string(), student_status: z.enum(OBJECTIVE_STATUSES) }).strict()).max(CONTEXT_CAPS.prerequisites),
    current_student_state: z
      .object({
        status: z.enum(OBJECTIVE_STATUSES),
        confidence: z.enum(CONFIDENCE_LEVELS),
        assessed_attempts: z.number().int().min(0),
        success_rate_recent: z.number().min(0).max(1).nullable(),
        first_seen_at: z.string().datetime().nullable(),
        last_assessed_at: z.string().datetime().nullable(),
      })
      .strict(),
    relevant_recent_evidence: z
      .array(
        z
          .object({
            ref: handle("ev"),
            objective_ref: handle("obj"),
            occurred_at: z.string().datetime(),
            prompt: z.string().max(500),
            student_response: z.string().max(500).nullable(),
            result: z.enum(EVIDENCE_RESULTS),
            correction: z.string().max(500).nullable(),
            graded_by: z.enum(GRADED_BY),
          })
          .strict(),
      )
      .max(CONTEXT_CAPS.evidence),
    recurring_errors: z
      .array(z.object({ error_tag: z.string(), human_label: z.string(), occurrences: z.number().int(), last_seen_at: z.string().datetime(), example_ref: handle("ev").nullable() }).strict())
      .max(CONTEXT_CAPS.recurringErrors),
    mastered_relevant_concepts: z.array(z.object({ ref: handle("obj"), code: z.string(), title: z.string(), mastered_at: z.string().datetime().nullable() }).strict()).max(CONTEXT_CAPS.masteredConcepts),
    previous_lesson_summary: z
      .object({
        lesson_number: z.number().int(),
        completed_at: z.string().datetime(),
        objectives_practised: z.array(z.object({ ref: handle("obj"), title: z.string() }).strict()).max(6),
        observed_facts: z.array(z.string().max(300)).max(10),
        what_went_well: z.array(z.string().max(300)).max(5),
        what_was_hard: z.array(z.string().max(300)).max(5),
      })
      .strict()
      .nullable(),
    lesson_plan: z
      .object({
        planned_duration_minutes: z.number().int().min(1).max(180),
        activities: z
          .array(
            z
              .object({
                sequence: z.number().int(),
                activity_type: z.enum(ACTIVITY_TYPES),
                objective_ref: handle("obj").nullable(),
                skill_ref: handle("sk").nullable(),
                instructions: z.string().max(2000),
                expected_evidence_count: z.number().int().nullable(),
                planned_minutes: z.number().int(),
              })
              .strict(),
          )
          .max(CONTEXT_CAPS.activities),
      })
      .strict(),
    pedagogical_constraints: z
      .object({
        age_appropriate_for_years: z.number().int().nullable(),
        instruction_language: bcp47,
        target_language: bcp47.nullable(),
        max_new_vocabulary_items: z.number().int().min(0).max(20),
        avoid_topics: z.array(z.string().max(60)).max(20),
        reading_level: z.enum(["PRE_READER", "EARLY_READER", "FLUENT"]).nullable(),
        session_minutes: z.number().int().min(1).max(180),
        correction_style: z.enum(["GENTLE_RECAST", "EXPLICIT", "DELAYED"]),
      })
      .strict(),
    teacher_instructions: z
      .object({
        source: z.enum(["PARENT", "TEACHER"]),
        text: z.string().max(CONTEXT_CAPS.teacherInstructionChars).nullable(),
        authored_at: z.string().datetime().nullable(),
      })
      .strict(),
  })
  .strict();

export type ContextPack = z.infer<typeof contextPackSchema>;

/** Server-side mapping from pack handles to database ids. Never sent to the provider. */
export type HandleMap = { objectives: Record<string, string>; skills: Record<string, string>; evidence: Record<string, string> };
