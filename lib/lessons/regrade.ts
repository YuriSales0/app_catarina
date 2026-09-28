import { and, eq, inArray, sql, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { EvidenceResult } from "@/lib/db/enums";
import { writeAudit } from "@/lib/audit/write";
import { recomputeObjectiveState } from "@/lib/learning/recompute";

export type GradingFix = { evidenceId: string; result: EvidenceResult; method: string; reason: string };

/**
 * Applies a reviewed batch of grading fixes as CORRECTION rows: the original
 * rows stay, each correction keeps the original's grader and confidence (a
 * fix to how a report was read is not a human judgement), and the state of
 * every touched objective is recomputed. Idempotent: an original that already
 * has a correction is left alone, so running it again changes nothing.
 */
export async function applyGradingFixes(dbh: DbOrTx, input: { fixId: string; policy: string; fixes: GradingFix[] }) {
  if (input.fixes.length === 0) return { applied: 0, skipped: 0 };
  return dbh.transaction(async (tx) => {
    const ids = input.fixes.map((f) => f.evidenceId);
    const originals = await tx.query.learningEvidence.findMany({ where: inArray(s.learningEvidence.id, ids) });
    const corrected = await tx
      .select({ id: s.learningEvidence.supersedesEvidenceId })
      .from(s.learningEvidence)
      .where(and(inArray(s.learningEvidence.supersedesEvidenceId, ids), eq(s.learningEvidence.evidenceType, "CORRECTION")));
    const done = new Set(corrected.map((r) => r.id));
    const byId = new Map(originals.map((r) => [r.id, r]));
    const touched = new Map<string, { studentId: string; objectiveId: string; evidenceId: string }>();
    let applied = 0;
    let skipped = 0;
    for (const fix of input.fixes) {
      const original = byId.get(fix.evidenceId);
      if (!original || done.has(original.id) || original.evidenceType === "CORRECTION" || original.evidenceType === "RETRACTION" || original.result === fix.result) {
        skipped++;
        continue;
      }
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${s.learningEvidence.attemptNumber}), 0) + 1` })
        .from(s.learningEvidence)
        .where(
          and(
            eq(s.learningEvidence.studentId, original.studentId),
            eq(s.learningEvidence.objectiveId, original.objectiveId),
            original.lessonId ? eq(s.learningEvidence.lessonId, original.lessonId) : isNull(s.learningEvidence.lessonId),
            original.activityId ? eq(s.learningEvidence.activityId, original.activityId) : isNull(s.learningEvidence.activityId),
          ),
        );
      const [row] = await tx
        .insert(s.learningEvidence)
        .values({
          studentId: original.studentId,
          subjectId: original.subjectId,
          lessonId: original.lessonId,
          activityId: original.activityId,
          objectiveId: original.objectiveId,
          objectiveLineageId: original.objectiveLineageId,
          skillId: original.skillId,
          attemptNumber: Number(next),
          prompt: original.prompt,
          studentResponse: original.studentResponse,
          expectedResponse: original.expectedResponse,
          result: fix.result,
          correction: original.correction,
          evidenceType: "CORRECTION",
          confidence: original.confidence,
          gradedBy: original.gradedBy,
          graderRef: { ...(original.graderRef ?? {}), method: fix.method, policy: input.policy, reason: fix.reason },
          supersedesEvidenceId: original.id,
          errorTags: original.errorTags,
          metadata: { fix_id: input.fixId, previous_result: original.result },
          occurredAt: new Date(),
        })
        .returning();
      await writeAudit(tx, {
        actorType: "SYSTEM",
        action: "evidence.correction",
        resourceType: "learning_evidence",
        resourceId: original.id,
        studentId: original.studentId,
        result: "ALLOWED",
        reason: input.fixId,
        metadata: { newEvidenceId: row.id },
      });
      touched.set(`${original.studentId}:${original.objectiveId}`, { studentId: original.studentId, objectiveId: original.objectiveId, evidenceId: row.id });
      applied++;
    }
    for (const t of touched.values()) await recomputeObjectiveState(tx, { studentId: t.studentId, objectiveId: t.objectiveId, triggeredByEvidenceId: t.evidenceId });
    return { applied, skipped };
  });
}
