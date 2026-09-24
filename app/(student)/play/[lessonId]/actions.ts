"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { getPlayState, playStart, playNextActivity, playQuickMark, playFinish } from "@/lib/lessons/play";
import { recordEvidenceSchema } from "@/schemas/lessons";
import { getAIProvider } from "@/lib/ai";
import { requestActivityContent, gradeAndRecord } from "@/lib/lessons/ai-proposals";
import { log } from "@/lib/logging/logger";
import { getAiQuality } from "@/lib/students/service";

async function accessFor(lessonId: string) {
  const actor = await requireActor();
  const studentId = await resolveLessonStudent(lessonId);
  return requireStudentAccess(actor, studentId, "RUN_LESSON");
}

const lessonIdOf = (formData: FormData) => z.string().uuid().parse(formData.get("lessonId"));

export async function playStartAction(formData: FormData): Promise<void> {
  const lessonId = lessonIdOf(formData);
  const access = await accessFor(lessonId);
  await playStart(access, lessonId);
  revalidatePath(`/play/${lessonId}`);
}

export async function playNextAction(formData: FormData): Promise<void> {
  const lessonId = lessonIdOf(formData);
  const access = await accessFor(lessonId);
  await playNextActivity(access, lessonId);
  revalidatePath(`/play/${lessonId}`);
}

/** The adult beside the child marks one prompt. Graded by a human. */
export async function playMarkAction(formData: FormData): Promise<void> {
  const lessonId = lessonIdOf(formData);
  const access = await accessFor(lessonId);
  const input = recordEvidenceSchema.parse({
    lessonId,
    activityId: String(formData.get("activityId") ?? ""),
    objectiveId: String(formData.get("objectiveId") ?? ""),
    prompt: String(formData.get("prompt") ?? ""),
    expectedResponse: formData.get("expectedResponse") ? String(formData.get("expectedResponse")) : undefined,
    result: String(formData.get("result") ?? ""),
    evidenceType: String(formData.get("evidenceType") ?? "PRACTICE"),
    confidence: "MEDIUM",
    errorTags: [],
  });
  await playQuickMark(access, input);
  revalidatePath(`/play/${lessonId}`);
}

/**
 * Asks the AI provider to prepare the current activity. A failure is logged as
 * a rejected proposal and the page falls back to the curriculum's own prompts.
 */
export async function playPrepareAction(formData: FormData): Promise<void> {
  const lessonId = lessonIdOf(formData);
  const access = await accessFor(lessonId);
  const state = await getPlayState(access, lessonId);
  if (state.current && !state.proposal) {
    try {
      await requestActivityContent(access, await getAIProvider({ quality: await getAiQuality(access) }), lessonId, state.current.id);
    } catch (err) {
      log.warn("play.prepare_failed", { lessonId, error: (err as Error).message });
    }
  }
  revalidatePath(`/play/${lessonId}`);
}

/**
 * The child types an answer to an AI-prepared item. Items with an expected
 * answer are graded by the system (exact match, no model); open items go to
 * the provider and are recorded as AI-graded.
 */
export async function playAnswerAction(formData: FormData): Promise<void> {
  const lessonId = lessonIdOf(formData);
  const access = await accessFor(lessonId);
  const index = z.coerce.number().int().min(0).max(20).parse(formData.get("item"));
  const answer = z.string().trim().min(1).max(300).parse(formData.get("answer"));
  const state = await getPlayState(access, lessonId);
  const item = state.proposal?.proposal.items[index];
  if (!state.current || !state.proposal || !item) {
    revalidatePath(`/play/${lessonId}`);
    return;
  }
  await gradeAndRecord(access, await getAIProvider({ quality: await getAiQuality(access) }), {
    lessonId,
    activityId: state.current.id,
    packId: state.proposal.packId,
    item: {
      activity_ref: state.proposal.proposal.activity_ref,
      prompt: item.prompt,
      expected_response: item.expected_response,
      accept_also: item.accept_also,
      student_response: answer,
      objective_ref: state.proposal.proposal.objective_ref,
    },
    errorTagVocabulary: Object.keys(state.version.errorTagVocabulary ?? {}),
  });
  revalidatePath(`/play/${lessonId}`);
}

export async function playFinishAction(formData: FormData): Promise<void> {
  const lessonId = lessonIdOf(formData);
  const access = await accessFor(lessonId);
  await playFinish(access, lessonId);
  redirect(`/play/${lessonId}`);
}
