import { z } from "zod";
import { EVIDENCE_RESULTS, CONFIDENCE_LEVELS, ACTIVITY_TYPES } from "@/lib/db/enums";

/**
 * Everything a provider returns is a *proposal*, validated strictly. A
 * proposal names objectives and evidence only by pack handles.
 */
const objHandle = z.string().regex(/^obj_\d+$/);
const skHandle = z.string().regex(/^sk_\d+$/);

export const activityProposalSchema = z
  .object({
    activity_ref: z.number().int().min(1),
    objective_ref: objHandle,
    title: z.string().min(1).max(120),
    child_facing_intro: z.string().min(1).max(600),
    /** An everyday situation the language belongs to, in the instruction language. */
    scene: z.string().max(400).nullable().default(null),
    /** A short model exchange in the target language, each line with its meaning in the instruction language. */
    model_dialogue: z
      .array(z.object({ speaker: z.string().min(1).max(30), line: z.string().min(1).max(200), meaning: z.string().max(200) }).strict())
      .max(8)
      .default([]),
    items: z
      .array(
        z
          .object({
            prompt: z.string().min(1).max(300),
            expected_response: z.string().max(300).nullable(),
            accept_also: z.array(z.string().max(200)).max(5).default([]),
            skill_ref: skHandle.nullable(),
            checkable: z.enum(["EXACT", "SET", "OPEN"]),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    needs_clarification: z.string().max(500).nullable(),
  })
  .strict();
export type ActivityProposal = z.infer<typeof activityProposalSchema>;

export const evaluationProposalSchema = z
  .object({
    objective_ref: objHandle,
    result: z.enum(EVIDENCE_RESULTS),
    confidence: z.enum(CONFIDENCE_LEVELS),
    correction: z.string().max(400).nullable(),
    error_tags: z.array(z.string().max(64)).max(5),
    rationale: z.string().max(400),
    needs_clarification: z.string().max(500).nullable(),
  })
  .strict();
export type EvaluationProposal = z.infer<typeof evaluationProposalSchema>;

export const explanationProposalSchema = z
  .object({
    objective_ref: objHandle,
    explanation: z.string().min(1).max(1200),
    examples: z.array(z.string().max(200)).max(6),
    in_instruction_language: z.boolean(),
    needs_clarification: z.string().max(500).nullable(),
  })
  .strict();
export type ExplanationProposal = z.infer<typeof explanationProposalSchema>;

export const reportNarrativeProposalSchema = z
  .object({
    inferred: z
      .object({
        statements: z
          .array(z.object({ statement: z.string().min(1).max(600), objective_ref: objHandle.nullable(), basis_evidence_refs: z.array(z.string().regex(/^ev_\d+$/)).min(1).max(10), confidence: z.enum(CONFIDENCE_LEVELS) }).strict())
          .max(8),
        successful_patterns: z.array(z.string().max(300)).max(5),
        failed_patterns: z.array(z.string().max(300)).max(5),
        pronunciation_targets: z.array(z.object({ target: z.string().max(60), note: z.string().max(300), basis_evidence_refs: z.array(z.string().regex(/^ev_\d+$/)).min(1) }).strict()).max(5),
      })
      .strict(),
    recommended: z
      .object({
        recommended_activities: z.array(z.object({ activity_type: z.enum(ACTIVITY_TYPES), objective_ref: objHandle, reason: z.string().max(300) }).strict()).max(5),
        parent_actions: z.array(z.object({ action: z.string().max(300), reason: z.string().max(300) }).strict()).max(5),
      })
      .strict(),
    refused_instructions: z.array(z.string().max(300)).max(5).default([]),
  })
  .strict();
export type ReportNarrativeProposal = z.infer<typeof reportNarrativeProposalSchema>;

export const curriculumDraftRequestSchema = z
  .object({
    subject: z.string().min(1).max(60),
    goal: z.string().min(1).max(2000),
    age_years: z.number().int().min(2).max(120).nullable(),
    instruction_language: z.string().min(2).max(12),
    target_language: z.string().min(2).max(12).nullable(),
    source_material: z.string().max(20_000).nullable(),
    units_wanted: z.number().int().min(1).max(12).default(4),
  })
  .strict();
export type CurriculumDraftRequest = z.infer<typeof curriculumDraftRequestSchema>;

/** The provider returns YAML text; it is validated by the same importer as a hand-written file. */
export const curriculumDraftProposalSchema = z.object({ yaml: z.string().min(1).max(400_000), notes: z.string().max(2000).nullable() }).strict();
export type CurriculumDraftProposal = z.infer<typeof curriculumDraftProposalSchema>;
