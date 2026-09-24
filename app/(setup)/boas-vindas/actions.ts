"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { createStudentSchema } from "@/schemas/students";
import { createStudent, enrolStudentInSubject, setAiProcessingConsent } from "@/lib/students/service";
import { getSubjectBySlug, listPublishedVersionsForSubject } from "@/lib/curriculum/service";
import { describeLevel } from "@/lib/curriculum/levels";
import { toActionError, formToObject, type ActionState } from "@/lib/actions/result";

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

/** English, taught in Portuguese, at the chosen level. The target level follows the curriculum. */
export async function onboardLevelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let studentId: string;
  try {
    studentId = uuid.parse(formData.get("studentId"));
    const versionId = uuid.parse(formData.get("curriculumVersionId"));
    const minutes = z.coerce.number().int().min(5).max(90).parse(formData.get("plannedLessonMinutes") ?? 20);
    const access = await requireStudentAccess(actor, studentId, "MANAGE_ENROLMENT");
    const english = await getSubjectBySlug("english");
    const version = (await listPublishedVersionsForSubject(actor, english.id)).find((v) => v.versionId === versionId);
    if (!version) return { ok: false, error: "Escolha um dos níveis da lista." };
    await enrolStudentInSubject(access, {
      subjectId: english.id,
      curriculumVersionId: versionId,
      instructionLanguage: "pt-BR",
      targetLanguage: "en",
      targetLevel: describeLevel(version.curriculumName).cefr ?? undefined,
      plannedLessonMinutes: minutes,
    });
  } catch (err) {
    return toActionError(err);
  }
  redirect(`/boas-vindas?passo=3&crianca=${studentId}`);
}

export async function onboardAiAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = uuid.parse(formData.get("studentId"));
  const enabled = formData.get("enabled") === "true";
  const access = await requireStudentAccess(actor, studentId, "MANAGE_GUARDIANS");
  await setAiProcessingConsent(access, enabled);
  redirect(`/boas-vindas?passo=4&crianca=${studentId}`);
}
