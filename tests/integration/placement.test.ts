import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { seedDemo } from "@/scripts/seed-demo";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { createStudent, enrolStudentInSubject } from "@/lib/students/service";
import { createStudentSchema } from "@/schemas/students";
import { createLessonFromPlan, startLesson, recordEvidence, completeLesson, getLesson } from "@/lib/lessons/service";
import { getNextLessonPlan } from "@/lib/learning/next-lesson";
import { setStartingPoint, getStartingPoint } from "@/lib/lessons/starting-point";
import { buildExternalLesson } from "@/lib/lessons/external";
import { asUserId } from "@/types/ids";
import type { Actor } from "@/lib/auth/session";
import type { EvidenceResult } from "@/lib/db/enums";

/**
 * The starting point is asked, not assumed: from zero, or a level check that
 * suggests a unit the family then confirms. Nothing here writes a learning
 * state to skip units; the planner simply does not teach them.
 */
describe("starting point and level check", () => {
  const db = testDb();
  let actor: Actor;
  let access: StudentAccess;
  let englishId = "";

  beforeAll(async () => {
    await resetDatabase();
    const seed = await seedDemo(db);
    actor = { userId: asUserId(seed.parentId), requestId: "r" };
    const student = await createStudent(actor, createStudentSchema.parse({ name: "Lia", dateOfBirth: "2019-04-26" }), db);
    access = await requireStudentAccess(actor, student.id, "MANAGE_GUARDIANS", db);
    englishId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!.id;
    await enrolStudentInSubject(access, { subjectId: englishId, curriculumVersionId: seed.startersVersionId, instructionLanguage: "pt-BR", targetLanguage: "en", plannedLessonMinutes: 20 }, db);
  });
  afterAll(closeTestDb);

  it("a beginner starts at the very first objective, with the course opening", async () => {
    await setStartingPoint(access, englishId, "BEGINNER", db);
    const plan = await getNextLessonPlan(access, englishId, {}, db);
    expect(plan.primary_objective?.code).toBe("EN.S1.GREET");
    expect(plan.opening?.kind).toBe("COURSE_START");
    expect(plan.placement_test).toBeNull();
  });

  it("with some experience, the next lesson is a level check across the units, teaching nothing", async () => {
    await setStartingPoint(access, englishId, "TEST", db);
    const plan = await getNextLessonPlan(access, englishId, {}, db);
    expect(plan.placement_test?.units.length).toBe(6);
    expect(plan.activities[0].activity_type).toBe("ORIENTATION");
    expect(plan.activities.slice(1).every((a) => a.activity_type === "ASSESSMENT" && a.expected_evidence_count === 2)).toBe(true);
    expect(plan.rationale.selected_because[0].kind).toBe("PLACEMENT_TEST");
    const lesson = await createLessonFromPlan(access, plan, {}, db);
    const { prompt, closingRequest } = await buildExternalLesson(access, lesson.id, db);
    expect(prompt).toContain("teste rápido de nível");
    expect(prompt).toContain("Não ensine, não corrija");
    expect(closingRequest).toContain("Teste: Hello!");
  });

  it("the result is a suggestion stored for the family; confirming it skips earlier units and keeps the course opening", async () => {
    const plan = await getNextLessonPlan(access, englishId, {}, db);
    const lesson = (await db.query.lessons.findMany({ where: eq(s.lessons.studentId, access.studentId) })).find((l) => l.status === "PLANNED")!;
    await startLesson(access, lesson.id, db);
    const activities = (await getLesson(access, lesson.id, db)).activities.filter((a) => a.activityType === "ASSESSMENT");
    const answers: EvidenceResult[][] = [["CORRECT", "CORRECT"], ["CORRECT", "PARTIALLY_CORRECT"], ["INCORRECT", "PARTIALLY_CORRECT"], ["INCORRECT", "INCORRECT"]];
    for (const [i, results] of answers.entries()) {
      for (const [j, result] of results.entries()) {
        await recordEvidence(access, { lessonId: lesson.id, activityId: activities[i].id, objectiveId: activities[i].objectiveId!, prompt: `probe ${i}.${j}`, result, evidenceType: "ASSESSMENT", confidence: "MEDIUM", errorTags: [] }, { gradedBy: "HUMAN" }, db);
      }
    }
    await completeLesson(access, { lessonId: lesson.id }, db);
    const pending = await getStartingPoint(access, englishId, db);
    expect(pending?.status).toBe("RESULT_READY");
    const third = plan.placement_test!.units[2];
    expect(pending?.result?.suggested_start_unit_key).toBe(third.unit_key);

    // Until confirmed, nothing is skipped.
    expect((await getNextLessonPlan(access, englishId, {}, db)).rationale.alternatives_rejected.some((r) => r.reason === "PLACED_OUT")).toBe(false);

    await setStartingPoint(access, englishId, "CONFIRM_SUGGESTED", db);
    const next = await getNextLessonPlan(access, englishId, {}, db);
    const unitOf = new Map((await db.query.learningObjectives.findMany({ where: eq(s.learningObjectives.curriculumVersionId, lesson.curriculumVersionId) })).map((o) => [o.code, o]));
    expect(next.primary_objective?.code.startsWith("EN.S3.")).toBe(true);
    expect(next.rationale.alternatives_rejected.find((r) => r.objective_code === "EN.S1.GREET")?.reason).toBe("PLACED_OUT");
    // The level check was not a lesson: the first real one still opens the course.
    expect(next.opening?.kind).toBe("COURSE_START");
    expect(unitOf.size).toBeGreaterThan(0);
  });

  it("changing the starting point cancels lessons planned for the old one", async () => {
    const plan = await getNextLessonPlan(access, englishId, {}, db);
    const planned = await createLessonFromPlan(access, plan, {}, db);
    await setStartingPoint(access, englishId, "BEGINNER", db);
    expect((await getLesson(access, planned.id, db)).lesson.status).toBe("CANCELLED");
    expect((await getNextLessonPlan(access, englishId, {}, db)).primary_objective?.code).toBe("EN.S1.GREET");
  });

  it("asking for the level check again does not cancel one under way", async () => {
    await setStartingPoint(access, englishId, "TEST", db);
    const plan = await getNextLessonPlan(access, englishId, {}, db);
    const lesson = await createLessonFromPlan(access, plan, {}, db);
    await startLesson(access, lesson.id, db);
    await setStartingPoint(access, englishId, "TEST", db);
    expect((await getLesson(access, lesson.id, db)).lesson.status).toBe("IN_PROGRESS");
  });
});
