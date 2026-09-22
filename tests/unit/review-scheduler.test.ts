import { describe, it, expect } from "vitest";
import { computeReviewSchedule, INTERVALS_DAYS } from "@/lib/learning/review-scheduler";
import type { EvidenceRow } from "@/lib/learning/evidence-view";

const T0 = new Date("2026-02-01T09:00:00Z");
const DAY = 86_400_000;
let n = 0;
const ev = (result: EvidenceRow["result"], day: number, lesson = `L${day}`): EvidenceRow => ({
  id: `r${++n}`,
  lessonId: lesson,
  result,
  evidenceType: "PRACTICE",
  gradedBy: "HUMAN",
  confidence: "MEDIUM",
  supersedesEvidenceId: null,
  errorTags: [],
  occurredAt: new Date(T0.getTime() + day * DAY + n * 1000),
});

describe("computeReviewSchedule", () => {
  it("is empty with no evidence", () => {
    const s = computeReviewSchedule([], 0.5);
    expect(s.nextReviewAt).toBeNull();
    expect(s.reviewCount).toBe(0);
  });

  it("expands the interval on each successful session and steps back two on failure", () => {
    const rows = [ev("CORRECT", 0), ev("CORRECT", 0), ev("CORRECT", 1), ev("CORRECT", 3)];
    const s = computeReviewSchedule(rows, 0.5);
    expect(s.reviewCount).toBe(3);
    expect(s.intervalDays).toBe(INTERVALS_DAYS[3]);
    expect(s.nextReviewAt?.getTime()).toBe(rows[3].occurredAt.getTime() + 14 * DAY);

    const failed = [...rows, ev("INCORRECT", 10), ev("INCORRECT", 10)];
    const f = computeReviewSchedule(failed, 0.5);
    expect(f.failureCount).toBe(1);
    expect(f.intervalDays).toBe(INTERVALS_DAYS[1]);
    expect(f.lastSuccessAt).toEqual(rows[3].occurredAt);
  });

  it("never exceeds the last interval", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ev("CORRECT", i));
    expect(computeReviewSchedule(rows, 0.5).intervalDays).toBe(60);
  });
});
