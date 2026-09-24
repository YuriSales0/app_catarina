"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { recordExternalClosing } from "@/lib/lessons/external";
import { toActionError, type ActionState } from "@/lib/actions/result";

/** The parent pastes ChatGPT's closing block; it becomes the lesson's attempts and closing. */
export async function submitExternalClosingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let lessonId: string;
  try {
    lessonId = z.string().uuid().parse(formData.get("lessonId"));
    const pasted = z.string().trim().min(1, "Cole a resposta do ChatGPT.").max(60_000).parse(formData.get("closing"));
    const actor = await requireActor();
    const access = await requireStudentAccess(actor, await resolveLessonStudent(lessonId), "RUN_LESSON");
    await recordExternalClosing(access, lessonId, pasted);
  } catch (err) {
    return toActionError(err);
  }
  redirect(`/lessons/${lessonId}/report`);
}
