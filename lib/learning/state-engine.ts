import type { ObjectiveStatus, ConfidenceLevel } from "@/lib/db/enums";
import { OBJECTIVE_STATUS_RANK } from "@/lib/db/enums";
import type { StatePolicy } from "./state-policy";
import { effectiveEvidence, isAssessed, score, sessionKey, type EvidenceRow } from "./evidence-view";

export type StateDecision = {
  status: ObjectiveStatus;
  confidence: ConfidenceLevel;
  ruleVersion: string;
  assessedAttempts: number;
  successRateRecent: number | null;
  distinctLessonCount: number;
  hasHumanOrSystemGradedEvidence: boolean;
  firstSeenAt: Date | null;
  lastAssessedAt: Date | null;
  proficientSince: Date | null;
  decidedByEvidenceIds: string[];
  rationale: {
    policy: string;
    recent_attempts: number;
    recent_rate: number | null;
    total_assessed: number;
    sessions: number;
    ai_graded_only: boolean;
    retention_check: null | { window_start: string; attempts: number; rate: number; passed: boolean };
    human_or_system_assessment_present: boolean;
    base_status: ObjectiveStatus;
    notes: string[];
  };
};

const DAY_MS = 86_400_000;

function baseStatus(assessed: EvidenceRow[], sessions: number, policy: StatePolicy, hadAnyEvidence: boolean): { status: ObjectiveStatus; rate: number | null } {
  const n = assessed.length;
  if (n === 0) return { status: hadAnyEvidence ? "INTRODUCED" : "NOT_STARTED", rate: null };
  const recent = assessed.slice(-policy.recentWindow);
  const rate = recent.reduce((a, r) => a + score(r, policy.partialCreditScore), 0) / recent.length;
  if (n < policy.practisingMinAttempts) return { status: "INTRODUCED", rate };
  let status: ObjectiveStatus = "PRACTISING";
  if (n >= policy.developingMinAttempts && rate >= policy.developingMinRate) status = "DEVELOPING";
  if (n >= policy.proficientMinAttempts && rate >= policy.proficientMinRate && sessions >= policy.proficientMinLessons) status = "PROFICIENT";
  return { status, rate };
}

/**
 * Pure. Same evidence, same policy, same clock: same decision.
 * Evidence is the only input; inferences and recommendations do not exist here.
 */
