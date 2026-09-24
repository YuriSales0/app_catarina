import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import type { StudentAccess } from "@/lib/authorization/access";
import { ValidationError } from "@/lib/authorization/errors";
import { getEnv } from "@/lib/env";
import type { AIProvider, AiQuality } from "@/lib/ai/provider";
import { buildRealtimeSession, createRealtimeClientSecret, realtimeCallsUrl, renderVoiceInstructions, VOICE_PROMPT_VERSION, type VoiceActivityBrief, type VoiceClosing, type VoiceJudgement, type VoiceLessonOverview } from "@/lib/ai/realtime";
import { matchAnswer, ANSWER_MATCH_POLICY } from "@/lib/assessment/answer-match";
import { buildLessonContext } from "@/lib/context/build";
import type { Opening } from "./opening";
import { getPlayState, playStart, playNextActivity, playFinish } from "./play";
import { hasAiConsent, requestActivityContent } from "./ai-proposals";
import { recordEvidence } from "./service";
import { log, metric } from "@/lib/logging/logger";
import { ACTIVITY } from "@/lib/copy/pt";
import type { ContextPack } from "@/schemas/context-pack";

/**
 * Server side of the live voice lesson. The voice model conducts; this module
 * decides. Each tool call the model makes lands here: activity content comes
 * from the same validated proposals as the screen lesson, checkable answers
 * are graded by the system against an independent transcript, and every
 * attempt enters the ledger through recordEvidence.
 *
 * The lesson arc is structural, not only prompted: the session starts with
 * the lesson overview and no exercises; activity content is handed over only
 * when the model calls begin_lesson after the opening, and the closing data
 * comes with the end of the last activity.
 */
export const VOICE_POLICY = { version: "voice.v3", itemsFromNotes: 4 } as const;

type Notes = Partial<Record<"example_prompts" | "vocabulary" | "structures" | "activity_ideas" | "success_criteria", string[]>>;

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
    const notes = (state.objective.teachingNotes ?? {}) as Notes;
    const prompts = teach ? [...(notes.vocabulary ?? []), ...(notes.structures ?? [])] : notes.example_prompts?.length ? notes.example_prompts : (notes.structures ?? []);
    raw = prompts.slice(0, teach ? 8 : VOICE_POLICY.itemsFromNotes).map((p) => ({ kind: teach ? "TEACH" : "OPEN", prompt: p, expected: null, accept_also: [] }));
  }
  const proposal = state.proposal?.proposal;
  return {
    activity_number: state.completedCount + 1,
    activities_total: state.activities.length,
    activity_type: current.activityType,
    label: ACTIVITY[current.activityType].kid,
    purpose: current.instructions,
    intro,
    scene: proposal?.scene ?? null,
    model_dialogue: proposal?.model_dialogue ?? [],
    opening: opening ? { kind: opening.kind, module: opening.unit_name, goals: opening.unit_objectives.map((o) => o.title) } : null,
    items: raw.map((it, i) => ({ number: i + 1, ...it, done: it.kind !== "TEACH" && done.has(it.prompt) })),
  };
}

