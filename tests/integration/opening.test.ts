import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { seedDemo } from "@/scripts/seed-demo";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { createManualLesson, startLesson, recordEvidence, completeLesson, getLesson } from "@/lib/lessons/service";
import { getNextLessonPlan } from "@/lib/learning/next-lesson";
import { lessonReportSchema } from "@/schemas/lesson-report";
import { asUserId } from "@/types/ids";

describe("course opening and placement check", () => {
  const db = testDb();
  let access: StudentAccess;
  let englishId = "";
  let greet = "";

  beforeAll(async () => {
    await resetDatabase();
    const seed = await seedDemo(db);
    access = await requireStudentAccess({ userId: asUserId(seed.parentId), requestId: "r" }, seed.aurora, "RUN_LESSON", db);
    englishId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!.id;
    greet = (await db.query.learningObjectives.findFirst({ where: and(eq(s.learningObjectives.curriculumVersionId, seed.demoEnglishVersionId), eq(s.learningObjectives.objectiveKey, "DEMO.EN.GREET")) }))!.id;
  });
  afterAll(closeTestDb);

  it("the engine plans the first lesson as a course opening", async () => {
    const plan = await getNextLessonPlan(access, englishId, {}, db);
    expect(plan.opening?.kind).toBe("COURSE_START");
    expect(plan.activities[0].activity_type).toBe("ORIENTATION");
  });

  it("a perfect opening diagnostic ends with a level suggestion to the family, and the level is not changed", async () => {
    const lesson = await createManualLesson(access, { subjectId: englishId, primaryObjectiveId: greet, reviewObjectiveIds: [] }, db);
    await startLesson(access, lesson.id, db);
    const orientation = (await getLesson(access, lesson.id, db)).activities.find((a) => a.activityType === "ORIENTATION")!;
    for (const prompt of ["Say hello", "Say goodbye", "Say good morning"]) {
      await recordEvidence(access, { lessonId: lesson.id, activityId: orientation.id, objectiveId: greet, prompt, result: "CORRECT", evidenceType: "PRACTICE", confidence: "MEDIUM", errorTags: [] }, { gradedBy: "HUMAN" }, db);
    }
    const { report } = await completeLesson(access, { lessonId: lesson.id }, db);
    const parsed = lessonReportSchema.parse(report!.payload);
    expect(parsed.recommended.parent_actions.map((a) => a.action).join(" ")).toMatch(/pode estar fácil/);
    const recs = await db.query.learningRecommendation.findMany({ where: and(eq(s.learningRecommendation.lessonId, lesson.id), eq(s.learningRecommendation.kind, "PARENT_ACTION")) });
    expect(recs.some((r) => /pode estar fácil/.test(r.statement))).toBe(true);
    const enrolment = await db.query.studentSubjects.findFirst({ where: and(eq(s.studentSubjects.studentId, access.studentId), eq(s.studentSubjects.subjectId, englishId)) });
    expect(enrolment?.curriculumVersionId).toBe(lesson.curriculumVersionId);
  });

  it("once the course has started and the unit is under way, the next plan has no opening", async () => {
    const plan = await getNextLessonPlan(access, englishId, {}, db);
    expect(plan.opening).toBeNull();
    expect(plan.activities.every((a) => a.activity_type !== "ORIENTATION")).toBe(true);
  });
});
