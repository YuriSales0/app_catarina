import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import type { StudentAccess } from "@/lib/authorization/access";
import { ValidationError } from "@/lib/authorization/errors";
import { getEnv } from "@/lib/env";
import type { AIProvider, AiQuality } from "@/lib/ai/provider";
import { buildRealtimeSession, createRealtimeClientSecret, realtimeCallsUrl, renderVoiceInstructions, VOICE_PROMPT_VERSION, type VoiceActivityBrief, type VoiceJudgement } from "@/lib/ai/realtime";
import { matchAnswer, ANSWER_MATCH_POLICY } from "@/lib/assessment/answer-match";
import { buildLessonContext } from "@/lib/context/build";
import type { Opening } from "./opening";
import { getPlayState, playStart, playNextActivity, playFinish } from "./play";
import { hasAiConsent, requestActivityContent } from "./ai-proposals";
import { recordEvidence } from "./service";
import { log, metric } from "@/lib/logging/logger";

/**
 * Server side of the live voice lesson. The voice model conducts; this module
 * decides. Each tool call the model makes lands here: activity content comes
 * from the same validated proposals as the screen lesson, checkable answers
 * are graded by the system against an independent transcript, and every
 * attempt enters the ledger through recordEvidence.
 */
export const VOICE_POLICY = { version: "voice.v1", itemsFromNotes: 4 } as const;

type PlayState = Awaited<ReturnType<typeof getPlayState>>;

export function realtimeModelFor(quality: AiQuality): string {
  const env = getEnv();
  return quality === "high" ? env.OPENAI_REALTIME_MODEL_HIGH : env.OPENAI_REALTIME_MODEL;
}

/** Live voice needs a real provider and the family's AI consent. */
export async function voiceAvailable(studentId: string, providerId: string, dbh: DbOrTx = db()): Promise<boolean> {
  return getEnv().AI_PROVIDER === "openai" && providerId === "openai" && (await hasAiConsent(studentId, dbh));
}

/** Items for the current activity, from the AI proposal when there is one, else from the curriculum's own prompts. */
function briefFrom(state: PlayState): VoiceActivityBrief | null {
  const current = state.current;
  if (!current) return null;
  const done = new Set(state.currentEvidence.map((e) => e.prompt));
  const opening = current.activityType === "ORIENTATION" ? ((state.lesson.planPayload as { opening?: Opening | null }).opening ?? null) : null;
  const teach = current.activityType === "EXPLANATION";
  let intro: string | null = null;
  let raw: Array<{ kind: "CHECK" | "OPEN" | "TEACH"; prompt: string; expected: string | null; accept_also: string[] }> = [];
  if (state.proposal) {
    intro = state.proposal.proposal.child_facing_intro;
    raw = state.proposal.proposal.items.map((it) => ({
      kind: teach ? "TEACH" : it.checkable !== "OPEN" && it.expected_response ? "CHECK" : "OPEN",
      prompt: it.prompt,
      expected: it.expected_response,
      accept_also: it.accept_also,
    }));
  } else if (state.objective) {
    const notes = (state.objective.teachingNotes ?? {}) as Partial<Record<"example_prompts" | "vocabulary" | "structures", string[]>>;
    const prompts = teach ? [...(notes.vocabulary ?? []), ...(notes.structures ?? [])] : notes.example_prompts?.length ? notes.example_prompts : (notes.structures ?? []);
    raw = prompts.slice(0, teach ? 8 : VOICE_POLICY.itemsFromNotes).map((p) => ({ kind: teach ? "TEACH" : "OPEN", prompt: p, expected: null, accept_also: [] }));
  }
  return {
    activity_number: state.completedCount + 1,
    activities_total: state.activities.length,
    activity_type: current.activityType,
    instructions: current.instructions,
    intro,
    opening: opening ? { kind: opening.kind, module: opening.unit_name, goals: opening.unit_objectives.map((o) => o.title) } : null,
    items: raw.map((it, i) => ({ number: i + 1, ...it, done: it.kind !== "TEACH" && done.has(it.prompt) })),
  };
}

/** The current activity's brief, asking the provider for its content first when it has none yet. */
export async function voiceBrief(access: StudentAccess, provider: AIProvider, lessonId: string, dbh: DbOrTx = db()): Promise<VoiceActivityBrief | null> {
  let state = await getPlayState(access, lessonId, dbh);
  if (state.current && state.objective && !state.proposal && !state.proposalFailed && state.current.activityType !== "REVIEW") {
    try {
      await requestActivityContent(access, provider, lessonId, state.current.id, dbh);
    } catch (err) {
      log.warn("voice.prepare_failed", { lessonId, error: (err as Error).message });
    }
    state = await getPlayState(access, lessonId, dbh);
  }
  return briefFrom(state);
}

export type VoiceSessionTicket = { clientSecret: string; expiresAt: number; callsUrl: string; model: string; activitiesTotal: number; completed: number };

