import { effectiveEvidence, isAssessed, score, type EvidenceRow } from "./evidence-view";

/**
 * Fixed expanding intervals (section 18 of the brief: prepare the schema, do
 * not over-build the algorithm). `ease` and `schedulerVersion` exist so SM-2
 * or FSRS can replace this without a migration.
 */
export const SCHEDULER_VERSION = "review-scheduler.v1";
export const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60] as const;
const DAY_MS = 86_400_000;

export type ReviewSchedule = {
  schedulerVersion: string;
  introducedAt: Date | null;
  lastPractisedAt: Date | null;
  lastSuccessAt: Date | null;
  reviewCount: number;
  failureCount: number;
  intervalDays: number;
  nextReviewAt: Date | null;
};

/** Pure fold over the ledger, so a rebuild reproduces the schedule exactly. */
export function computeReviewSchedule(rows: EvidenceRow[], partialCredit: number, successThreshold = 0.75): ReviewSchedule {
  const eff = effectiveEvidence(rows);
  let idx = 0;
  let reviewCount = 0;
  let failureCount = 0;
  let lastPractisedAt: Date | null = null;
  let lastSuccessAt: Date | null = null;
  const introducedAt = eff[0]?.occurredAt ?? null;

  // Group assessed attempts by session (lesson or day) so one lesson is one review.
  const sessions = new Map<string, EvidenceRow[]>();
  for (const r of eff.filter(isAssessed)) {
    const key = r.lessonId ? `lesson:${r.lessonId}` : `day:${r.occurredAt.toISOString().slice(0, 10)}`;
    if (!sessions.has(key)) sessions.set(key, []);
    sessions.get(key)!.push(r);
  }
  const ordered = [...sessions.values()].sort((a, b) => a[0].occurredAt.getTime() - b[0].occurredAt.getTime());
  for (const group of ordered) {
    const rate = group.reduce((a, r) => a + score(r, partialCredit), 0) / group.length;
    const at = group[group.length - 1].occurredAt;
    lastPractisedAt = at;
    reviewCount++;
    if (rate >= successThreshold) {
      lastSuccessAt = at;
      idx = Math.min(idx + 1, INTERVALS_DAYS.length - 1);
    } else {
      failureCount++;
      idx = Math.max(idx - 2, 0);
    }
  }
  const intervalDays = INTERVALS_DAYS[idx];
  return {
    schedulerVersion: SCHEDULER_VERSION,
    introducedAt,
    lastPractisedAt,
    lastSuccessAt,
    reviewCount,
    failureCount,
    intervalDays,
    nextReviewAt: lastPractisedAt ? new Date(lastPractisedAt.getTime() + intervalDays * DAY_MS) : null,
  };
}
