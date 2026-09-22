import type { AssessmentPolicyOverride } from "@/lib/db/schema";

/**
 * Versioned thresholds that turn evidence into a status (decision D6).
 * Every state row records the policy version it was decided under.
 */
export type StatePolicy = {
  version: string;
  recentWindow: number;
  practisingMinAttempts: number;
  developingMinAttempts: number;
  developingMinRate: number;
  proficientMinAttempts: number;
  proficientMinRate: number;
  proficientMinLessons: number;
  /** Below this recent rate a PROFICIENT objective falls back to DEVELOPING. */
  proficientHoldRate: number;
  masteryRetentionDays: number;
  masteryRetentionMinAttempts: number;
  masteryRetentionMinRate: number;
  confidenceHighMinAttempts: number;
  confidenceHighMinLessons: number;
  confidenceMediumMinAttempts: number;
  partialCreditScore: number;
};

export const STATE_POLICY_V1: StatePolicy = {
  version: "state-policy.v1",
  recentWindow: 10,
  practisingMinAttempts: 3,
  developingMinAttempts: 5,
  developingMinRate: 0.6,
  proficientMinAttempts: 8,
  proficientMinRate: 0.8,
  proficientMinLessons: 2,
  proficientHoldRate: 0.6,
  masteryRetentionDays: 14,
  masteryRetentionMinAttempts: 2,
  masteryRetentionMinRate: 0.8,
  confidenceHighMinAttempts: 8,
  confidenceHighMinLessons: 2,
  confidenceMediumMinAttempts: 4,
  partialCreditScore: 0.5,
};

export const CURRENT_STATE_POLICY = STATE_POLICY_V1;

export function applyObjectiveOverride(policy: StatePolicy, override: AssessmentPolicyOverride | null | undefined): StatePolicy {
  if (!override) return policy;
  return {
    ...policy,
    developingMinAttempts: override.developingMinAttempts ?? policy.developingMinAttempts,
    proficientMinAttempts: override.proficientMinAttempts ?? policy.proficientMinAttempts,
    proficientMinRate: override.proficientMinRate ?? policy.proficientMinRate,
    masteryRetentionDays: override.masteryRetentionDays ?? policy.masteryRetentionDays,
  };
}
