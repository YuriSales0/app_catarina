"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { createStudentSchema, updateStudentSchema, addGuardianSchema, enrolStudentSchema, studentIdParam } from "@/schemas/students";
import { createStudent, updateStudent, addGuardianByEmail, revokeGuardian, enrolStudentInSubject, deleteStudent, setAiProcessingConsent } from "@/lib/students/service";
import { toActionError, formToObject, type ActionState } from "@/lib/actions/result";
import { listSubjects, listPublishedVersionsForSubject } from "@/lib/curriculum/service";
import { describeLevel } from "@/lib/curriculum/levels";

export async function createStudentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    const input = createStudentSchema.parse(formToObject(formData));
    const student = await createStudent(actor, input);
    id = student.id;
  } catch (err) {
    return toActionError(err);
  }
  revalidatePath("/students");
  redirect(`/students/${id}`);
}

export async function updateStudentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const studentId = studentIdParam.parse(formData.get("studentId"));
    const access = await requireStudentAccess(actor, studentId, "EDIT_PROFILE");
    const { studentId: _omit, ...rest } = formToObject(formData);
    void _omit;
    await updateStudent(access, updateStudentSchema.parse(rest));
    revalidatePath(`/students/${studentId}`);
    return { ok: true, message: "Perfil salvo." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function addGuardianAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const studentId = studentIdParam.parse(formData.get("studentId"));
    const access = await requireStudentAccess(actor, studentId, "MANAGE_GUARDIANS");
    await addGuardianByEmail(access, addGuardianSchema.parse({ email: formData.get("email"), role: formData.get("role") }));
    revalidatePath(`/students/${studentId}`);
    return { ok: true, message: "Acesso concedido." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function revokeGuardianAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = studentIdParam.parse(formData.get("studentId"));
  const rowId = studentIdParam.parse(formData.get("guardianRowId"));
  const access = await requireStudentAccess(actor, studentId, "MANAGE_GUARDIANS");
  await revokeGuardian(access, rowId);
  revalidatePath(`/students/${studentId}`);
}

export async function enrolAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const studentId = studentIdParam.parse(formData.get("studentId"));
    const access = await requireStudentAccess(actor, studentId, "MANAGE_ENROLMENT");
    const { studentId: _omit, ...rest } = formToObject(formData);
    void _omit;
    // The level card carries only the version; the subject and defaults follow from it.
    if (!rest.subjectId && rest.curriculumVersionId) {
      for (const sub of await listSubjects()) {
        const v = (await listPublishedVersionsForSubject(actor, sub.id)).find((x) => x.versionId === rest.curriculumVersionId);
        if (!v) continue;
        rest.subjectId = sub.id;
        rest.targetLanguage ??= v.targetLanguage ?? undefined;
        rest.targetLevel ??= describeLevel(v.curriculumName).cefr ?? undefined;
        break;
      }
    }
    await enrolStudentInSubject(access, enrolStudentSchema.parse(rest));
    revalidatePath(`/students/${studentId}`);
    return { ok: true, message: "Trilha salva." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function deleteStudentAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = studentIdParam.parse(formData.get("studentId"));
  const access = await requireStudentAccess(actor, studentId, "DELETE");
  await deleteStudent(access);
  revalidatePath("/students");
  redirect("/students");
}

export async function setAiConsentAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = studentIdParam.parse(formData.get("studentId"));
  const enabled = formData.get("enabled") === "true";
  const access = await requireStudentAccess(actor, studentId, "MANAGE_GUARDIANS");
  await setAiProcessingConsent(access, enabled);
  revalidatePath(`/students/${studentId}`);
}
