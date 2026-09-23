import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { seedDemo } from "@/scripts/seed-demo";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { getNextLessonPlan } from "@/lib/learning/next-lesson";
import { createLessonFromPlan, startLesson, recordEvidence, completeLesson } from "@/lib/lessons/service";
import { asUserId } from "@/types/ids";
import type { Actor } from "@/lib/auth/session";

describe("getNextLessonPlan", () => {
  const db = testDb();
  let seed: Awaited<ReturnType<typeof seedDemo>>;
  let actor: Actor;
  let access: StudentAccess;
  let englishId = "";
  let mathsId = "";

  beforeAll(async () => {
    await resetDatabase();
    seed = await seedDemo(db);
    actor = { userId: asUserId(seed.parentId), requestId: "r" };
    access = await requireStudentAccess(actor, seed.catarina, "RUN_LESSON", db);
    englishId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!.id;
    mathsId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "mathematics") }))!.id;
  });
  afterAll(closeTestDb);

  it("for an untouched subject, plans the first objective with a NEXT_IN_SEQUENCE reason and rejects locked ones", async () => {
    const plan = await getNextLessonPlan(access, mathsId, {}, db);
    expect(plan.outcome).toBe("PLANNED");
    expect(plan.source).toBe("ENGINE");
    expect(plan.primary_objective?.code).toBe("DEMO.MA.NUM20");
    expect(plan.rationale.selected_because[0].kind).toBe("NEXT_IN_SEQUENCE");
    const locked = plan.rationale.alternatives_rejected.filter((r) => r.reason === "LOCKED");
    expect(locked.length).toBe(7);
    expect(plan.activities.length).toBeGreaterThan(0);
    expect(plan.activities.reduce((a, x) => a + x.planned_minutes, 0)).toBe(20);
  });

  it("after two seeded lessons on the same objective, the repetition brake moves to the next available one and says why", async () => {
    const plan = await getNextLessonPlan(access, englishId, {}, db);
    expect(plan.outcome).toBe("PLANNED");
    // Greetings is DEVELOPING but was the primary of the last two lessons; Numbers is the unlocked frontier.
    expect(plan.primary_objective?.code).toBe("DEMO.EN.NUMBERS");
    expect(plan.rationale.selected_because[0].kind).toBe("NEXT_IN_SEQUENCE");
    const greet = plan.rationale.alternatives_rejected.find((r) => r.objective_code === "DEMO.EN.GREET");
    expect(greet?.reason).toBe("RECENTLY_TAUGHT");
    // "My name is..." stays locked behind Greetings reaching PROFICIENT.
    expect(plan.rationale.alternatives_rejected.find((r) => r.objective_code === "DEMO.EN.NAME")?.reason).toBe("LOCKED");
  });

  it("a plan from the engine creates a lesson through the same store as a manual one", async () => {
    const plan = await getNextLessonPlan(access, mathsId, {}, db);
    const lesson = await createLessonFromPlan(access, plan, {}, db);
    expect(lesson.planEngineVersion).toBe("engine.v1");
    expect(lesson.primaryObjectiveId).toBe(plan.primary_objective!.id);
    await startLesson(access, lesson.id, db);
    for (let i = 0; i < 3; i++) {
      await recordEvidence(access, { lessonId: lesson.id, objectiveId: plan.primary_objective!.id, prompt: `count ${i}`, result: "CORRECT", evidenceType: "PRACTICE", confidence: "MEDIUM", errorTags: [] }, { gradedBy: "HUMAN" }, db);
    }
    await completeLesson(access, { lessonId: lesson.id }, db);
    const next = await getNextLessonPlan(access, mathsId, {}, db);
    expect(next.primary_objective?.code).toBe("DEMO.MA.NUM20");
    expect(next.rationale.score_breakdown.some((b) => b.component === "recently_taught")).toBe(true);
  });

  it("a plan for another parent's student is impossible to obtain", async () => {
    const [u] = await db.insert(s.users).values({ email: "np@example.test" }).returning();
    await expect(requireStudentAccess({ userId: asUserId(u.id), requestId: "x" }, seed.catarina, "VIEW", db)).rejects.toThrow();
  });

  it("without a pinned curriculum the outcome is NEEDS_CURRICULUM, never a guess", async () => {
    await db.update(s.studentSubjects).set({ curriculumVersionId: null }).where(eq(s.studentSubjects.studentId, seed.aurora));
    const auroraAccess = await requireStudentAccess(actor, seed.aurora, "VIEW", db);
    const plan = await getNextLessonPlan(auroraAccess, englishId, {}, db);
    expect(plan.outcome).toBe("NEEDS_CURRICULUM");
    expect(plan.primary_objective).toBeNull();
  });
});
