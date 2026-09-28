import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { seedDemo } from "@/scripts/seed-demo";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { createManualLesson, getLesson } from "@/lib/lessons/service";
import { recordExternalClosing, lessonCode } from "@/lib/lessons/external";
import { applyGradingFixes } from "@/lib/lessons/regrade";
import { asUserId } from "@/types/ids";

/** A reviewed regrade appends corrections, never edits the ledger, and runs only once. */
describe("applying reviewed grading fixes", () => {
  const db = testDb();
  let access: StudentAccess;
  let lessonId = "";

  beforeAll(async () => {
    await resetDatabase();
    const seed = await seedDemo(db);
    access = await requireStudentAccess({ userId: asUserId(seed.parentId), requestId: "r" }, seed.aurora, "RUN_LESSON", db);
    const englishId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!.id;
    const greet = (await db.query.learningObjectives.findFirst({ where: and(eq(s.learningObjectives.curriculumVersionId, seed.demoEnglishVersionId), eq(s.learningObjectives.objectiveKey, "DEMO.EN.GREET")) }))!.id;
    lessonId = (await createManualLesson(access, { subjectId: englishId, primaryObjectiveId: greet, reviewObjectiveIds: [] }, db)).id;
    const first = (await getLesson(access, lessonId, db)).activities.find((a) => a.objectiveId)!;
    const closing = { format: "learning-os-closing.v1", lesson_code: lessonCode(lessonId), minutes: 10, summary: "ok", activities: [{ activity: first.sequence, attempts: [
      { prompt: "Say hello", expected: "hello", child_said: "hello", result: "INCORRECT" },
      { prompt: "Say bye", expected: "bye", child_said: "bye", result: "INCORRECT" },
    ] }] };
    await recordExternalClosing(access, lessonId, "```json\n" + JSON.stringify(closing) + "\n```", db);
  });
  afterAll(closeTestDb);

  it("appends one correction per fix, keeps the original row, recomputes state, and skips on a second run", async () => {
    const [a, b] = (await getLesson(access, lessonId, db)).evidence;
    // Recorded as CORRECT already by the system raise; pretend a review wants PARTIALLY_CORRECT for one and leaves the other.
    const fix = { fixId: "test-fix", policy: "answer-match.v3", fixes: [
      { evidenceId: a.id, result: "PARTIALLY_CORRECT" as const, method: "external_judgement", reason: "review" },
      { evidenceId: b.id, result: b.result, method: "external_judgement", reason: "unchanged" },
      { evidenceId: "01a0d5be-f284-76cf-b308-4593e05ce585", result: "NOT_ASSESSED" as const, method: "no_attempt", reason: "not in this database" },
    ] };
    expect(await applyGradingFixes(db, fix)).toEqual({ applied: 1, skipped: 2 });
    const rows = await db.query.learningEvidence.findMany({ where: eq(s.learningEvidence.lessonId, lessonId) });
    const correction = rows.find((r) => r.evidenceType === "CORRECTION")!;
    expect(correction).toMatchObject({ supersedesEvidenceId: a.id, result: "PARTIALLY_CORRECT", gradedBy: a.gradedBy, confidence: a.confidence });
    expect(correction.graderRef).toMatchObject({ provider: "chatgpt_external", policy: "answer-match.v3", reason: "review" });
    expect(rows.find((r) => r.id === a.id)!.result).toBe(a.result);
    const audit = await db.query.auditLog.findMany({ where: eq(s.auditLog.resourceId, a.id) });
    expect(audit.some((e) => e.action === "evidence.correction" && e.actorType === "SYSTEM")).toBe(true);
    const state = await db.query.studentObjectiveState.findFirst({ where: and(eq(s.studentObjectiveState.studentId, access.studentId), eq(s.studentObjectiveState.objectiveId, a.objectiveId)) });
    expect(state?.decidedByEvidenceIds ?? []).toContain(correction.id);
    expect(await applyGradingFixes(db, fix)).toEqual({ applied: 0, skipped: 3 });
  });
});
