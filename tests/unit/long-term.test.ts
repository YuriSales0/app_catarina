import { describe, it, expect } from "vitest";
import { computeLongTermProgress, LONG_TERM_POLICY } from "@/lib/learning/long-term";

const now = new Date("2026-09-24T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const attempts = (dayAgo: number, n: number, correct: number) => Array.from({ length: n }, (_, i) => ({ occurredAt: daysAgo(dayAgo), credit: i < correct ? 1 : 0 }));
const base = { now, timeZone: "America/Sao_Paulo", completedLessons: [] as Date[], transitions: [], objectivesSecure: 3, objectivesTotal: 33 };

describe("computeLongTermProgress", () => {
  it("buckets six rolling weeks, oldest first, with lessons, attempts and success rate", () => {
    const r = computeLongTermProgress({ ...base, attempts: [...attempts(2, 4, 3), ...attempts(9, 2, 1)], completedLessons: [daysAgo(2), daysAgo(9), daysAgo(60)] });
    expect(r.weekly).toHaveLength(LONG_TERM_POLICY.weeks);
    expect(r.weekly.at(-1)).toMatchObject({ lessons: 1, attempts: 4, success_rate: 0.75 });
    expect(r.weekly.at(-2)).toMatchObject({ lessons: 1, attempts: 2, success_rate: 0.5 });
    expect(r.weekly[0]).toMatchObject({ attempts: 0, success_rate: null });
    expect(r.lessons_completed).toBe(3);
    expect(r.lessons_last_30_days).toBe(2);
    expect(r.first_lesson_at).toBe(daysAgo(60).toISOString());
  });

  it("calls the trend only with enough attempts on both sides", () => {
    const up = computeLongTermProgress({ ...base, attempts: [...attempts(3, 6, 5), ...attempts(17, 6, 2)] });
    expect(up.trend).toBe("IMPROVING");
    const down = computeLongTermProgress({ ...base, attempts: [...attempts(3, 6, 1), ...attempts(17, 6, 5)] });
    expect(down.trend).toBe("DECLINING");
    const flat = computeLongTermProgress({ ...base, attempts: [...attempts(3, 6, 4), ...attempts(17, 6, 4)] });
    expect(flat.trend).toBe("STABLE");
    const thin = computeLongTermProgress({ ...base, attempts: [...attempts(3, 6, 6), ...attempts(17, 2, 0)] });
    expect(thin.trend).toBe("INSUFFICIENT_DATA");
  });

  it("counts only moves into a secure stage within 30 days", () => {
    const r = computeLongTermProgress({
      ...base,
      attempts: [],
      transitions: [
        { createdAt: daysAgo(5), fromStatus: "DEVELOPING", toStatus: "PROFICIENT" },
        { createdAt: daysAgo(6), fromStatus: "PROFICIENT", toStatus: "MASTERED" },
        { createdAt: daysAgo(40), fromStatus: "DEVELOPING", toStatus: "PROFICIENT" },
        { createdAt: daysAgo(2), fromStatus: "INTRODUCED", toStatus: "PRACTISING" },
      ],
    });
    expect(r.secured_last_30_days).toBe(1);
    expect(r).toMatchObject({ objectives_secure: 3, objectives_total: 33 });
  });
});
