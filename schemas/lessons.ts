import { z } from "zod";
import { EVIDENCE_RESULTS, LESSON_EVENT_TYPES, CONFIDENCE_LEVELS } from "@/lib/db/enums";

const uuid = z.string().uuid();
const optionalUuid = uuid.optional().or(z.literal("").transform(() => undefined));

export const createManualLessonSchema = z
  .object({
    subjectId: uuid,
    primaryObjectiveId: uuid,
    reviewObjectiveIds: z.array(uuid).max(2).default([]),
    plannedDurationMinutes: z.coerce.number().int().min(5).max(90).optional(),
    idempotencyKey: z.string().min(1).max(100).optional(),
  })
  .strict();
export type CreateManualLessonInput = z.infer<typeof createManualLessonSchema>;

export const RECORDABLE_EVIDENCE_TYPES = ["PRACTICE", "ASSESSMENT", "OBSERVATION", "PARENT_REPORT"] as const;

export const recordEvidenceSchema = z
  .object({
    lessonId: optionalUuid,
    activityId: optionalUuid,
    objectiveId: uuid,
    skillId: optionalUuid,
    prompt: z.string().trim().min(1).max(2000),
    studentResponse: z.string().trim().max(4000).optional().or(z.literal("").transform(() => undefined)),
    expectedResponse: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
    result: z.enum(EVIDENCE_RESULTS),
    correction: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
    evidenceType: z.enum(RECORDABLE_EVIDENCE_TYPES).default("PRACTICE"),
    confidence: z.enum(CONFIDENCE_LEVELS).default("MEDIUM"),
    errorTags: z.array(z.string().min(1).max(64)).max(10).default([]),
    occurredAt: z.coerce.date().optional(),
  })
  .strict();
export type RecordEvidenceInput = z.infer<typeof recordEvidenceSchema>;

export const correctEvidenceSchema = z
  .object({
    evidenceId: uuid,
    mode: z.enum(["CORRECTION", "RETRACTION"]),
    result: z.enum(EVIDENCE_RESULTS).optional(),
    correction: z.string().trim().max(2000).optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type CorrectEvidenceInput = z.infer<typeof correctEvidenceSchema>;

export const recordEventSchema = z
  .object({
    lessonId: uuid,
    activityId: optionalUuid,
    eventType: z.enum(LESSON_EVENT_TYPES),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type RecordEventInput = z.infer<typeof recordEventSchema>;

export const completeLessonSchema = z
  .object({
    lessonId: uuid,
    actualDurationMinutes: z.coerce.number().int().min(1).max(240).optional(),
    teacherNote: z.string().trim().max(4000).optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();
export type CompleteLessonInput = z.infer<typeof completeLessonSchema>;
