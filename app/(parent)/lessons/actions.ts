"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { createManualLessonSchema, recordEvidenceSchema, completeLessonSchema, recordEventSchema, correctEvidenceSchema } from "@/schemas/lessons";
import { createManualLesson, startLesson, recordEvidence, completeLesson, recordLessonEvent, cancelLesson, correctEvidence } from "@/lib/lessons/service";
import { toActionError, formToObject, type ActionState } from "@/lib/actions/result";

const uuid = z.string().uuid();

export async function createManualLessonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let lessonId: string;
  try {
    const studentId = uuid.parse(formData.get("studentId"));
    const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
    const reviews = formData.getAll("reviewObjectiveIds").map(String).filter(Boolean);
    const { studentId: _s, reviewObjectiveIds: _r, ...rest } = formToObject(formData);
    void _s;
    void _r;
    const input = createManualLessonSchema.parse({ ...rest, reviewObjectiveIds: reviews });
    const lesson = await createManualLesson(access, input);
    lessonId = lesson.id;
  } catch (err) {
    return toActionError(err);
  }
  redirect(`/lessons/${lessonId}`);
}

export async function startLessonAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = uuid.parse(formData.get("studentId"));
  const lessonId = uuid.parse(formData.get("lessonId"));
  const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
  await startLesson(access, lessonId);
  revalidatePath(`/lessons/${lessonId}`);
}

export async function cancelLessonAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const studentId = uuid.parse(formData.get("studentId"));
  const lessonId = uuid.parse(formData.get("lessonId"));
  const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
  await cancelLesson(access, lessonId);
  revalidatePath(`/lessons/${lessonId}`);
}

export async function recordEvidenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const studentId = uuid.parse(formData.get("studentId"));
    const access = await requireStudentAccess(actor, studentId, "RECORD_EVIDENCE");
    const errorTags = formData.getAll("errorTags").map(String).filter(Boolean);
    const { studentId: _s, errorTags: _e, ...rest } = formToObject(formData);
    void _s;
    void _e;
    const input = recordEvidenceSchema.parse({ ...rest, errorTags });
    const { state } = await recordEvidence(access, input, { gradedBy: "HUMAN" });
    if (input.lessonId) revalidatePath(`/lessons/${input.lessonId}`);
    revalidatePath(`/students/${studentId}`);
    return { ok: true, message: `Recorded. Objective is now ${state.decision.status.toLowerCase().replace("_", " ")}.` };
  } catch (err) {
    return toActionError(err);
  }
}

export async function teacherNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const studentId = uuid.parse(formData.get("studentId"));
    const lessonId = uuid.parse(formData.get("lessonId"));
    const text = z.string().trim().min(1).max(4000).parse(formData.get("text"));
    const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
    await recordLessonEvent(access, recordEventSchema.parse({ lessonId, eventType: "TEACHER_NOTE", payload: { text } }));
    revalidatePath(`/lessons/${lessonId}`);
    return { ok: true, message: "Note saved." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function completeLessonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let lessonId: string;
  try {
    const studentId = uuid.parse(formData.get("studentId"));
    const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
    const { studentId: _s, ...rest } = formToObject(formData);
    void _s;
    const input = completeLessonSchema.parse(rest);
    await completeLesson(access, input);
    lessonId = input.lessonId;
  } catch (err) {
    return toActionError(err);
  }
  revalidatePath(`/lessons/${lessonId}`);
  redirect(`/lessons/${lessonId}/report`);
}

export async function correctEvidenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const studentId = uuid.parse(formData.get("studentId"));
    const access = await requireStudentAccess(actor, studentId, "RECORD_EVIDENCE");
    const { studentId: _s, returnTo, ...rest } = formToObject(formData);
    void _s;
    await correctEvidence(access, correctEvidenceSchema.parse(rest));
    if (returnTo) revalidatePath(returnTo);
    return { ok: true, message: "Recorded as a new row; the original is kept." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function requestAiContentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const studentId = uuid.parse(formData.get("studentId"));
    const lessonId = uuid.parse(formData.get("lessonId"));
    const activityId = uuid.parse(formData.get("activityId"));
    const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
    const { getAIProvider } = await import("@/lib/ai");
    const { requestActivityContent } = await import("@/lib/lessons/ai-proposals");
    const result = await requestActivityContent(access, await getAIProvider(), lessonId, activityId);
    revalidatePath(`/lessons/${lessonId}`);
    if (!result.ok) return { ok: false, error: `The AI provider did not return usable content (${result.error.kind.toLowerCase().replace("_", " ")}).`, issues: result.error.issues };
    return { ok: true, message: "Content proposed. It is a suggestion for how to teach, recorded in the event log." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function attachNarrativeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const studentId = uuid.parse(formData.get("studentId"));
    const lessonId = uuid.parse(formData.get("lessonId"));
    const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
    const { getAIProvider } = await import("@/lib/ai");
    const { attachReportNarrative } = await import("@/lib/lessons/ai-proposals");
    const result = await attachReportNarrative(access, await getAIProvider(), lessonId);
    revalidatePath(`/lessons/${lessonId}/report`);
    if (!result.ok) return { ok: false, error: `The AI provider did not return a usable narrative (${result.error.kind.toLowerCase().replace("_", " ")}).`, issues: result.error.issues };
    return { ok: true, message: "Narrative added as a new report version. The observed section is unchanged." };
  } catch (err) {
    return toActionError(err);
  }
}
