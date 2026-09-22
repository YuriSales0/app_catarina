import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import { recomputeObjectiveState } from "./recompute";

export type RebuildReport = {
  pairs: number;
  differences: Array<{ studentId: string; objectiveId: string; field: string; stored: unknown; recomputed: unknown }>;
  written: boolean;
};

const COMPARED_STATE_FIELDS = [
  "status",
  "confidence",
  "assessedAttempts",
  "successRateRecent",
  "distinctLessonCount",
  "hasHumanOrSystemGradedEvidence",
  "firstSeenAt",
  "lastAssessedAt",
  "proficientSince",
  "ruleVersion",
  "decidedByEvidenceIds",
] as const;

/**
 * Proves the invariant "state is derived, never asserted": every stored state
 * row must equal what the engine produces from the ledger alone.
 */
export async function rebuildAllState(dbh: Db, opts: { write: boolean; now?: Date }): Promise<RebuildReport> {
  const now = opts.now ?? new Date();
  const pairs = await dbh
    .selectDistinct({ studentId: s.learningEvidence.studentId, objectiveId: s.learningEvidence.objectiveId })
    .from(s.learningEvidence);
  // Also include state rows that exist without evidence (should not happen; reported if so).
  const stateRows = await dbh.select().from(s.studentObjectiveState);
  const keys = new Set(pairs.map((p) => `${p.studentId}:${p.objectiveId}`));
  for (const st of stateRows) keys.add(`${st.studentId}:${st.objectiveId}`);

  const differences: RebuildReport["differences"] = [];
  const stateByKey = new Map(stateRows.map((st) => [`${st.studentId}:${st.objectiveId}`, st]));

  for (const key of keys) {
    const [studentId, objectiveId] = key.split(":");
    const stored = stateByKey.get(key) ?? null;
    if (opts.write) {
      await dbh.transaction((tx) => recomputeObjectiveState(tx, { studentId, objectiveId, now, recordTransition: false }));
      continue;
    }
    // Dry run: compute inside a transaction that is rolled back.
    let recomputed: Awaited<ReturnType<typeof recomputeObjectiveState>> | null = null;
    await dbh
      .transaction(async (tx) => {
        recomputed = await recomputeObjectiveState(tx, { studentId, objectiveId, now, recordTransition: false });
        await tx.execute(sql`select 1`);
        throw new RollbackSignal();
      })
      .catch((e) => {
        if (!(e instanceof RollbackSignal)) throw e;
      });
    const r = recomputed as Awaited<ReturnType<typeof recomputeObjectiveState>> | null;
    if (!r) continue;
    if (!stored) {
      differences.push({ studentId, objectiveId, field: "(row)", stored: null, recomputed: r.decision.status });
      continue;
    }
    const d = r.decision;
    const expected: Record<(typeof COMPARED_STATE_FIELDS)[number], unknown> = {
      status: d.status,
      confidence: d.confidence,
      assessedAttempts: d.assessedAttempts,
      successRateRecent: d.successRateRecent === null ? null : d.successRateRecent.toFixed(3),
      distinctLessonCount: d.distinctLessonCount,
      hasHumanOrSystemGradedEvidence: d.hasHumanOrSystemGradedEvidence,
      firstSeenAt: d.firstSeenAt?.toISOString() ?? null,
      lastAssessedAt: d.lastAssessedAt?.toISOString() ?? null,
      proficientSince: d.proficientSince?.toISOString() ?? null,
      ruleVersion: d.ruleVersion,
      decidedByEvidenceIds: d.decidedByEvidenceIds,
    };
    for (const f of COMPARED_STATE_FIELDS) {
      const sv = stored[f] instanceof Date ? (stored[f] as Date).toISOString() : stored[f];
      const a = JSON.stringify(sv);
      const b = JSON.stringify(expected[f]);
      if (a !== b) differences.push({ studentId, objectiveId, field: f, stored: sv, recomputed: expected[f] });
    }
  }
  return { pairs: keys.size, differences, written: opts.write };
}

class RollbackSignal extends Error {}
