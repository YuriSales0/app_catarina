/**
 * Branded identifiers. A LessonId cannot be passed where a StudentId is
 * expected, which is a real bug class in a schema with this many UUIDs.
 */
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Brand<string, "UserId">;
export type StudentId = Brand<string, "StudentId">;
export type SubjectId = Brand<string, "SubjectId">;
export type SkillId = Brand<string, "SkillId">;
export type StudentSubjectId = Brand<string, "StudentSubjectId">;
export type CurriculumId = Brand<string, "CurriculumId">;
export type CurriculumVersionId = Brand<string, "CurriculumVersionId">;
export type CurriculumUnitId = Brand<string, "CurriculumUnitId">;
export type ObjectiveId = Brand<string, "ObjectiveId">;
export type LessonId = Brand<string, "LessonId">;
export type ActivityId = Brand<string, "ActivityId">;
export type EvidenceId = Brand<string, "EvidenceId">;
export type SnapshotId = Brand<string, "SnapshotId">;
export type RecommendationId = Brand<string, "RecommendationId">;

/** Unsafe cast helpers, to be used only at validated boundaries. */
export const asUserId = (s: string) => s as UserId;
export const asStudentId = (s: string) => s as StudentId;
export const asSubjectId = (s: string) => s as SubjectId;
export const asSkillId = (s: string) => s as SkillId;
export const asCurriculumId = (s: string) => s as CurriculumId;
export const asCurriculumVersionId = (s: string) => s as CurriculumVersionId;
export const asObjectiveId = (s: string) => s as ObjectiveId;
export const asLessonId = (s: string) => s as LessonId;
export const asActivityId = (s: string) => s as ActivityId;
export const asEvidenceId = (s: string) => s as EvidenceId;
export const asSnapshotId = (s: string) => s as SnapshotId;
export const asRecommendationId = (s: string) => s as RecommendationId;
