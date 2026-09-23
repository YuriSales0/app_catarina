import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { seedDemo } from "@/scripts/seed-demo";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { buildLessonContext, resolveHandle } from "@/lib/context/build";
import { contextPackSchema, CONTEXT_CAPS } from "@/schemas/context-pack";
import { createManualLesson, recordEvidence, startLesson } from "@/lib/lessons/service";
import { asUserId } from "@/types/ids";
import type { Actor } from "@/lib/auth/session";
import { NullAIProvider } from "@/lib/ai/provider";
import { getAIProvider } from "@/lib/ai";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Proof 6: the Context Pack contains only authorized, relevant data, and no ids. */
describe("context pack", () => {
  const db = testDb();
  let seed: Awaited<ReturnType<typeof seedDemo>>;
  let actor: Actor;
  let access: StudentAccess;
  let englishId = "";

  beforeAll(async () => {
    await resetDatabase();
    seed = await seedDemo(db);
    actor = { userId: asUserId(seed.parentId), requestId: "r" };
    access = await requireStudentAccess(actor, seed.catarina, "RUN_LESSON", db);
    englishId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!.id;
    // Put a distinctive marker in Aurora's data and in Catarina's other subject.
    await db.update(s.students).set({ name: "AuroraMarker" }).where(eq(s.students.id, seed.aurora));
    await db.insert(s.learningInference).values({ studentId: seed.catarina, subjectId: englishId, statement: "INFERENCE_MARKER the child is a genius", basisEvidenceIds: [], source: "AI_PROVIDER", confidence: "HIGH" });
    await db.insert(s.learningRecommendation).values({ studentId: seed.catarina, subjectId: englishId, kind: "PACING", statement: "RECOMMENDATION_MARKER", source: "AI_PROVIDER" });
  });
  afterAll(closeTestDb);

  it("builds a strict, versioned pack for the next planned lesson", async () => {
    const { pack, handles, plan } = await buildLessonContext(access, englishId, undefined, { now: new Date() }, db);
    expect(contextPackSchema.strict().safeParse(pack).success).toBe(true);
    expect(pack.context_version).toBe("context.v1");
    expect(pack.primary_objective.code).toBe(plan.primary_objective!.code);
    expect(pack.student.display_name).toBe("Catarina");
    expect(pack.student.instruction_language).toBe("pt-BR");
    expect(pack.student.target_language).toBe("en");
    expect(pack.lesson_plan.activities.length).toBe(plan.activities.length);
    expect(resolveHandle(handles, "objectives", pack.primary_objective.ref)).toBe(plan.primary_objective!.id);
    expect(pack.previous_lesson_summary?.lesson_number).toBe(2);
    expect(pack.previous_lesson_summary?.observed_facts[0]).toMatch(/Greetings: \d of \d correct/);
  });

  it("contains no UUID-shaped string, no other student, no inference and no recommendation", async () => {
    const { pack } = await buildLessonContext(access, englishId, undefined, {}, db);
    const text = JSON.stringify(pack);
    expect(UUID_RE.test(text)).toBe(false);
    expect(text).not.toContain("AuroraMarker");
    expect(text).not.toContain("INFERENCE_MARKER");
    expect(text).not.toContain("RECOMMENDATION_MARKER");
    expect(text).not.toContain("2019-03-14");
    expect(text).not.toContain(seed.parentId);
    expect(text).not.toContain("engine-policy");
  });

  it("caps evidence and stays small even with many rows; teacher instructions are clipped", async () => {
    const objs = await db.query.learningObjectives.findMany({ where: eq(s.learningObjectives.curriculumVersionId, seed.demoEnglishVersionId) });
    const numbers = objs.find((o) => o.objectiveKey === "DEMO.EN.NUMBERS")!;
    const lesson = await createManualLesson(access, { subjectId: englishId, primaryObjectiveId: numbers.id, reviewObjectiveIds: [] }, db);
    await startLesson(access, lesson.id, db);
    for (let i = 0; i < 60; i++) {
      await recordEvidence(access, { lessonId: lesson.id, objectiveId: numbers.id, prompt: `count ${i} ` + "x".repeat(600), result: i % 3 === 0 ? "INCORRECT" : "CORRECT", evidenceType: "PRACTICE", confidence: "MEDIUM", errorTags: [] }, { gradedBy: "HUMAN" }, db);
    }
    const enrolment = await db.query.studentSubjects.findFirst({ where: eq(s.studentSubjects.studentId, seed.catarina) });
    await db.update(s.studentSubjects).set({ metadata: { teacher_instructions: { text: "y".repeat(5000), authored_at: new Date().toISOString() } } }).where(eq(s.studentSubjects.id, enrolment!.id));
    const { pack } = await buildLessonContext(access, englishId, lesson.id, {}, db);
    expect(pack.relevant_recent_evidence.length).toBe(CONTEXT_CAPS.evidence);
    expect(pack.relevant_recent_evidence.every((e) => e.prompt.length <= 500)).toBe(true);
    expect(pack.teacher_instructions.text!.length).toBeLessThanOrEqual(CONTEXT_CAPS.teacherInstructionChars);
    expect(Buffer.byteLength(JSON.stringify(pack))).toBeLessThan(CONTEXT_CAPS.maxBytes * 2);
    const stored = await db.query.lessons.findFirst({ where: eq(s.lessons.id, lesson.id) });
    const packs = (stored!.metadata as { context_packs: Record<string, { objectives: Record<string, string> }> }).context_packs;
    expect(packs[pack.pack_id].objectives[pack.primary_objective.ref]).toBe(numbers.id);
  });

  it("cannot be built without access, and a viewer's pack says PARENT not TEACHER", async () => {
    const [u] = await db.insert(s.users).values({ email: "cp@example.test" }).returning();
    await expect(requireStudentAccess({ userId: asUserId(u.id), requestId: "x" }, seed.catarina, "VIEW", db)).rejects.toThrow();
    const audits = await db.query.auditLog.findMany({ where: eq(s.auditLog.action, "context.build") });
    expect(audits.length).toBeGreaterThanOrEqual(3);
    expect(audits.every((a) => a.studentId === seed.catarina)).toBe(true);
  });

  it("the default provider is the null provider and returns NOT_CONFIGURED for everything", async () => {
    const provider = await getAIProvider();
    expect(provider).toBeInstanceOf(NullAIProvider);
    const { pack } = await buildLessonContext(access, englishId, undefined, {}, db);
    const r = await provider.generateLessonActivity(pack, pack.lesson_plan.activities[0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("NOT_CONFIGURED");
  });
});