export function evaluateObjectiveState(rows: EvidenceRow[], policy: StatePolicy, timezone: string, now: Date): StateDecision {
  const rowsEff = effectiveEvidence(rows);
  const assessed = rowsEff.filter(isAssessed);
  const notes: string[] = [];

  const sessionsOf = (list: EvidenceRow[]) => new Set(list.map((r) => sessionKey(r, timezone))).size;
  const sessions = sessionsOf(assessed);

  // Replay the ledger prefix by prefix. Once an objective has been PROFICIENT it
  // is held there while the recent rate stays above proficientHoldRate, and
  // never falls below DEVELOPING (hysteresis, decision D6).
  const max = (a: ObjectiveStatus, b: ObjectiveStatus): ObjectiveStatus => (OBJECTIVE_STATUS_RANK[a] >= OBJECTIVE_STATUS_RANK[b] ? a : b);
  let folded: { status: ObjectiveStatus; rate: number | null } = baseStatus([], 0, policy, rowsEff.length > 0);
  let everProficient = false;
  let streakStart: Date | null = null;
  for (let i = 1; i <= assessed.length; i++) {
    const prefix = assessed.slice(0, i);
    const base = baseStatus(prefix, sessionsOf(prefix), policy, true);
    let st = base.status;
    if (everProficient && base.rate !== null) {
      st = base.rate >= policy.proficientHoldRate ? max(base.status, "PROFICIENT") : max(base.status, "DEVELOPING");
    }
    const proficient = OBJECTIVE_STATUS_RANK[st] >= OBJECTIVE_STATUS_RANK.PROFICIENT;
    if (proficient) {
      everProficient = true;
      if (streakStart === null) streakStart = prefix[i - 1].occurredAt;
    } else {
      streakStart = null;
    }
    folded = { status: st, rate: base.rate };
  }
  const current = folded;
  const proficientSince = OBJECTIVE_STATUS_RANK[current.status] >= OBJECTIVE_STATUS_RANK.PROFICIENT ? streakStart : null;

  const aiOnly = assessed.length > 0 && assessed.every((r) => r.gradedBy === "AI_PROVIDER");
  const humanOrSystemAssessment = rowsEff.some((r) => r.evidenceType === "ASSESSMENT" && isAssessed(r) && r.gradedBy !== "AI_PROVIDER");

  let status = current.status;
  if (aiOnly && OBJECTIVE_STATUS_RANK[status] > OBJECTIVE_STATUS_RANK.PROFICIENT) status = "PROFICIENT";

  let retention: StateDecision["rationale"]["retention_check"] = null;
  if (status === "PROFICIENT" && proficientSince) {
    const windowStart = new Date(proficientSince.getTime() + policy.masteryRetentionDays * DAY_MS);
    const later = assessed.filter((r) => r.occurredAt.getTime() >= windowStart.getTime() && r.occurredAt.getTime() <= now.getTime());
    const rate = later.length ? later.reduce((a, r) => a + score(r, policy.partialCreditScore), 0) / later.length : 0;
    const passed = later.length >= policy.masteryRetentionMinAttempts && rate >= policy.masteryRetentionMinRate && humanOrSystemAssessment && !aiOnly;
    retention = { window_start: windowStart.toISOString(), attempts: later.length, rate, passed };
    if (passed) status = "MASTERED";
    else if (!humanOrSystemAssessment && later.length >= policy.masteryRetentionMinAttempts && rate >= policy.masteryRetentionMinRate) {
      notes.push("retention passed but no human- or system-graded ASSESSMENT exists; MASTERED withheld");
    }
  }
  if (aiOnly) notes.push("all assessed evidence is AI-graded; status capped at PROFICIENT and confidence at MEDIUM");

  const recent = assessed.slice(-policy.recentWindow);
  let confidence: ConfidenceLevel = "LOW";
  if (assessed.length >= policy.confidenceMediumMinAttempts) confidence = "MEDIUM";
  if (
    assessed.length >= policy.confidenceHighMinAttempts &&
    sessions >= policy.confidenceHighMinLessons &&
    recent.some((r) => r.gradedBy !== "AI_PROVIDER")
  ) {
    confidence = "HIGH";
  }
  if (aiOnly && confidence === "HIGH") confidence = "MEDIUM";

  const decidedBy = new Set<string>(recent.map((r) => r.id));
  if (retention) for (const r of assessed) if (r.occurredAt.toISOString() >= retention.window_start) decidedBy.add(r.id);
  const assessmentRow = rowsEff.find((r) => r.evidenceType === "ASSESSMENT" && isAssessed(r) && r.gradedBy !== "AI_PROVIDER");
  if (assessmentRow) decidedBy.add(assessmentRow.id);

  return {
    status,
    confidence,
    ruleVersion: policy.version,
    assessedAttempts: assessed.length,
    successRateRecent: current.rate,
    distinctLessonCount: sessions,
    hasHumanOrSystemGradedEvidence: assessed.some((r) => r.gradedBy !== "AI_PROVIDER"),
    firstSeenAt: rowsEff[0]?.occurredAt ?? null,
    lastAssessedAt: assessed.at(-1)?.occurredAt ?? null,
    proficientSince,
    decidedByEvidenceIds: [...decidedBy].sort(),
    rationale: {
      policy: policy.version,
      recent_attempts: recent.length,
      recent_rate: current.rate,
      total_assessed: assessed.length,
      sessions,
      ai_graded_only: aiOnly,
      retention_check: retention,
      human_or_system_assessment_present: humanOrSystemAssessment,
      base_status: current.status,
      notes,
    },
  };
}
