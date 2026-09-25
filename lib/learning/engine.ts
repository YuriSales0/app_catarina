import type { ObjectiveStatus, ConfidenceLevel } from "@/lib/db/enums";
import { OBJECTIVE_STATUS_RANK } from "@/lib/db/enums";
import { evaluateUnlock, type PrerequisiteEdge, type UnlockResult } from "./prerequisites";
import type { EnginePolicy } from "./engine-policy";
import type { EngineRationale } from "@/schemas/lesson-plan";

/**
 * The Next Lesson Engine core. Pure: no database, no clock of its own, no
 * randomness, no network, no AI. Same input, same output.
 */
export type EngineObjective = {
  id: string;
  code: string;
  title: string;
  lineageId: string;
  unitKey: string;
  unitOrder: number;
  sequence: number;
  difficulty: number;
  unitActive: boolean;
  /** In a unit before the child's confirmed starting point: not taught, and met as a prerequisite. */
  placedOut?: boolean;
  status: ObjectiveStatus;
  confidence: ConfidenceLevel;
  decidedByEvidenceIds: string[];
  proficientSince: Date | null;
  nextReviewAt: Date | null;
  lastSuccessAt: Date | null;
};

export type EngineRecurringError = { errorTag: string; occurrences: number; lessonIds: string[]; objectiveIds: string[] };
export type EngineRecentLesson = { id: string; primaryObjectiveId: string; completedAt: Date | null; status: string };

export type EngineInput = {
  objectives: EngineObjective[];
  edges: PrerequisiteEdge[];
  recurringErrors: EngineRecurringError[];
  /** Newest first. */
  recentLessons: EngineRecentLesson[];
  /** Objective ids that had at least one successful attempt within the last `noSuccessWindow` lessons of that objective. */
  successWithinWindow: Set<string>;
  now: Date;
  hasCurriculum: boolean;
};

export type Candidate = {
  objective: EngineObjective;
  unlock: UnlockResult;
  score: number;
  breakdown: Array<{ component: string; value: number }>;
  reasons: EngineRationale["selected_because"];
};

export type EngineDecision = {
  outcome: "PLANNED" | "CURRICULUM_COMPLETE" | "BLOCKED" | "NEEDS_CURRICULUM" | "REVIEW_ONLY";
  primary: Candidate | null;
  reviews: Array<{ objective: EngineObjective; daysOverdue: number | null }>;
  blocking: EngineObjective[];
  rejected: EngineRationale["alternatives_rejected"];
  candidatesConsidered: number;
  policyVersion: string;
};

const DAY_MS = 86_400_000;
const rank = (s: ObjectiveStatus) => OBJECTIVE_STATUS_RANK[s];

function daysOverdue(o: EngineObjective, now: Date): number | null {
  if (!o.nextReviewAt) return null;
  const d = (now.getTime() - o.nextReviewAt.getTime()) / DAY_MS;
  return d >= 0 ? Math.floor(d) : null;
}