/** Starts (if needed) the lesson and mints a client secret for a live voice session configured for it. */
export async function openVoiceSession(access: StudentAccess, provider: AIProvider, quality: AiQuality, lessonId: string, dbh: DbOrTx = db()): Promise<VoiceSessionTicket> {
  const env = getEnv();
  let state = await getPlayState(access, lessonId, dbh);
  if (!(await voiceAvailable(access.studentId, provider.id, dbh))) throw new ValidationError("Live voice needs the AI provider and the family's AI consent.");
  if (state.lesson.status === "COMPLETED" || state.lesson.status === "CANCELLED") throw new ValidationError("This lesson has ended.");
  if (state.lesson.status === "PLANNED") {
    await playStart(access, lessonId, dbh);
    state = await getPlayState(access, lessonId, dbh);
  }
  const brief = await voiceBrief(access, provider, lessonId, dbh);
  if (!brief) throw new ValidationError("There is no activity left in this lesson.");
  const { pack } = await buildLessonContext(access, state.lesson.subjectId, lessonId, {}, dbh);
  const model = realtimeModelFor(quality);
  const session = buildRealtimeSession({
    model,
    voice: env.OPENAI_REALTIME_VOICE,
    transcriptionModel: env.OPENAI_TRANSCRIBE_MODEL,
    instructions: renderVoiceInstructions({ pack, brief, lessonMinutes: state.lesson.plannedDurationMinutes ?? 20 }),
  });
  const secret = await createRealtimeClientSecret({ apiKey: env.OPENAI_API_KEY!, baseUrl: env.OPENAI_BASE_URL }, session);
  if (!secret.ok) {
    metric("ai_provider_error", { kind: secret.error.kind, provider: "openai-realtime" });
    log.warn("voice.secret_failed", { lessonId, kind: secret.error.kind, message: secret.error.message });
    throw new ValidationError("The voice service did not answer. Try again in a moment.");
  }
  metric("voice_session_opened", { lessonId, model });
  return { clientSecret: secret.value.value, expiresAt: secret.value.expiresAt, callsUrl: realtimeCallsUrl(env.OPENAI_BASE_URL), model, activitiesTotal: state.activities.length, completed: state.completedCount };
}

export type VoiceAnswerInput = { item_number: number; child_said: string; judgement: VoiceJudgement; heard?: string | null };

/**
 * record_answer. Checkable items are graded by the system against the
 * independent transcript of what the child said (the model's paraphrase only
 * when no transcript arrived); open items take the voice model's judgement,
 * labelled AI-graded. The first attempt at an item is the one recorded.
 */
export async function voiceRecordAnswer(access: StudentAccess, quality: AiQuality, lessonId: string, input: VoiceAnswerInput, dbh: DbOrTx = db()) {
  const state = await getPlayState(access, lessonId, dbh);
  const brief = briefFrom(state);
  if (!state.current || !brief || !state.current.objectiveId) return { recorded: false, reason: "no_activity" };
  const item = brief.items.find((it) => it.number === input.item_number);
  if (!item) return { recorded: false, reason: "unknown_item", items: brief.items.length };
  if (item.kind === "TEACH") return { recorded: false, reason: "teach_items_are_not_recorded" };
  if (item.done) return { recorded: false, reason: "already_recorded", ...progressOf(brief) };

  const heard = input.heard?.trim() || null;
  const response = (heard ?? input.child_said).slice(0, 500);
  const evidenceType = state.current.activityType === "ASSESSMENT" ? "ASSESSMENT" : "PRACTICE";
  const base = { lessonId, activityId: state.current.id, objectiveId: state.current.objectiveId, prompt: item.prompt, studentResponse: response, expectedResponse: item.expected ?? undefined, evidenceType: evidenceType as "PRACTICE" | "ASSESSMENT", errorTags: [] as string[] };
  if (item.kind === "CHECK") {
    const m = matchAnswer(response, [item.expected!, ...item.accept_also]);
    await recordEvidence(
      access,
      { ...base, result: m.match ? "CORRECT" : "INCORRECT", confidence: "MEDIUM" },
      { gradedBy: "SYSTEM", graderRef: { method: m.method === "phrase" ? "phrase_match" : "exact_match", policy: ANSWER_MATCH_POLICY.version, input: "voice_live", reason: `voice_judgement:${input.judgement}${heard ? "" : ",no_transcript"}` } },
      dbh,
    );
  } else {
    await recordEvidence(
      access,
      { ...base, result: input.judgement, confidence: input.judgement === "NOT_ASSESSED" ? "LOW" : "MEDIUM" },
      { gradedBy: "AI_PROVIDER", graderRef: { provider: "openai", model: realtimeModelFor(quality), promptVersion: VOICE_PROMPT_VERSION, input: "voice_live" } },
      dbh,
    );
  }
  const after = briefFrom(await getPlayState(access, lessonId, dbh));
  return { recorded: true, ...(after ? progressOf(after) : { items_left: 0, activity_complete: true }) };
}

function progressOf(brief: VoiceActivityBrief) {
  const left = brief.items.filter((it) => it.kind !== "TEACH" && !it.done);
  return { items_left: left.length, activity_complete: left.length === 0, next_item: left[0]?.number ?? null };
}

/** next_activity: closes the current activity and briefs the next one. */
export async function voiceNextActivity(access: StudentAccess, provider: AIProvider, lessonId: string, dbh: DbOrTx = db()) {
  const next = await playNextActivity(access, lessonId, dbh);
  if (!next) return { lesson_complete: true };
  const brief = await voiceBrief(access, provider, lessonId, dbh);
  return brief ? { lesson_complete: false, activity: brief } : { lesson_complete: true };
}

/** finish_lesson: completes the lesson, which produces the report and state updates as any lesson does. */
export async function voiceFinish(access: StudentAccess, lessonId: string, dbh: DbOrTx = db()) {
  const state = await getPlayState(access, lessonId, dbh);
  if (state.lesson.status === "IN_PROGRESS") await playFinish(access, lessonId, dbh);
  return { finished: true };
}
