/**
 * Recurring-error detection (architecture 05, step 6). Pure.
 * A tag is recurring when it appears at least `minOccurrences` times across
 * at least `minLessons` distinct sessions inside the window.
 */
export type TaggedAttempt = { id: string; lessonId: string | null; objectiveId: string; errorTags: string[]; occurredAt: Date };

export type RecurringError = {
  errorTag: string;
  occurrences: number;
  lessonIds: string[];
  objectiveIds: string[];
  evidenceIds: string[];
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export const RECURRING_ERROR_POLICY = { windowDays: 30, minOccurrences: 3, minLessons: 2 } as const;

export function findRecurringErrors(attempts: TaggedAttempt[], now: Date, policy = RECURRING_ERROR_POLICY): RecurringError[] {
  const from = now.getTime() - policy.windowDays * 86_400_000;
  const byTag = new Map<string, RecurringError & { sessions: Set<string> }>();
  for (const a of attempts) {
    if (a.occurredAt.getTime() < from || a.occurredAt.getTime() > now.getTime()) continue;
    const session = a.lessonId ?? `day:${a.occurredAt.toISOString().slice(0, 10)}`;
    for (const tag of a.errorTags) {
      const cur = byTag.get(tag) ?? {
        errorTag: tag,
        occurrences: 0,
        lessonIds: [],
        objectiveIds: [],
        evidenceIds: [],
        firstSeenAt: a.occurredAt,
        lastSeenAt: a.occurredAt,
        sessions: new Set<string>(),
      };
      cur.occurrences++;
      cur.sessions.add(session);
      if (a.lessonId && !cur.lessonIds.includes(a.lessonId)) cur.lessonIds.push(a.lessonId);
      if (!cur.objectiveIds.includes(a.objectiveId)) cur.objectiveIds.push(a.objectiveId);
      cur.evidenceIds.push(a.id);
      if (a.occurredAt < cur.firstSeenAt) cur.firstSeenAt = a.occurredAt;
      if (a.occurredAt > cur.lastSeenAt) cur.lastSeenAt = a.occurredAt;
      byTag.set(tag, cur);
    }
  }
  return [...byTag.values()]
    .filter((t) => t.occurrences >= policy.minOccurrences && t.sessions.size >= policy.minLessons)
    .map(({ sessions: _s, ...rest }) => {
      void _s;
      return rest;
    })
    .sort((a, b) => b.occurrences - a.occurrences || a.errorTag.localeCompare(b.errorTag));
}
