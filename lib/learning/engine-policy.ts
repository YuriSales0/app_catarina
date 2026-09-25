/**
 * Scoring weights for the Next Lesson Engine (architecture 05). Named and
 * versioned; every plan records the version it was produced under.
 */
export type EnginePolicy = {
  version: string;
  reviewOverdueBase: number;
  reviewOverduePerDay: number;
  reviewOverdueCap: number;
  developing: number;
  practising: number;
  introduced: number;
  notStartedFrontier: number;
  recurringErrorPerTag: number;
  recurringErrorCap: number;
  sequencePenaltyPerPosition: number;
  softPrerequisitePenalty: number;
  recentPrimaryPenalty: number;
  recentPrimaryWindow: number;
  grindingPenalty: number;
  grindingCount: number;
  grindingWindow: number;
  noSuccessPenalty: number;
  noSuccessWindow: number;
  difficultyGapPenalty: number;
  difficultyGapAllowed: number;
  maxReviewObjectives: number;
  /**
   * Units open in order: an objective in a later unit that is below this
   * status (new, or only touched by a level check) is not taught until every
   * objective of the earlier units has reached it. Unset (v1) means no gate.
   */
  unitGateStatus?: "INTRODUCED" | "PRACTISING" | "DEVELOPING";
};

export const ENGINE_POLICY_V1: EnginePolicy = {
  version: "engine-policy.v1",
  reviewOverdueBase: 50,
  reviewOverduePerDay: 2,
  reviewOverdueCap: 30,
  developing: 40,
  practising: 30,
  introduced: 20,
  notStartedFrontier: 15,
  recurringErrorPerTag: 25,
  recurringErrorCap: 50,
  sequencePenaltyPerPosition: 0.1,
  softPrerequisitePenalty: 20,
  recentPrimaryPenalty: 35,
  recentPrimaryWindow: 2,
  grindingPenalty: 60,
  grindingCount: 3,
  grindingWindow: 5,
  noSuccessPenalty: 25,
  noSuccessWindow: 4,
  difficultyGapPenalty: 15,
  difficultyGapAllowed: 2,
  maxReviewObjectives: 2,
};

/**
 * v2: after a beginner's second lesson jumped from the days of the week to
 * the past tense in another unit, new units open only once the earlier ones
 * are all being practised; and units placed out at enrolment are skipped.
 */
export const ENGINE_POLICY_V2: EnginePolicy = { ...ENGINE_POLICY_V1, version: "engine-policy.v2", unitGateStatus: "PRACTISING" };

export const CURRENT_ENGINE_POLICY = ENGINE_POLICY_V2;
export const ENGINE_VERSION = "engine.v2";
