import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import { FakeAIProvider } from "../helpers/fake-ai";
import * as s from "@/lib/db/schema";
import { seedDemo } from "@/scripts/seed-demo";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { createManualLesson, startLesson, getLesson } from "@/lib/lessons/service";
import { setAiProcessingConsent } from "@/lib/students/service";
import { voiceBrief, voiceBeginLesson, voiceRecordAnswer, voiceNextActivity, voiceFinish, lessonOverview } from "@/lib/lessons/voice";
import { getPlayState } from "@/lib/lessons/play";
import { buildLessonContext } from "@/lib/context/build";
import type { ContextPack } from "@/schemas/context-pack";
import { asUserId } from "@/types/ids";

/**
 * The voice model conducts; the server decides. These tests drive the three
 * tools as the model would and assert on what reaches the ledger.
 */
describe("live voice lesson tools", () => {
  const db = testDb();
  let access: StudentAccess;
  let lessonId = "";
  let englishId = "";

  const activityFor = (pack?: ContextPack, planned?: unknown) => {
    const a = planned as ContextPack["lesson_plan"]["activities"][number];
    return {
      activity_ref: a.sequence,
      objective_ref: a.objective_ref ?? pack!.primary_objective.ref,
      title: "Numbers",
      child_facing_intro: "Vamos contar!",
      scene: "Na fazenda, contando os patinhos.",
      model_dialogue: [{ speaker: "Lumi", line: "How many ducks?", meaning: "Quantos patinhos?" }],
      items: [
        { prompt: "How many ducks?", expected_response: "three", accept_also: ["3"], skill_ref: null, checkable: "EXACT" },
        { prompt: "Count to five", expected_response: null, accept_also: [], skill_ref: null, checkable: "OPEN" },
      ],
      needs_clarification: null,
    };
  };

  beforeAll(async () => {
    await resetDatabase();
    const seed = await seedDemo(db);
    access = await requireStudentAccess({ userId: asUserId(seed.parentId), requestId: "r" }, seed.aurora, "MANAGE_GUARDIANS", db);
    englishId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!.id;
    const objs = await db.query.learningObjectives.findMany({ where: eq(s.learningObjectives.curriculumVersionId, seed.demoEnglishVersionId) });
    const numbers = objs.find((o) => o.objectiveKey === "DEMO.EN.NUMBERS")!.id;
    lessonId = (await createManualLesson(access, { subjectId: englishId, primaryObjectiveId: numbers, reviewObjectiveIds: [] }, db)).id;
    await startLesson(access, lessonId, db);
    await setAiProcessingConsent(access, true, db);
  });
  afterAll(closeTestDb);

  it("the session opens with the lesson overview: theme, goals and plan, and no exercises", async () => {
    const { pack } = await buildLessonContext(access, englishId, lessonId, {}, db);
    const overview = lessonOverview(await getPlayState(access, lessonId, db), pack);
    expect(overview.mode).toBe("START");
    expect(overview.theme.title).toBeTruthy();
    expect(overview.plan.length).toBeGreaterThan(1);
    expect(overview.plan.every((p) => p.label && !p.done)).toBe(true);
    expect(JSON.stringify(overview)).not.toMatch(/"items"|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("begin_lesson hands over the first activity with its scene and model dialogue", async () => {
    const fake = new FakeAIProvider().on("generateLessonActivity", activityFor);
    const begun = await voiceBeginLesson(access, fake, lessonId, db);
    expect(begun).toMatchObject({ lesson_complete: false, activity: { activity_number: 1, scene: "Na fazenda, contando os patinhos." } });
    expect((begun as { activity: { model_dialogue: unknown[]; label: string } }).activity.model_dialogue).toHaveLength(1);
  });

  it("briefs the current activity from a validated proposal, by number, with no database ids", async () => {
    const fake = new FakeAIProvider().on("generateLessonActivity", activityFor);
    const brief = await voiceBrief(access, fake, lessonId, db);
    expect(brief?.activity_number).toBe(1);
    expect(brief?.items.map((i) => [i.number, i.kind, i.done])).toEqual([
      [1, "CHECK", false],
      [2, "OPEN", false],
    ]);
    expect(JSON.stringify(brief)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("grades a checkable spoken answer by the system against the transcript, not the model's paraphrase", async () => {
    const r = await voiceRecordAnswer(access, "standard", lessonId, { item_number: 1, child_said: "three", judgement: "CORRECT", heard: "It's a four." }, db);
    expect(r).toMatchObject({ recorded: true, items_left: 1, activity_complete: false, next_item: 2 });
    const ev = (await getLesson(access, lessonId, db)).evidence.at(-1)!;
    expect(ev.gradedBy).toBe("SYSTEM");
    expect(ev.result).toBe("INCORRECT");
    expect(ev.studentResponse).toBe("It's a four.");
    expect(ev.graderRef).toMatchObject({ input: "voice_live", policy: "answer-match.v1", reason: "voice_judgement:CORRECT" });
  });

  it("records each item once; open items take the voice model's judgement, labelled AI-graded", async () => {
    const again = await voiceRecordAnswer(access, "standard", lessonId, { item_number: 1, child_said: "three", judgement: "CORRECT", heard: "three" }, db);
    expect(again).toMatchObject({ recorded: false, reason: "already_recorded" });
    const open = await voiceRecordAnswer(access, "high", lessonId, { item_number: 2, child_said: "one two three four five", judgement: "CORRECT", heard: "one two three four five" }, db);
    expect(open).toMatchObject({ recorded: true, activity_complete: true });
    const ev = (await getLesson(access, lessonId, db)).evidence.at(-1)!;
    expect(ev.gradedBy).toBe("AI_PROVIDER");
    expect(ev.graderRef).toMatchObject({ provider: "openai", model: "gpt-realtime", input: "voice_live" });
    expect(await voiceRecordAnswer(access, "standard", lessonId, { item_number: 9, child_said: "x", judgement: "CORRECT" }, db)).toMatchObject({ recorded: false, reason: "unknown_item" });
  });

  it("next_activity closes the activity and briefs the next one; finish_lesson completes the lesson", async () => {
    const fake = new FakeAIProvider().on("generateLessonActivity", activityFor);
    const next = await voiceNextActivity(access, fake, lessonId, db);
    expect(next).toMatchObject({ lesson_complete: false, activity: { activity_number: 2 } });
    // A reconnect after this point resumes instead of opening again.
    const { pack } = await buildLessonContext(access, englishId, lessonId, {}, db);
    expect(lessonOverview(await getPlayState(access, lessonId, db), pack).mode).toBe("RESUME");
    // Closing the remaining activities ends in the closing data, not a bare "complete".
    let step: Awaited<ReturnType<typeof voiceNextActivity>> = next;
    for (let i = 0; i < 10 && !step.lesson_complete; i++) step = await voiceNextActivity(access, new FakeAIProvider().on("generateLessonActivity", activityFor), lessonId, db);
    expect(step).toMatchObject({ lesson_complete: true, closing: { activities_done: expect.any(Number) } });
    expect((step as { closing: { key_phrases: string[] } }).closing.key_phrases).toBeInstanceOf(Array);
    await voiceFinish(access, lessonId, db);
    const lesson = await getLesson(access, lessonId, db);
    expect(lesson.lesson.status).toBe("COMPLETED");
    expect(lesson.report).not.toBeNull();
    // Idempotent: a second finish (the model repeating itself) changes nothing.
    await expect(voiceFinish(access, lessonId, db)).resolves.toEqual({ finished: true });
  });
});