/** The lesson as a whole, for the opening: theme, why it matters, the can-do goal, the module and the plan. */
export function lessonOverview(state: PlayState, pack: ContextPack): VoiceLessonOverview {
  const primary = state.primaryObjective;
  const notes = (primary.teachingNotes ?? {}) as Notes;
  const opening = (state.lesson.planPayload as { opening?: Opening | null }).opening ?? null;
  const started = state.completedCount > 0 || state.currentEvidence.length > 0;
  const prev = pack.previous_lesson_summary;
  const done = new Set(state.events.filter((e) => e.eventType === "ACTIVITY_COMPLETED" && e.activityId).map((e) => e.activityId!));
  return {
    mode: started ? "RESUME" : "START",
    lesson_kind: opening?.kind ?? "REGULAR",
    first_lesson_ever: pack.long_term.lessons_completed === 0,
    theme: { title: primary.title, description: primary.description ?? "", vocabulary: (notes.vocabulary ?? []).slice(0, 12), key_phrases: (notes.structures ?? []).slice(0, 6) },
    can_do_at_the_end: (notes.success_criteria ?? []).slice(0, 3),
    situation_ideas: (notes.activity_ideas ?? []).slice(0, 3),
    module: opening ? { name: opening.unit_name, goals: opening.unit_objectives.map((o) => o.title) } : { name: pack.current_unit.name, goals: [] },
    previous_lesson: prev ? { practised: prev.objectives_practised.map((o) => o.title), went_well: prev.what_went_well.slice(0, 2), was_hard: prev.what_was_hard.slice(0, 2) } : null,
    plan: state.activities.map((a) => ({ step: a.sequence, activity_type: a.activityType, label: ACTIVITY[a.activityType].kid, minutes: a.plannedMinutes ?? 0, done: done.has(a.id) })),
    minutes: state.lesson.plannedDurationMinutes ?? 20,
  };
}

function closingOf(state: PlayState): VoiceClosing {
  const notes = (state.primaryObjective.teachingNotes ?? {}) as Notes;
  return {
    theme: state.primaryObjective.title,
    key_phrases: (notes.structures ?? []).slice(0, 6),
    can_do: (notes.success_criteria ?? []).slice(0, 3),
    activities_done: state.completedCount,
    activities_total: state.activities.length,
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
  // Prepared now so begin_lesson answers quickly, but not given to the model until the opening is done.
  const brief = await voiceBrief(access, provider, lessonId, dbh);
  if (!brief) throw new ValidationError("There is no activity left in this lesson.");
  const { pack } = await buildLessonContext(access, state.lesson.subjectId, lessonId, {}, dbh);
  const overview = lessonOverview(await getPlayState(access, lessonId, dbh), pack);
  const model = realtimeModelFor(quality);
  const session = buildRealtimeSession({
    model,
    voice: env.OPENAI_REALTIME_VOICE,
    transcriptionModel: env.OPENAI_TRANSCRIBE_MODEL,
    instructions: renderVoiceInstructions({ pack, overview }),
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
      { ...base, result: m.result, confidence: "MEDIUM" },
      { gradedBy: "SYSTEM", graderRef: { method: `${m.method}_match`, policy: ANSWER_MATCH_POLICY.version, input: "voice_live", reason: `voice_judgement:${input.judgement}${heard ? "" : ",no_transcript"}` } },
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

/** begin_lesson: the opening is over; hand over the current activity. */
export async function voiceBeginLesson(access: StudentAccess, provider: AIProvider, lessonId: string, dbh: DbOrTx = db()) {
  const brief = await voiceBrief(access, provider, lessonId, dbh);
  if (brief) return { lesson_complete: false, activity: brief };
  return { lesson_complete: true, closing: closingOf(await getPlayState(access, lessonId, dbh)) };
}

/** next_activity: closes the current activity and briefs the next one, or hands over the closing. */
export async function voiceNextActivity(access: StudentAccess, provider: AIProvider, lessonId: string, dbh: DbOrTx = db()) {
  const next = await playNextActivity(access, lessonId, dbh);
  const brief = next ? await voiceBrief(access, provider, lessonId, dbh) : null;
  if (brief) return { lesson_complete: false, activity: brief };
  return { lesson_complete: true, closing: closingOf(await getPlayState(access, lessonId, dbh)), next_step: "PART 3 - CLOSING now, then finish_lesson." };
}

/** finish_lesson: completes the lesson, which produces the report and state updates as any lesson does. */
export async function voiceFinish(access: StudentAccess, lessonId: string, dbh: DbOrTx = db()) {
  const state = await getPlayState(access, lessonId, dbh);
  if (state.lesson.status === "IN_PROGRESS") await playFinish(access, lessonId, dbh);
  return { finished: true };
}