export function selectNextObjective(input: EngineInput, policy: EnginePolicy): EngineDecision {
  const empty = (outcome: EngineDecision["outcome"], extra: Partial<EngineDecision> = {}): EngineDecision => ({
    outcome,
    primary: null,
    reviews: [],
    blocking: [],
    rejected: [],
    candidatesConsidered: 0,
    policyVersion: policy.version,
    ...extra,
  });
  if (!input.hasCurriculum || input.objectives.length === 0) return empty("NEEDS_CURRICULUM");

  const lineageOf = new Map(input.objectives.map((o) => [o.id, o.lineageId]));
  const statusByLineage = new Map<string, ObjectiveStatus>();
  for (const o of input.objectives) {
    const prev = statusByLineage.get(o.lineageId);
    if (!prev || rank(o.status) > rank(prev)) statusByLineage.set(o.lineageId, o.status);
  }
  const ordered = [...input.objectives].sort((a, b) => a.unitOrder - b.unitOrder || a.sequence - b.sequence || a.id.localeCompare(b.id));
  const positionOf = new Map(ordered.map((o, i) => [o.id, i]));
  const byId = new Map(ordered.map((o) => [o.id, o]));

  // Reviews due: PROFICIENT or MASTERED past next_review_at, most overdue first.
  const reviewsDue = ordered
    .filter((o) => rank(o.status) >= rank("PROFICIENT") && daysOverdue(o, input.now) !== null)
    .map((o) => ({ objective: o, daysOverdue: daysOverdue(o, input.now) }))
    .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0) || positionOf.get(a.objective.id)! - positionOf.get(b.objective.id)!);

  const rejected: EngineRationale["alternatives_rejected"] = [];
  const blocking: EngineObjective[] = [];
  const candidates: Candidate[] = [];

  const placedOutLineages = new Set(ordered.filter((o) => o.placedOut).map((o) => o.lineageId));
  const unlockOf = (id: string) => evaluateUnlock(id, input.edges, lineageOf, statusByLineage, placedOutLineages);

  // Unit gate: the first unit, in order, still below the gate status is the last one open for new objectives.
  let openUpTo = Number.POSITIVE_INFINITY;
  if (policy.unitGateStatus) {
    const gate = rank(policy.unitGateStatus);
    const firstOpen = ordered.find((o) => !o.placedOut && o.unitActive && rank(o.status) < gate);
    if (firstOpen) openUpTo = firstOpen.unitOrder;
  }

  // Frontier: the first NOT_STARTED objective in curriculum order that is unlocked, in an open unit.
  const frontierId = ordered.find((o) => o.status === "NOT_STARTED" && o.unitActive && !o.placedOut && o.unitOrder <= openUpTo && unlockOf(o.id).unlocked)?.id ?? null;

  const recentPrimaries = input.recentLessons.filter((l) => l.status === "COMPLETED" || l.status === "IN_PROGRESS" || l.status === "PLANNED").map((l) => l.primaryObjectiveId);
  const recurringByObjective = new Map<string, EngineRecurringError[]>();
  for (const r of input.recurringErrors) for (const oid of r.objectiveIds) recurringByObjective.set(oid, [...(recurringByObjective.get(oid) ?? []), r]);
  const workingLevel = Math.max(1, ...ordered.filter((o) => rank(o.status) >= rank("DEVELOPING")).map((o) => o.difficulty));

  for (const o of ordered) {
    if (!o.unitActive) {
      rejected.push({ objective_code: o.code, reason: "INACTIVE" });
      continue;
    }
    if (o.placedOut) {
      rejected.push({ objective_code: o.code, reason: "PLACED_OUT" });
      continue;
    }
    // Later units stay closed, also for objectives a level check only touched.
    if (o.unitOrder > openUpTo && policy.unitGateStatus && rank(o.status) < rank(policy.unitGateStatus)) {
      rejected.push({ objective_code: o.code, reason: "UNIT_NOT_OPEN" });
      continue;
    }
    const unlock = unlockOf(o.id);
    if (!unlock.unlocked) {
      rejected.push({ objective_code: o.code, reason: "LOCKED", blocking: unlock.hardBlockers.map((b) => byId.get(b.prerequisiteObjectiveId)?.code ?? b.prerequisiteObjectiveId) });
      for (const b of unlock.hardBlockers) {
        const bo = byId.get(b.prerequisiteObjectiveId);
        if (bo && !blocking.some((x) => x.id === bo.id)) blocking.push(bo);
      }
      continue;
    }
    // Locked objectives never enter scoring; nothing below can resurrect them.
    const breakdown: Candidate["breakdown"] = [];
    const reasons: Candidate["reasons"] = [];
    let score = 0;
    const add = (component: string, value: number) => {
      if (value === 0) return;
      score += value;
      breakdown.push({ component, value });
    };

    const overdue = daysOverdue(o, input.now);
    if (o.status === "MASTERED") {
      // Mastered objectives are never the primary target; when due they fill review slots.
      rejected.push({ objective_code: o.code, reason: "MASTERED" });
      continue;
    }
    if (o.status === "PROFICIENT") {
      if (overdue !== null) {
        add("review_overdue", policy.reviewOverdueBase + Math.min(policy.reviewOverdueCap, overdue * policy.reviewOverduePerDay));
        reasons.push({ kind: "REVIEW_DUE", days_overdue: overdue, last_success_at: o.lastSuccessAt?.toISOString() ?? null });
        if (o.proficientSince) reasons.push({ kind: "RETENTION_CHECK", proficient_since: o.proficientSince.toISOString() });
      } else {
        // PROFICIENT and not due: eligible for review slots only, not as primary.
        rejected.push({ objective_code: o.code, reason: "LOWER_PRIORITY", score: 0 });
        continue;
      }
    }
    if (o.status === "DEVELOPING") {
      add("status_developing", policy.developing);
      reasons.push({ kind: "DEVELOPING_CONTINUATION", evidence_ids: o.decidedByEvidenceIds });
    }
    if (o.status === "PRACTISING") {
      add("status_practising", policy.practising);
      reasons.push({ kind: "PRACTISING_CONTINUATION", evidence_ids: o.decidedByEvidenceIds });
    }
    if (o.status === "INTRODUCED") {
      add("status_introduced", policy.introduced);
      reasons.push({ kind: "INTRODUCED_CONTINUATION", evidence_ids: o.decidedByEvidenceIds });
    }
    if (o.status === "NOT_STARTED" && o.id === frontierId) {
      add("next_in_sequence", policy.notStartedFrontier);
      reasons.push({ kind: "NEXT_IN_SEQUENCE", unit: o.unitKey, position: positionOf.get(o.id)! + 1 });
    }
    const recs = recurringByObjective.get(o.id) ?? [];
    if (recs.length) {
      add("recurring_errors", Math.min(policy.recurringErrorCap, recs.length * policy.recurringErrorPerTag));
      for (const r of recs) reasons.push({ kind: "RECURRING_ERROR", error_tag: r.errorTag, occurrences: r.occurrences, lesson_ids: r.lessonIds });
    }
    add("sequence_position", -positionOf.get(o.id)! * policy.sequencePenaltyPerPosition);
    if (unlock.softUnmet.length) add("soft_prerequisites_unmet", -unlock.softUnmet.length * policy.softPrerequisitePenalty);
    if (recentPrimaries.slice(0, policy.recentPrimaryWindow).includes(o.id)) add("recently_taught", -policy.recentPrimaryPenalty);
    if (recentPrimaries.slice(0, policy.grindingWindow).filter((id) => id === o.id).length >= policy.grindingCount) add("grinding", -policy.grindingPenalty);
    if (rank(o.status) >= rank("INTRODUCED") && rank(o.status) < rank("PROFICIENT") && recentPrimaries.includes(o.id) && !input.successWithinWindow.has(o.id)) {
      add("no_recent_success", -policy.noSuccessPenalty);
    }
    if (o.difficulty - workingLevel > policy.difficultyGapAllowed) add("difficulty_gap", -policy.difficultyGapPenalty);

    candidates.push({ objective: o, unlock, score, breakdown, reasons });
  }

  if (candidates.length === 0) {
    if (reviewsDue.length) return empty("REVIEW_ONLY", { reviews: reviewsDue.slice(0, policy.maxReviewObjectives), rejected });
    const allMastered = ordered.every((o) => o.status === "MASTERED" || !o.unitActive);
    if (allMastered) return empty("CURRICULUM_COMPLETE", { rejected });
    return empty("BLOCKED", { blocking, rejected });
  }

  // Total order: score, then curriculum position, then id. No randomness.
  candidates.sort((a, b) => b.score - a.score || positionOf.get(a.objective.id)! - positionOf.get(b.objective.id)! || a.objective.id.localeCompare(b.objective.id));
  const primary = candidates[0];
  for (const c of candidates.slice(1)) {
    const recentlyTaught = c.breakdown.some((b) => b.component === "recently_taught" || b.component === "grinding");
    rejected.push({ objective_code: c.objective.code, reason: recentlyTaught ? "RECENTLY_TAUGHT" : "LOWER_PRIORITY", score: Math.round(c.score * 100) / 100 });
  }
  const reviews = reviewsDue.filter((r) => r.objective.id !== primary.objective.id).slice(0, policy.maxReviewObjectives);
  return { outcome: "PLANNED", primary, reviews, blocking, rejected, candidatesConsidered: candidates.length, policyVersion: policy.version };
}
