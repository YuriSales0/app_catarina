import type { EvidenceResult, EvidenceType, GradedBy, ConfidenceLevel } from "@/lib/db/enums";

/** The subset of a ledger row the pure engines read. */
export type EvidenceRow = {
  id: string;
  lessonId: string | null;
  result: EvidenceResult;
  evidenceType: EvidenceType;
  gradedBy: GradedBy;
  confidence: ConfidenceLevel;
  supersedesEvidenceId: string | null;
  errorTags: string[];
  occurredAt: Date;
};

/**
 * Resolves corrections and retractions: a CORRECTION replaces the row it
 * supersedes (keeping the original's position in time); a RETRACTION removes
 * it. Neither correction nor retraction rows count as attempts themselves.
 * Returns rows in chronological order.
 */
export function effectiveEvidence(rows: EvidenceRow[]): EvidenceRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const replaced = new Map<string, EvidenceRow>();
  const removed = new Set<string>();
  const sorted = [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id));
  for (const r of sorted) {
    if (r.evidenceType === "RETRACTION" && r.supersedesEvidenceId) removed.add(r.supersedesEvidenceId);
    if (r.evidenceType === "CORRECTION" && r.supersedesEvidenceId && byId.has(r.supersedesEvidenceId)) {
      const original = byId.get(r.supersedesEvidenceId)!;
      // The latest correction wins; it inherits the original's time.
      replaced.set(original.id, { ...r, occurredAt: original.occurredAt, evidenceType: original.evidenceType });
    }
  }
  const out: EvidenceRow[] = [];
  for (const r of sorted) {
    if (r.evidenceType === "RETRACTION" || r.evidenceType === "CORRECTION") continue;
    if (removed.has(r.id)) continue;
    out.push(replaced.get(r.id) ?? r);
  }
  return out;
}

export function isAssessed(r: EvidenceRow): boolean {
  return r.result !== "NOT_ASSESSED";
}

export function score(r: EvidenceRow, partialCredit: number): number {
  if (r.result === "CORRECT") return 1;
  if (r.result === "PARTIALLY_CORRECT") return partialCredit;
  return 0;
}

/** A session key: the lesson, or the local calendar day for lesson-less evidence. */
export function sessionKey(r: EvidenceRow, timezone: string): string {
  if (r.lessonId) return `lesson:${r.lessonId}`;
  return `day:${localDay(r.occurredAt, timezone)}`;
}

export function localDay(d: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
