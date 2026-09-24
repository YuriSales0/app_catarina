"use server";

import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { resolveLessonStudent } from "@/lib/lessons/resolve";
import { getAIProvider } from "@/lib/ai";
import { VOICE_JUDGEMENTS } from "@/lib/ai/realtime";
import { getAiQuality } from "@/lib/students/service";
import { openVoiceSession, voiceRecordAnswer, voiceNextActivity, voiceFinish, type VoiceSessionTicket } from "@/lib/lessons/voice";
import { log } from "@/lib/logging/logger";

/**
 * The browser's half of the live voice lesson. The voice model asks for a
 * tool; the browser forwards the call here; the server decides and answers.
 * Errors come back as values so the conversation can carry on.
 */
async function context(lessonId: string) {
  z.string().uuid().parse(lessonId);
  const actor = await requireActor();
  const studentId = await resolveLessonStudent(lessonId);
  const access = await requireStudentAccess(actor, studentId, "RUN_LESSON");
  const quality = await getAiQuality(access);
  return { access, quality, provider: await getAIProvider({ quality }) };
}

export async function startVoiceAction(lessonId: string): Promise<{ ok: true; ticket: VoiceSessionTicket } | { ok: false; message: string }> {
  try {
    const { access, quality, provider } = await context(lessonId);
    return { ok: true, ticket: await openVoiceSession(access, provider, quality, lessonId) };
  } catch (err) {
    log.warn("voice.start_failed", { lessonId, error: (err as Error).message });
    return { ok: false, message: "Não consegui ligar a voz agora. Tente de novo em instantes." };
  }
}

const answerArgs = z.object({ item_number: z.number().int().min(1).max(50), child_said: z.string().max(500), judgement: z.enum(VOICE_JUDGEMENTS) });
const finishArgs = z.object({ reason: z.enum(["done", "child_wants_to_stop", "time_up"]).optional() });

/** Runs one tool call from the voice model. The transcript the browser heard is passed separately from the model's arguments. */
export async function voiceToolAction(lessonId: string, name: string, rawArgs: string, heard: string | null): Promise<Record<string, unknown>> {
  try {
    const { access, quality, provider } = await context(lessonId);
    let args: unknown = {};
    try {
      args = rawArgs ? JSON.parse(rawArgs) : {};
    } catch {
      return { error: "arguments were not valid JSON" };
    }
    if (name === "record_answer") {
      const parsed = answerArgs.safeParse(args);
      if (!parsed.success) return { error: "invalid arguments", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
      return await voiceRecordAnswer(access, quality, lessonId, { ...parsed.data, heard: heard ? heard.slice(0, 500) : null });
    }
    if (name === "next_activity") return await voiceNextActivity(access, provider, lessonId);
    if (name === "finish_lesson") {
      finishArgs.parse(args);
      return await voiceFinish(access, lessonId);
    }
    return { error: `unknown tool ${name}` };
  } catch (err) {
    log.warn("voice.tool_failed", { lessonId, tool: name, error: (err as Error).message });
    return { error: "the system could not complete this step; carry on with the lesson" };
  }
}
