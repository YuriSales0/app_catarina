import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import type { EvidenceResult, ObjectiveStatus } from "@/lib/db/enums";
import { effectiveEvidence, isAssessed, score, type EvidenceRow } from "./evidence-view";
import { CURRENT_STATE_POLICY } from "./state-policy";

/**
 * The long view: how learning has gone over weeks, computed by rules from the
 * ledger. It feeds the context pack (so the AI teacher adapts to the trend,
 * not only to the last lesson) and the family's development page. Nothing
 * here is written by a model, and no model output is read back into it.
 */
export const LONG_TERM_POLICY = { version: "long-term.v1", weeks: 6, trendWindowWeeks: 2, trendMinAttempts: 5, trendDelta: 0.1, securedWindowDays: 30 } as const;

const DAY_MS = 86_400_000;
const SECURE: ObjectiveStatus[] = ["PROFICIENT", "MASTERED"];

export type WeekBucket = { week_start: string; lessons: number; attempts: number; success_rate: number | null };
export type LongTermTrend = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";
export type LongTermProgress = {
  policy_version: string;
  first_lesson_at: string | null;
  lessons_completed: number;
  lessons_last_30_days: number;
  weekly: WeekBucket[];
  trend: LongTermTrend;
  objectives_secure: number;
  objectives_total: number;
  secured_last_30_days: number;
};

export type LongTermInput = {
  now: Date;
  timeZone: string;
  /** Effective, assessed attempts with their credit (1, partial, 0). */
  attempts: Array<{ occurredAt: Date; credit: number }>;
  completedLessons: Date[];
  /** State changes in the subject: only moves into a secure stage from a lower one count. */
  transitions: Array<{ createdAt: Date; fromStatus: ObjectiveStatus; toStatus: ObjectiveStatus }>;
  objectivesSecure: number;
  objectivesTotal: number;
};

export function computeLongTermProgress(input: LongTermInput): LongTermProgress {
  const P = LONG_TERM_POLICY;
  const now = input.now.getTime();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

  // Rolling seven-day windows ending now, oldest first.
  const weekly: WeekBucket[] = Array.from({ length: P.weeks }, (_, i) => {
    const end = now - (P.weeks - 1 - i) * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const inWeek = (t: number) => t > start && t <= end;
    const atts = input.attempts.filter((a) => inWeek(a.occurredAt.getTime()));
    return {
      week_start: day.format(new Date(start + 1)),
      lessons: input.completedLessons.filter((d) => inWeek(d.getTime())).length,
      attempts: atts.length,
      success_rate: atts.length ? round(atts.reduce((a, x) => a + x.credit, 0) / atts.length) : null,
    };
  });

  const window = (fromWeeksAgo: number) => {
    const end = now - fromWeeksAgo * 7 * DAY_MS;
    const start = end - P.trendWindowWeeks * 7 * DAY_MS;
    return input.attempts.filter((a) => a.occurredAt.getTime() > start && a.occurredAt.getTime() <= end);
  };
  const recent = window(0);
  const before = window(P.trendWindowWeeks);
  const rate = (xs: Array<{ credit: number }>) => xs.reduce((a, x) => a + x.credit, 0) / xs.length;
  let trend: LongTermTrend = "INSUFFICIENT_DATA";
  if (recent.length >= P.trendMinAttempts && before.length >= P.trendMinAttempts) {
    const delta = rate(recent) - rate(before);
    trend = delta >= P.trendDelta ? "IMPROVING" : delta <= -P.trendDelta ? "DECLINING" : "STABLE";
  }

  const since30 = now - P.securedWindowDays * DAY_MS;
  const sorted = [...input.completedLessons].sort((a, b) => a.getTime() - b.getTime());
  return {
    policy_version: P.version,
    first_lesson_at: sorted[0]?.toISOString() ?? null,
    lessons_completed: sorted.length,
    lessons_last_30_days: sorted.filter((d) => d.getTime() > since30).length,
    weekly,
    trend,
    objectives_secure: input.objectivesSecure,
    objectives_total: input.objectivesTotal,
    secured_last_30_days: input.transitions.filter((t) => t.createdAt.getTime() > since30 && SECURE.includes(t.toStatus) && !SECURE.includes(t.fromStatus)).length,
  };
}

const round = (x: number) => Math.round(x * 100) / 100;

/** Loads the facts for one enrolment and computes the long view. */
export async function getLongTermProgress(
  access: StudentAccess,
  subjectId: string,
  summary: { secure: number; total: number },
  timeZone: string,
  dbh: DbOrTx = db(),
  now = new Date(),
): Promise<LongTermProgress> {
  const horizon = new Date(now.getTime() - LONG_TERM_POLICY.weeks * 7 * DAY_MS);
  const [evidence, lessons, states] = await Promise.all([
    dbh.query.learningEvidence.findMany({
      where: and(eq(s.learningEvidence.studentId, access.studentId), eq(s.learningEvidence.subjectId, subjectId), gte(s.learningEvidence.occurredAt, horizon)),
      orderBy: asc(s.learningEvidence.occurredAt),
    }),
    dbh.query.lessons.findMany({
      where: and(eq(s.lessons.studentId, access.studentId), eq(s.lessons.subjectId, subjectId), eq(s.lessons.status, "COMPLETED")),
      columns: { completedAt: true },
    }),
    dbh.query.studentObjectiveState.findMany({
      where: and(eq(s.studentObjectiveState.studentId, access.studentId), eq(s.studentObjectiveState.subjectId, subjectId)),
      columns: { objectiveId: true },
    }),
  ]);
  const objectiveIds = states.map((st) => st.objectiveId);
  const transitions = objectiveIds.length
    ? await dbh.query.studentObjectiveStateTransition.findMany({
        where: and(
          eq(s.studentObjectiveStateTransition.studentId, access.studentId),
          inArray(s.studentObjectiveStateTransition.objectiveId, objectiveIds),
          gte(s.studentObjectiveStateTransition.createdAt, new Date(now.getTime() - LONG_TERM_POLICY.securedWindowDays * DAY_MS)),
        ),
        columns: { createdAt: true, fromStatus: true, toStatus: true },
      })
    : [];
  const view: EvidenceRow[] = evidence.map((r) => ({
    id: r.id,
    lessonId: r.lessonId,
    result: r.result as EvidenceResult,
    evidenceType: r.evidenceType,
    gradedBy: r.gradedBy,
    confidence: r.confidence,
    supersedesEvidenceId: r.supersedesEvidenceId,
    errorTags: r.errorTags,
    occurredAt: r.occurredAt,
  }));
  const attempts = effectiveEvidence(view)
    .filter(isAssessed)
    .map((r) => ({ occurredAt: r.occurredAt, credit: score(r, CURRENT_STATE_POLICY.partialCreditScore) }));
  return computeLongTermProgress({
    now,
    timeZone,
    attempts,
    completedLessons: lessons.map((l) => l.completedAt).filter((d): d is Date => Boolean(d)),
    transitions,
    objectivesSecure: summary.secure,
    objectivesTotal: summary.total,
  });
}
