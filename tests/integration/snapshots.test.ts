import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb, expectDbRejection, migratorPoolHandle } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { seedDemo } from "@/scripts/seed-demo";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { computeSnapshot, generateSnapshot, listSnapshots, getSnapshot } from "@/lib/snapshots/generate";
import { contentHash, canonicalJson } from "@/lib/snapshots/canonical";
import { snapshotPayloadSchema } from "@/schemas/snapshot";
import { createManualLesson, startLesson, recordEvidence, completeLesson } from "@/lib/lessons/service";
import { enrolStudentInSubject } from "@/lib/students/service";
import { asUserId } from "@/types/ids";
import type { Actor } from "@/lib/auth/session";

describe("learning snapshots", () => {
  const db = testDb();
  let seed: Awaited<ReturnType<typeof seedDemo>>;
  let actor: Actor;
  let access: StudentAccess;
  let englishId = "";
  const NOW = new Date("2026-09-20T12:00:00Z");

  beforeAll(async () => {
    await resetDatabase();
    seed = await seedDemo(db);
    actor = { userId: asUserId(seed.parentId), requestId: "r" };
    access = await requireStudentAccess(actor, seed.catarina, "RUN_LESSON", db);
    englishId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!.id;
  });
  afterAll(closeTestDb);

  it("a snapshot is taken automatically when a lesson completes", async () => {
    const before = await listSnapshots(access, db);
    const objs = await db.query.learningObjectives.findMany({ where: eq(s.learningObjectives.curriculumVersionId, seed.demoEnglishVersionId) });
    const numbers = objs.find((o) => o.objectiveKey === "DEMO.EN.NUMBERS")!;
    const lesson = await createManualLesson(access, { subjectId: englishId, primaryObjectiveId: numbers.id, reviewObjectiveIds: [] }, db);
    await startLesson(access, lesson.id, db);
    await recordEvidence(access, { lessonId: lesson.id, objectiveId: numbers.id, prompt: "count to five", result: "CORRECT", evidenceType: "PRACTICE", confidence: "MEDIUM", errorTags: [] }, { gradedBy: "HUMAN" }, db);
    await completeLesson(access, { lessonId: lesson.id }, db);
    const after = await listSnapshots(access, db);
    expect(after.length).toBe(before.length + 1);
    expect((after[0].generatedFrom as { trigger: string }).trigger).toBe("LESSON_COMPLETED");
    expect(after[0].snapshotVersion).toBe(before.length + 1);
  });

  it("the payload validates, carries the epistemic key, and separates observed from inferred and recommended", async () => {
    const [latest] = await listSnapshots(access, db);
    const { payload } = await getSnapshot(access, latest.id, db);
    expect(snapshotPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.epistemic_key.observed).toContain("subjects[].objective_states");
    expect(payload.epistemic_key.inferred).toContain("subjects[].recurring_difficulties");
    expect(payload.epistemic_key.recommended).toEqual(["subjects[].recommended_next_objectives"]);
    for (const path of payload.epistemic_key.inferred) expect(payload.epistemic_key.observed).not.toContain(path);
    const english = payload.subjects.find((x) => x.subject.slug === "english")!;
    expect(english.progress.objectives_total).toBe(12);
    expect(english.recommended_next_objectives.length).toBe(1);
    expect(english.recent_lessons.length).toBeGreaterThanOrEqual(1);
  });

  it("regenerating from the same inputs and clock yields the same content hash", async () => {
    const a = await computeSnapshot(access, { scope: "STUDENT", trigger: "MANUAL", now: NOW }, db);
    const b = await computeSnapshot(access, { scope: "STUDENT", trigger: "MANUAL", now: NOW }, db);
    expect(contentHash(a.payload)).toBe(contentHash(b.payload));
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });

  it("versions are monotonic and rows are immutable at the database", async () => {
    const r1 = await generateSnapshot(access, { scope: "STUDENT", trigger: "MANUAL", now: NOW }, db);
    const r2 = await generateSnapshot(access, { scope: "SUBJECT", subjectId: englishId, trigger: "MANUAL", now: NOW }, db);
    expect(r2.snapshotVersion).toBe(r1.snapshotVersion + 1);
    expect(r2.subjectId).toBe(englishId);
    await expectDbRejection(db.update(s.learningSnapshots).set({ contentHash: "x" }).where(eq(s.learningSnapshots.id, r1.id)), /permission denied|append-only/);
    await expect(migratorPoolHandle().query(`DELETE FROM learning_snapshots WHERE id = $1`, [r1.id])).rejects.toThrow(/append-only/);
  });

  it("contains no other student's data", async () => {
    const [latest] = await listSnapshots(access, db);
    const { payload } = await getSnapshot(access, latest.id, db);
    const text = JSON.stringify(payload);
    expect(text).not.toContain(seed.aurora);
    expect(text).not.toContain("Aurora");
  });

  it("changing the pinned curriculum version takes a PRE_MIGRATION snapshot first", async () => {
    const manage = await requireStudentAccess(actor, seed.catarina, "MANAGE_ENROLMENT", db);
    const before = await listSnapshots(manage, db);
    await enrolStudentInSubject(manage, { subjectId: englishId, curriculumVersionId: seed.startersVersionId, instructionLanguage: "pt-BR", targetLanguage: "en", plannedLessonMinutes: 20 }, db);
    const after = await listSnapshots(manage, db);
    expect(after.length).toBe(before.length + 1);
    expect((after[0].generatedFrom as { trigger: string }).trigger).toBe("PRE_MIGRATION");
    const { payload } = await getSnapshot(manage, after[0].id, db);
    expect(payload.subjects.find((x) => x.subject.slug === "english")?.curriculum.version_id).toBe(seed.demoEnglishVersionId);
  });
});
