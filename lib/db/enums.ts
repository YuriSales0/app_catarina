/**
 * Single source for every enum. Drizzle pgEnum and Zod enums both derive from
 * these arrays, so a value cannot be added to the database and forgotten in
 * validation.
 */
export const PLATFORM_ROLES = ["USER", "ADMIN"] as const;
export const GUARDIAN_ROLES = ["OWNER", "GUARDIAN", "TEACHER", "VIEWER"] as const;
export const CURRICULUM_SOURCES = [
  "OFFICIAL",
  "SCHOOL",
  "FAMILY",
  "TEACHER",
  "TEXTBOOK",
  "IMPORTED",
  "AI_GENERATED",
  "MARKETPLACE",
] as const;
export const CURRICULUM_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export const VISIBILITIES = ["PRIVATE", "SHARED", "PUBLIC"] as const;
export const OBJECTIVE_STATUSES = [
  "NOT_STARTED",
  "INTRODUCED",
  "PRACTISING",
  "DEVELOPING",
  "PROFICIENT",
  "MASTERED",
] as const;
export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const PREREQUISITE_STRENGTHS = ["HARD", "SOFT"] as const;
export const EVIDENCE_RESULTS = ["CORRECT", "PARTIALLY_CORRECT", "INCORRECT", "NOT_ASSESSED"] as const;
export const EVIDENCE_TYPES = [
  "PRACTICE",
  "ASSESSMENT",
  "OBSERVATION",
  "SELF_REPORT",
  "PARENT_REPORT",
  "CORRECTION",
  "RETRACTION",
] as const;
export const GRADED_BY = ["SYSTEM", "HUMAN", "AI_PROVIDER"] as const;
export const LESSON_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const ACTIVITY_TYPES = [
  "REVIEW",
  "EXPLANATION",
  "PRACTICE",
  "GAME",
  "CONVERSATION",
  "ASSESSMENT",
  "REFLECTION",
  /** Course or module opening: how lessons work, the module's goals, a short diagnostic. */
  "ORIENTATION",
] as const;
export const LESSON_EVENT_TYPES = [
  "LESSON_STARTED",
  "ACTIVITY_STARTED",
  "PROMPT_SHOWN",
  "STUDENT_RESPONSE",
  "CORRECTION",
  "ACTIVITY_COMPLETED",
  "ASSESSMENT_RESULT",
  "TEACHER_NOTE",
  "LESSON_PAUSED",
  "LESSON_COMPLETED",
  "LESSON_CANCELLED",
  "AI_PROPOSAL_RECEIVED",
  "AI_PROPOSAL_REJECTED",
] as const;
export const INFERENCE_SOURCES = ["RULE_ENGINE", "AI_PROVIDER", "HUMAN"] as const;
export const RECOMMENDATION_KINDS = ["REVIEW", "NEXT_OBJECTIVE", "ACTIVITY", "PACING", "PARENT_ACTION"] as const;
export const RECOMMENDATION_SOURCES = ["NEXT_LESSON_ENGINE", "AI_PROVIDER", "HUMAN"] as const;
export const RECOMMENDATION_STATUSES = ["PROPOSED", "ACCEPTED", "REJECTED", "EXPIRED"] as const;
export const ACTOR_TYPES = ["USER", "SYSTEM", "AI_PROVIDER"] as const;
export const AUDIT_RESULTS = ["ALLOWED", "DENIED"] as const;
export const REPORT_GENERATORS = ["SYSTEM", "AI_PROVIDER", "HUMAN"] as const;
export const SNAPSHOT_SCOPES = ["STUDENT", "SUBJECT"] as const;
export const SNAPSHOT_TRIGGERS = ["LESSON_COMPLETED", "SCHEDULED", "MANUAL", "PRE_MIGRATION"] as const;
export const CONSENT_KINDS = ["PROCESSING", "AI_PROCESSING", "AUDIO_RETENTION", "ANALYTICS"] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type GuardianRole = (typeof GUARDIAN_ROLES)[number];
export type CurriculumSource = (typeof CURRICULUM_SOURCES)[number];
export type CurriculumStatus = (typeof CURRICULUM_STATUSES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export type PrerequisiteStrength = (typeof PREREQUISITE_STRENGTHS)[number];
export type EvidenceResult = (typeof EVIDENCE_RESULTS)[number];
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export type GradedBy = (typeof GRADED_BY)[number];
export type LessonStatus = (typeof LESSON_STATUSES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type LessonEventType = (typeof LESSON_EVENT_TYPES)[number];
export type InferenceSource = (typeof INFERENCE_SOURCES)[number];
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];
export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];
export type ActorType = (typeof ACTOR_TYPES)[number];
export type AuditResult = (typeof AUDIT_RESULTS)[number];
export type ReportGenerator = (typeof REPORT_GENERATORS)[number];
export type SnapshotScope = (typeof SNAPSHOT_SCOPES)[number];
export type SnapshotTrigger = (typeof SNAPSHOT_TRIGGERS)[number];
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** Ordering used by prerequisite checks and the engine. */
export const OBJECTIVE_STATUS_RANK: Record<ObjectiveStatus, number> = {
  NOT_STARTED: 0,
  INTRODUCED: 1,
  PRACTISING: 2,
  DEVELOPING: 3,
  PROFICIENT: 4,
  MASTERED: 5,
};

export function statusAtLeast(status: ObjectiveStatus, required: ObjectiveStatus): boolean {
  return OBJECTIVE_STATUS_RANK[status] >= OBJECTIVE_STATUS_RANK[required];
}
