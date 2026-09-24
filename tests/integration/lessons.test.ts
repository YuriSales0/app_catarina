import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { seedDemo } from "@/scripts/seed-demo";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { createManualLesson, startLesson, recordEvidence, recordLessonEvent, completeLesson, getLesson, listLessons, correctEvidence, getLearningHistory, cancelLesson } from "@/lib/lessons/service";
import { getStudentProgress } from "@/lib/learning/progress";
import { lessonReportSchema } from "@/schemas/lesson-report";
import { asUserId } from "@/types/ids";
import type { Actor } from "@/lib/auth/session";
import { ValidationError, ConflictError, NotFoundError } from "@/lib/authorization/errors";

describe("lesson lifecycle", () => {
  const db = testDb();
  let seed: Awaited<ReturnType<typeof seedDemo>>;
  let actor: Actor;
  let access: StudentAccess;
  let englishId = "";
  let objs: s.LearningObjectiveRow[] = [];
  const key = (k: string) => objs.find((o) => o.objectiveKey === k)!;

  beforeAll(async () => {
    await resetDatabase();
    seed = await seedDemo(db);
    actor = { userId: asUserId(seed.parentId), requestId: "r" };
    access = await requireStudentAccess(actor, seed.aurora, "RUN_LESSON", db);
    englishId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!.id;
    objs = await db.query.learningObjectives.findMany({ where: eq(s.learningObjectives.curriculumVersionId, seed.demoEnglishVersionId) });
  });
  afterAll(closeTestDb);

  it("refuses to create a lesson on a locked objective (proof 2, manual path)", async () => {
    await expect(createManualLesson(access, { subjectId: englishId, primaryObjectiveId: key("DEMO.EN.NAME").id, reviewObjectiveIds: [] }, db)).rejects.toBeInstanceOf(ValidationError);
  });

  it("creates a numbered, planned lesson with activities from the template, idempotently", async () => {
    const lesson = await createManualLesson(access, { subjectId: englishId, primaryObjectiveId: key("DEMO.EN.GREET").id, reviewObjectiveIds: [], idempotencyKey: "k1" }, db);
    expect(lesson.lessonNumber).toBe(1);
    expect(lesson.status).toBe("PLANNED");
    expect(lesson.planEngineVersion).toBe("manual.v1");
    const again = await createManualLesson(access, { subjectId: englishId, primaryObjectiveId: key("DEMO.EN.GREET").id, reviewObjectiveIds: [], idempotencyKey: "k1" }, db);
    expect(again.id).toBe(lesson.id);
    const detail = await getLesson(access, lesson.id, db);
    // The first lesson on a curriculum opens the course: how lessons work, the module's goals, a diagnostic.
    expect(detail.activities.map((a) => a.activityType)).toEqual(["ORIENTATION", "EXPLANATION", "PRACTICE", "GAME", "ASSESSMENT"]);
    expect(detail.activities.reduce((a, x) => a + (x.plannedMinutes ?? 0), 0)).toBe(20);
    const plan = detail.lesson.planPayload as { opening: { kind: string; unit_name: string; unit_objectives: Array<{ title: string }> } | null };
    expect(plan.opening?.kind).toBe("COURSE_START");
    expect(plan.opening?.unit_objectives.map((o) => o.title)).toContain("Greetings");
    expect(detail.activities[0].instructions).toMatch(/Abertura do curso.*Greetings/);
    expect(detail.activities[0].expectedEvidenceCount).toBe(3);
  });

  it("evidence cannot be recorded against a lesson that has not started", async () => {
    const [lesson] = await listLessons(access, englishId, 1, db);
    await expect(
      recordEvidence(access, { lessonId: lesson.id, objectiveId: key("DEMO.EN.GREET").id, prompt: "Say hello", result: "CORRECT", evidenceType: "PRACTICE", confidence: "MEDIUM", errorTags: [] }, { gradedBy: "HUMAN" }, db),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("runs a lesson: start, events, evidence with state recomputed in the same transaction, complete with a SYSTEM report", async () => {
    const [lesson] = await listLessons(access, englishId, 1, db);
    const started = await startLesson(access, lesson.id, db);
    expect(started.status).toBe("IN_PROGRESS");
    const detail = await getLesson(access, lesson.id, db);
    const practice = detail.activities.find((a) => a.activityType === "PRACTICE")!;
    await recordLessonEvent(access, { lessonId: lesson.id, activityId: practice.id, eventType: "ACTIVITY_STARTED", payload: {} }, db);

    const greet = key("DEMO.EN.GREET").id;
    const results: s.LearningEvidenceRow["result"][] = ["CORRECT", "CORRECT", "INCORRECT", "CORRECT", "PARTIALLY_CORRECT"];
    let last: Awaited<ReturnType<typeof recordEvidence>> | null = null;
    for (const r of results) {
      last = await recordEvidence(
        access,
        { lessonId: lesson.id, activityId: practice.id, objectiveId: greet, prompt: "Say hello to the puppet", studentResponse: r === "INCORRECT" ? "Olá" : "Hello", result: r, evidenceType: "PRACTICE", confidence: "MEDIUM", errorTags: r === "INCORRECT" ? ["VOCAB_UNKNOWN"] : [] },
        { gradedBy: "HUMAN" },
        db,
      );
    }
    expect(last!.state.decision.status).toBe("DEVELOPING");
    expect(last!.evidence.attemptNumber).toBe(5);

    await expect(
      recordEvidence(access, { lessonId: lesson.id, objectiveId: greet, prompt: "x", result: "CORRECT", evidenceType: "PRACTICE", confidence: "MEDIUM", errorTags: ["NOT_A_TAG"] }, { gradedBy: "HUMAN" }, db),
    ).rejects.toBeInstanceOf(ValidationError);

    const { lesson: done, report } = await completeLesson(access, { lessonId: lesson.id, teacherNote: "Loved the puppet." }, db);
    expect(done.status).toBe("COMPLETED");
    expect(report).toBeTruthy();
    const parsed = lessonReportSchema.parse(report!.payload);
    expect(parsed.generated_by).toBe("SYSTEM");
    expect(parsed.observed.objectives_attempted[0]).toMatchObject({ attempts: 5, correct: 3, incorrect: 1, partially_correct: 1 });
    expect(parsed.observed.evidence_summary.by_grader.HUMAN).toBe(5);
    expect(parsed.observed.state_transitions.length).toBeGreaterThan(0);
    expect(parsed.observed.teacher_notes[0].text).toBe("Loved the puppet.");
    expect(parsed.observed.errors_observed[0]).toMatchObject({ error_tag: "VOCAB_UNKNOWN", count: 1 });
    expect(parsed.recommended.recommended_review[0]?.objective_id).toBe(greet);

    const events = (await getLesson(access, lesson.id, db)).events.map((e) => e.eventType);
    expect(events[0]).toBe("LESSON_STARTED");
    expect(events.at(-1)).toBe("LESSON_COMPLETED");
    expect(events.filter((e) => e === "STUDENT_RESPONSE")).toHaveLength(5);

    const recs = await db.query.learningRecommendation.findMany({ where: eq(s.learningRecommendation.lessonId, lesson.id) });
    expect(recs.every((r) => r.status === "PROPOSED")).toBe(true);
  });

  it("completing twice is idempotent and a completed lesson cannot be cancelled", async () => {
    const [lesson] = await listLessons(access, englishId, 1, db);
    const again = await completeLesson(access, { lessonId: lesson.id }, db);
    expect(again.lesson.status).toBe("COMPLETED");
    await expect(cancelLesson(access, lesson.id, db)).rejects.toBeInstanceOf(ConflictError);
  });

  it("a correction supersedes a row and state follows the corrected value", async () => {
    const history = await getLearningHistory(access, englishId, db);
    const wrong = history.evidence.find((e) => e.result === "INCORRECT")!;
    const { state } = await correctEvidence(access, { evidenceId: wrong.id, mode: "CORRECTION", result: "CORRECT", reason: "I tapped the wrong button." }, db);
    expect(state.decision.successRateRecent).toBeCloseTo(0.9);
    const after = await getLearningHistory(access, englishId, db);
    expect(after.evidence.filter((e) => e.supersedesEvidenceId === wrong.id)).toHaveLength(1);
    expect(after.evidence.find((e) => e.id === wrong.id)?.result).toBe("INCORRECT");
  });

  it("next lesson gets number 2; progress shows the newly unlocked objective", async () => {
    const lesson2 = await createManualLesson(access, { subjectId: englishId, primaryObjectiveId: key("DEMO.EN.GREET").id, reviewObjectiveIds: [] }, db);
    expect(lesson2.lessonNumber).toBe(2);
    const progress = await getStudentProgress(access, englishId, db);
    expect(progress.objectives.find((o) => o.objective.objectiveKey === "DEMO.EN.GREET")?.status).toBe("DEVELOPING");
    expect(progress.objectives.find((o) => o.objective.objectiveKey === "DEMO.EN.NAME")?.unlock.unlocked).toBe(false);
  });

  it("a VIEWER cannot run lessons and another parent cannot see them", async () => {
    const [v] = await db.insert(s.users).values({ email: "viewer2@example.test" }).returning();
    await db.insert(s.studentGuardians).values({ studentId: seed.aurora, userId: v.id, role: "VIEWER", acceptedAt: new Date() });
    const viewerAccess = await requireStudentAccess({ userId: asUserId(v.id), requestId: "v" }, seed.aurora, "VIEW", db);
    await expect(createManualLesson(viewerAccess, { subjectId: englishId, primaryObjectiveId: key("DEMO.EN.GREET").id, reviewObjectiveIds: [] }, db)).rejects.toBeInstanceOf(NotFoundError);
    const [lesson] = await listLessons(access, englishId, 1, db);
    const [other] = await db.insert(s.users).values({ email: "other3@example.test" }).returning();
    const [st] = await db.insert(s.students).values({ createdByUserId: other.id, name: "Z" }).returning();
    await db.insert(s.studentGuardians).values({ studentId: st.id, userId: other.id, role: "OWNER", acceptedAt: new Date() });
    const otherAccess = await requireStudentAccess({ userId: asUserId(other.id), requestId: "o" }, st.id, "VIEW", db);
    await expect(getLesson(otherAccess, lesson.id, db)).rejects.toBeInstanceOf(NotFoundError);
    const row = await db.query.studentGuardians.findFirst({ where: and(eq(s.studentGuardians.userId, v.id), eq(s.studentGuardians.studentId, seed.aurora)) });
    expect(row).toBeTruthy();
  });
});
