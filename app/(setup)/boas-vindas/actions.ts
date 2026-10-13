"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor, type Actor } from "@/lib/auth/session";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { createStudentSchema } from "@/schemas/students";
import { createStudent, enrolStudentInSubject, setAiProcessingConsent, setAiQuality } from "@/lib/students/service";
import { getSubjectBySlug, listPublishedVersionsForSubject } from "@/lib/curriculum/service";
import { describeLevel } from "@/lib/curriculum/levels";
import { toActionError, formToObject, type ActionState } from "@/lib/actions/result";
import { setStartingPoint } from "@/lib/lessons/starting-point";
import { LITERACY_SUBJECT } from "@/lib/literacy";
import { ValidationError } from "@/lib/authorization/errors";

const uuid = z.string().uuid();

export async function onboardChildAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    const student = await createStudent(actor, createStudentSchema.parse(formToObject(formData)));
    id = student.id;
  } catch (err) {
    return toActionError(err);
  }
  redirect(`/boas-vindas?passo=2&crianca=${id}`);
}

type Experience = "BEGINNER" | "TEST" | "CHOSEN";

/**
 * The family picks the track and says where the child starts. English,
 * taught in Portuguese: from zero (Starters, first unit), with some
 * experience (Starters plus a level check as the first lesson), or at a
 * track they pick. Literacy in Spanish, taught in Spanish: from the start
 * or after a level game.
 */
export async function onboardLevelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let studentId: string;
  try {
    studentId = uuid.parse(formData.get("studentId"));
    const experience = z.enum(["BEGINNER", "TEST", "CHOSEN"]).catch("BEGINNER").parse(formData.get("experience"));
    const minutes = z.coerce.number().int().min(5).max(90).parse(formData.get("plannedLessonMinutes") ?? 20);
    const access = await requireStudentAccess(actor, studentId, "MANAGE_ENROLMENT");
    if (formData.get("track") === "literacy") await enrolInLiteracy(actor, access, experience, minutes);
    else await enrolInEnglish(actor, access, experience, minutes, formData.get("curriculumVersionId"));
  } catch (err) {
    return toActionError(err);
  }
  redirect(`/boas-vindas?passo=3&crianca=${studentId}`);
}

async function enrolInLiteracy(actor: Actor, access: StudentAccess, experience: Experience, minutes: number) {
  const literacy = await getSubjectBySlug(LITERACY_SUBJECT);
  const version = (await listPublishedVersionsForSubject(actor, literacy.id)).find((v) => !v.isDemo);
  if (!version) throw new ValidationError("O currículo de alfabetização ainda não está publicado.");
  await enrolStudentInSubject(access, {
    subjectId: literacy.id,
    curriculumVersionId: version.versionId,
    instructionLanguage: version.instructionLanguage ?? "es",
    targetLanguage: version.targetLanguage ?? "es",
    plannedLessonMinutes: minutes,
  });
  await setStartingPoint(access, literacy.id, experience === "TEST" ? "TEST" : "BEGINNER");
}

async function enrolInEnglish(actor: Actor, access: StudentAccess, experience: Experience, minutes: number, chosen: FormDataEntryValue | null) {
  const english = await getSubjectBySlug("english");
  const versions = await listPublishedVersionsForSubject(actor, english.id);
  const starters = versions.find((v) => !v.isDemo && describeLevel(v.curriculumName).key === "starters") ?? versions.find((v) => describeLevel(v.curriculumName).key === "starters");
  const versionId = experience === "CHOSEN" ? uuid.parse(chosen) : starters?.versionId;
  const version = versions.find((v) => v.versionId === versionId);
  if (!version) throw new ValidationError("Escolha um dos níveis da lista.");
  await enrolStudentInSubject(access, {
    subjectId: english.id,
    curriculumVersionId: version.versionId,
    instructionLanguage: "pt-BR",
    targetLanguage: "en",
    targetLevel: describeLevel(version.curriculumName).cefr ?? undefined,
    plannedLessonMinutes: minutes,
  });
  await setStartingPoint(access, english.id, experience);
}

export async function onboardAiAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = uuid.parse(formData.get("studentId"));
  const enabled = formData.get("enabled") === "true";
  const access = await requireStudentAccess(actor, studentId, "MANAGE_GUARDIANS");
  await setAiProcessingConsent(access, enabled);
  if (enabled) await setAiQuality(access, formData.get("quality") === "high" ? "high" : "standard");
  redirect(`/boas-vindas?passo=4&crianca=${studentId}`);
}
