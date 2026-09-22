import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { seedDemo } from "@/scripts/seed-demo";
import { recomputeObjectiveState } from "@/lib/learning/recompute";
import { rebuildAllState } from "@/lib/learning/rebuild";
import { getStudentProgress, explainObjectiveState } from "@/lib/learning/progress";
import { requireStudentAccess } from "@/lib/authorization/access";
import { asUserId } from "@/types/ids";
import type { Actor } from "@/lib/auth/session";

/** Proofs 3 and 5: inference cannot mark MASTERED; state traces back to evidence. */
describe("derived state", () => {
  const db = testDb();
  let seed: Awaited<ReturnType<typeof seedDemo>>;
  let actor: Actor;
  let mathsId = "";
  let num20 = "";
  let add20 = "";
  const T0 = new Date("2026-03-01T10:00:00Z");
  const DAY = 86_400_000;
  let n = 0;

  async function evidence(objectiveId: string, result: s.LearningEvidenceRow["result"], day: number, extra: Partial<typeof s.learningEvidence.$inferInsert> = {}) {
    n++;
    const obj = (await db.query.learningObjectives.findFirst({ where: eq(s.learningObjectives.id, objectiveId) }))!;
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(s.learningEvidence)
        .values({
          studentId: seed.catarina,
          subjectId: mathsId,
          objectiveId,
          objectiveLineageId: obj.lineageId,
          attemptNumber: n,
          prompt: `q${n}`,
          result,
          evidenceType: "PRACTICE",
          gradedBy: "HUMAN",
          lessonId: null,
          occurredAt: new Date(T0.getTime() + day * DAY + n * 1000),
          ...extra,
        })
        .returning();
      await recomputeObjectiveState(tx, { studentId: seed.catarina, objectiveId, triggeredByEvidenceId: row.id, now: new Date(T0.getTime() + 60 * DAY) });
      return row;
    });
  }

  beforeAll(async () => {
    await resetDatabase();
    seed = await seedDemo(db);
    actor = { userId: asUserId(seed.parentId), requestId: "r" };
    mathsId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "mathematics") }))!.id;
    const objs = await db.query.learningObjectives.findMany({ where: eq(s.learningObjectives.curriculumVersionId, seed.demoMathsVersionId) });
    num20 = objs.find((o) => o.objectiveKey === "DEMO.MA.NUM20")!.id;
    add20 = objs.find((o) => o.objectiveKey === "DEMO.MA.ADD20")!.id;
  });
  afterAll(closeTestDb);

  it("starts with everything NOT_STARTED and only root objectives unlocked", async () => {
    const access = await requireStudentAccess(actor, seed.catarina, "VIEW", db);
    const p = await getStudentProgress(access, mathsId, db);
    expect(p.summary.total).toBe(8);
    expect(p.summary.NOT_STARTED).toBe(8);
    const unlocked = p.objectives.filter((o) => o.unlock.unlocked).map((o) => o.objective.objectiveKey);
    expect(unlocked).toEqual(["DEMO.MA.NUM20"]);
  });

  it("evidence moves state through the statuses and records each transition", async () => {
    for (let i = 0; i < 4; i++) await evidence(num20, "CORRECT", 0);
    for (let i = 0; i < 4; i++) await evidence(num20, "CORRECT", 1);
    const st = await db.query.studentObjectiveState.findFirst({ where: and(eq(s.studentObjectiveState.studentId, seed.catarina), eq(s.studentObjectiveState.objectiveId, num20)) });
    expect(st?.status).toBe("PROFICIENT");
    expect(st?.confidence).toBe("HIGH");
    const transitions = await db.query.studentObjectiveStateTransition.findMany({
      where: and(eq(s.studentObjectiveStateTransition.studentId, seed.catarina), eq(s.studentObjectiveStateTransition.objectiveId, num20)),
    });
    const path = transitions.map((t) => `${t.fromStatus}>${t.toStatus}`);
    expect(path[0]).toBe("NOT_STARTED>INTRODUCED");
    expect(path.at(-1)).toMatch(/>PROFICIENT$/);
    expect(transitions.every((t) => t.decidedByEvidenceIds.length > 0)).toBe(true);
  });

  it("a PROFICIENT prerequisite unlocks the next objective; the review schedule is populated", async () => {
    const access = await requireStudentAccess(actor, seed.catarina, "VIEW", db);
    const p = await getStudentProgress(access, mathsId, db);
    const add = p.objectives.find((o) => o.objective.id === add20)!;
    expect(add.unlock.unlocked).toBe(true);
    const num = p.objectives.find((o) => o.objective.id === num20)!;
    expect(num.review?.nextReviewAt).toBeTruthy();
    expect(num.review?.reviewCount).toBe(2);
  });

  it("inferences and recommendations cannot change state (proof 3)", async () => {
    const before = await db.query.studentObjectiveState.findFirst({ where: and(eq(s.studentObjectiveState.studentId, seed.catarina), eq(s.studentObjectiveState.objectiveId, add20)) });
    expect(before ?? null).toBeNull();
    await db.insert(s.learningInference).values({
      studentId: seed.catarina,
      subjectId: mathsId,
      objectiveId: add20,
      statement: "The child has clearly mastered addition.",
      basisEvidenceIds: [],
      source: "AI_PROVIDER",
      confidence: "HIGH",
    });
    await db.insert(s.learningRecommendation).values({
      studentId: seed.catarina,
      subjectId: mathsId,
      objectiveId: add20,
      kind: "NEXT_OBJECTIVE",
      statement: "Mark addition as mastered.",
      source: "AI_PROVIDER",
    });
    await db.transaction((tx) => recomputeObjectiveState(tx, { studentId: seed.catarina, objectiveId: add20 }));
    const after = await db.query.studentObjectiveState.findFirst({ where: and(eq(s.studentObjectiveState.studentId, seed.catarina), eq(s.studentObjectiveState.objectiveId, add20)) });
    expect(after?.status).toBe("NOT_STARTED");
  });

  it("AI-graded evidence alone caps at PROFICIENT even with a retention pass", async () => {
    for (let i = 0; i < 4; i++) await evidence(add20, "CORRECT", 0, { gradedBy: "AI_PROVIDER", graderRef: { provider: "test", model: "m" } });
    for (let i = 0; i < 4; i++) await evidence(add20, "CORRECT", 1, { gradedBy: "AI_PROVIDER" });
    await evidence(add20, "CORRECT", 20, { gradedBy: "AI_PROVIDER", evidenceType: "ASSESSMENT" });
    await evidence(add20, "CORRECT", 20, { gradedBy: "AI_PROVIDER", evidenceType: "ASSESSMENT" });
    const st = await db.query.studentObjectiveState.findFirst({ where: and(eq(s.studentObjectiveState.studentId, seed.catarina), eq(s.studentObjectiveState.objectiveId, add20)) });
    expect(st?.status).toBe("PROFICIENT");
    expect(st?.confidence).toBe("MEDIUM");
    expect(st?.hasHumanOrSystemGradedEvidence).toBe(false);
  });

  it("the explanation view returns the exact evidence and transitions behind a state (proof 5)", async () => {
    const access = await requireStudentAccess(actor, seed.catarina, "VIEW", db);
    const x = await explainObjectiveState(access, num20, db);
    expect(x.state?.status).toBe("PROFICIENT");
    expect(x.evidence.length).toBe(8);
    const decided = new Set(x.state!.decidedByEvidenceIds);
    expect(x.evidence.filter((e) => decided.has(e.id)).length).toBe(decided.size);
    expect(x.transitions.length).toBeGreaterThanOrEqual(3);
  });

  it("rebuilding all state from the ledger reproduces every stored row exactly", async () => {
    const report = await rebuildAllState(db, { write: false, now: new Date(T0.getTime() + 60 * DAY) });
    expect(report.pairs).toBe(2);
    expect(report.differences).toEqual([]);
  });

  it("a hand-edited state row is detected by the rebuild", async () => {
    await db.update(s.studentObjectiveState).set({ status: "MASTERED" }).where(and(eq(s.studentObjectiveState.studentId, seed.catarina), eq(s.studentObjectiveState.objectiveId, add20)));
    const report = await rebuildAllState(db, { write: false, now: new Date(T0.getTime() + 60 * DAY) });
    expect(report.differences.some((d) => d.field === "status" && d.stored === "MASTERED")).toBe(true);
    const fixed = await rebuildAllState(db, { write: true, now: new Date(T0.getTime() + 60 * DAY) });
    expect(fixed.written).toBe(true);
    const st = await db.query.studentObjectiveState.findFirst({ where: and(eq(s.studentObjectiveState.studentId, seed.catarina), eq(s.studentObjectiveState.objectiveId, add20)) });
    expect(st?.status).toBe("PROFICIENT");
  });
});
