"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { playStart, playNextActivity, playQuickMark, playFinish } from "@/lib/lessons/play";
import { recordEvidenceSchema } from "@/schemas/lessons";

async function accessFor(lessonId: string) {
  const actor = await requireActor();
  const studentId = await resolveLessonStudent(lessonId);
  return requireStudentAccess(actor, studentId, "RUN_LESSON");
}

export async function playStartAction(formData: FormData): Promise<void> {
  const lessonId = z.string().uuid().parse(formData.get("lessonId"));
  const access = await accessFor(lessonId);
  await playStart(access, lessonId);
  revalidatePath(`/play/${lessonId}`);
}

export async function playNextAction(formData: FormData): Promise<void> {
  const lessonId = z.string().uuid().parse(formData.get("lessonId"));
  const access = await accessFor(lessonId);
  await playNextActivity(access, lessonId);
  revalidatePath(`/play/${lessonId}`);
}

export async function playMarkAction(formData: FormData): Promise<void> {
  const lessonId = z.string().uuid().parse(formData.get("lessonId"));
  const access = await accessFor(lessonId);
  const input = recordEvidenceSchema.parse({
    lessonId,
    activityId: String(formData.get("activityId") ?? ""),
    objectiveId: String(formData.get("objectiveId") ?? ""),
    prompt: String(formData.get("prompt") ?? ""),
    result: String(formData.get("result") ?? ""),
    evidenceType: String(formData.get("evidenceType") ?? "PRACTICE"),
    confidence: "MEDIUM",
    errorTags: [],
  });
  await playQuickMark(access, input);
  revalidatePath(`/play/${lessonId}`);
}

export async function playFinishAction(formData: FormData): Promise<void> {
  const lessonId = z.string().uuid().parse(formData.get("lessonId"));
  const access = await accessFor(lessonId);
  await playFinish(access, lessonId);
  redirect(`/play/${lessonId}`);
}
