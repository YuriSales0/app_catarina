"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { createStudentSchema, updateStudentSchema, addGuardianSchema, enrolStudentSchema, studentIdParam } from "@/schemas/students";
import { createStudent, updateStudent, addGuardianByEmail, revokeGuardian, enrolStudentInSubject, deleteStudent } from "@/lib/students/service";
import { toActionError, formToObject, type ActionState } from "@/lib/actions/result";

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
    return { ok: true, message: "Saved." };
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
    return { ok: true, message: "Access granted." };
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
    await enrolStudentInSubject(access, enrolStudentSchema.parse(rest));
    revalidatePath(`/students/${studentId}`);
    return { ok: true, message: "Enrolment saved." };
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
