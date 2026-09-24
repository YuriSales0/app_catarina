import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { seedDemo } from "@/scripts/seed-demo";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { createManualLesson, getLesson } from "@/lib/lessons/service";
import { buildExternalLesson, recordExternalClosing, lessonCode } from "@/lib/lessons/external";
import { lessonReportSchema } from "@/schemas/lesson-report";
import { ConflictError, ValidationError } from "@/lib/authorization/errors";
import { asUserId } from "@/types/ids";

/**
 * A lesson run in the family's own ChatGPT: the script goes out, the closing
 * comes back pasted. The closing is a report from an unwatched model, so what
 * reaches the ledger is labelled and bounded accordingly.
 */
describe("lesson in an external ChatGPT", () => {
  const db = testDb();
  let access: StudentAccess;
  let lessonId = "";
  let code = "";

  beforeAll(async () => {
    await resetDatabase();
    const seed = await seedDemo(db);
    access = await requireStudentAccess({ userId: asUserId(seed.parentId), requestId: "r" }, seed.aurora, "RUN_LESSON", db);
    const englishId = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!.id;
    const greet = (await db.query.learningObjectives.findFirst({ where: and(eq(s.learningObjectives.curriculumVersionId, seed.demoEnglishVersionId), eq(s.learningObjectives.objectiveKey, "DEMO.EN.GREET")) }))!.id;
    lessonId = (await createManualLesson(access, { subjectId: englishId, primaryObjectiveId: greet, reviewObjectiveIds: [] }, db)).id;
    code = lessonCode(lessonId);
  });
  afterAll(closeTestDb);

  const closingFor = (activities: unknown[], extra: Record<string, unknown> = {}) =>
    "Aqui está o fechamento:\n```json\n" + JSON.stringify({ format: "learning-os-closing.v1", lesson_code: code, minutes: 17, activities, summary: "Aula animada.", went_well: ["Cumprimentou o boneco"], was_hard: ["Good afternoon"], next_time: "Frases de apresentação", ...extra }) + "\n```";

  it("the script and the closing request are built from the plan without starting the lesson", async () => {
    const { prompt, closingRequest, code: c } = await buildExternalLesson(access, lessonId, db);
    expect(c).toBe(code);
    expect(closingRequest).toContain(`"lesson_code": "${code}"`);
    expect(prompt).toContain("ATIVIDADE 1:");
    expect(prompt).toContain("MATERIAL DE HOJE");
    expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect((await getLesson(access, lessonId, db)).lesson.status).toBe("PLANNED");
  });

  it("refuses a closing from another lesson or naming activities this lesson does not have, writing nothing", async () => {
    await expect(recordExternalClosing(access, lessonId, closingFor([], { lesson_code: "ZZZZZZ" }), db)).rejects.toBeInstanceOf(ValidationError);
    await expect(recordExternalClosing(access, lessonId, closingFor([{ activity: 9, attempts: [{ prompt: "x", result: "CORRECT" }] }]), db)).rejects.toThrow(/não existem/);
    await expect(recordExternalClosing(access, lessonId, "a aula foi ótima!", db)).rejects.toThrow(/Não encontrei/);
    const detail = await getLesson(access, lessonId, db);
    expect(detail.lesson.status).toBe("PLANNED");
    expect(detail.evidence).toHaveLength(0);
  });

  it("records each attempt as external AI grading with low confidence, re-checks keyed answers, and completes the lesson with the closing", async () => {
    const plan = (await getLesson(access, lessonId, db)).activities;
    const first = plan.find((a) => a.objectiveId)!;
    const { recorded } = await recordExternalClosing(
      access,
      lessonId,
      closingFor([
        {
          activity: first.sequence,
          attempts: [
            { prompt: "Say hello to the puppet", expected: "hello", child_said: "Helo!", result: "CORRECT" },
            { prompt: "The puppet is leaving. What do you say?", expected: null, child_said: "bye bye", result: "CORRECT" },
            { prompt: "Good afternoon?", expected: "good afternoon", child_said: "boa tarde", result: "PARTIALLY_CORRECT" },
          ],
        },
      ]),
      db,
    );
    expect(recorded).toBe(3);
    const detail = await getLesson(access, lessonId, db);
    expect(detail.lesson.status).toBe("COMPLETED");
    expect(detail.lesson.actualDurationMinutes).toBe(17);
    const rows = detail.evidence;
    expect(rows.every((r) => r.gradedBy === "AI_PROVIDER" && r.confidence === "LOW")).toBe(true);
    expect(rows.map((r) => r.result)).toEqual(["PARTIALLY_CORRECT", "CORRECT", "INCORRECT"]);
    expect(rows[0].graderRef).toMatchObject({ provider: "chatgpt_external", input: "external_report", method: "near_match", reason: "external_judgement:CORRECT" });
    expect(rows[1].graderRef).toMatchObject({ method: "external_judgement" });
    expect(detail.events.some((e) => e.eventType === "ACTIVITY_COMPLETED" && e.activityId === first.id && (e.payload as { surface?: string }).surface === "chatgpt")).toBe(true);
    expect(detail.events.some((e) => e.eventType === "AI_PROPOSAL_RECEIVED" && (e.payload as { kind?: string }).kind === "external_closing")).toBe(true);
    const report = lessonReportSchema.parse(detail.report!.payload);
    expect(report.observed.teacher_notes[0].text).toContain("Fechamento da aula no ChatGPT: Aula animada.");
    expect(report.observed.teacher_notes[0].text).toContain("Próxima aula: Frases de apresentação");
    // External reports alone never make an objective secure.
    const st = await db.query.studentObjectiveState.findFirst({ where: and(eq(s.studentObjectiveState.studentId, access.studentId), eq(s.studentObjectiveState.objectiveId, first.objectiveId!)) });
    expect(st?.status).not.toBe("MASTERED");
  });

  it("a second paste changes nothing", async () => {
    await expect(recordExternalClosing(access, lessonId, closingFor([]), db)).rejects.toBeInstanceOf(ConflictError);
    expect((await getLesson(access, lessonId, db)).evidence).toHaveLength(3);
  });
});
