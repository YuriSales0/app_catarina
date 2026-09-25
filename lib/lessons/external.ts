import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import type { StudentAccess } from "@/lib/authorization/access";
import { ConflictError, ValidationError } from "@/lib/authorization/errors";
import { buildLessonContext } from "@/lib/context/build";
import { matchAnswer, ANSWER_MATCH_POLICY } from "@/lib/assessment/answer-match";
import { ACTIVITY } from "@/lib/copy/pt";
import { externalClosingSchema, extractClosingJson, type ExternalClosing } from "@/schemas/external-closing";
import { renderExternalLessonPrompt, renderExternalClosingRequest, renderExternalPlacementPrompt, materialFor, EXTERNAL_PROMPT_VERSION } from "./external-prompt";
import { lessonOverview } from "./voice";
import { getPlayState } from "./play";
import { getLesson, startLesson, recordEvidence, recordLessonEvent, completeLesson } from "./service";
import { metric } from "@/lib/logging/logger";

/**
 * Running a lesson in the family's own ChatGPT. The app writes the script;
 * the parent pastes it into ChatGPT, the child has the lesson there by voice,
 * then the parent sends the closing request as a typed message and pastes
 * ChatGPT's closing block back here.
 *
 * What comes back is a report from a model the system did not watch, so it
 * is treated like any AI grading and weaker: every attempt is recorded as
 * AI-graded with LOW confidence (the state policy caps what that can prove),
 * answers with an expected response are re-checked by the system's matcher,
 * and the whole closing is kept as a lesson event for audit. The parent can
 * correct any row afterwards like any other evidence.
 */
export const EXTERNAL_PROVIDER = "chatgpt_external" as const;

/** A short code in the script and in the closing, so a closing cannot land on the wrong lesson. */
export function lessonCode(lessonId: string): string {
  return lessonId.replace(/-/g, "").slice(-6).toUpperCase();
}

export async function buildExternalLesson(access: StudentAccess, lessonId: string, dbh: DbOrTx = db()) {
  const state = await getPlayState(access, lessonId, dbh);
  if (state.lesson.status === "COMPLETED" || state.lesson.status === "CANCELLED") throw new ConflictError("Esta aula já terminou.");
  const { pack } = await buildLessonContext(access, state.lesson.subjectId, lessonId, {}, dbh);
  const overview = lessonOverview(state, pack);
  type Notes = { vocabulary?: string[]; structures?: string[] };
  const notesOf = (o: { teachingNotes: unknown } | undefined | null) => (o?.teachingNotes ?? {}) as Notes;
  const objectiveById = new Map(state.objectives.map((o) => [o.id, o]));
  const activities = state.activities.map((a) => {
    const objective = a.objectiveId ? objectiveById.get(a.objectiveId) : null;
    const isReview = Boolean(objective && objective.id !== state.primaryObjective.id);
    return {
      sequence: a.sequence,
      label: ACTIVITY[a.activityType].kid,
      activity_type: a.activityType,
      instructions: a.instructions,
      minutes: a.plannedMinutes ?? 0,
      expected_attempts: a.expectedEvidenceCount,
      review: isReview && objective ? { title: objective.title, vocabulary: notesOf(objective).vocabulary ?? [], phrases: notesOf(objective).structures ?? [] } : null,
    };
  });
  const code = lessonCode(lessonId);
  const placementTest = (state.lesson.planPayload as { placement_test?: { units: Array<{ unit_name: string; objective_id: string; objective_title: string }> } | null }).placement_test;
  if (placementTest?.units.length) {
    // The level check: activity 1 is the welcome, then one activity per probed unit.
    const probeActivities = state.activities.filter((a) => a.activityType === "ASSESSMENT");
    const probes = placementTest.units.map((u, i) => {
      const notes = notesOf(objectiveById.get(u.objective_id)) as Notes & { example_prompts?: string[] };
      return { sequence: probeActivities[i]?.sequence ?? i + 2, unit_name: u.unit_name, topic: u.objective_title, vocabulary: notes.vocabulary ?? [], phrases: notes.structures ?? [], examples: notes.example_prompts ?? [] };
    });
    const labelled = activities.map((a) => ({ ...a, label: a.activity_type === "ORIENTATION" ? "Abertura do teste" : `Teste: ${probes.find((p) => p.sequence === a.sequence)?.unit_name ?? a.label}` }));
    return {
      prompt: renderExternalPlacementPrompt({ pack, probes }),
      closingRequest: renderExternalClosingRequest({ childName: pack.student.display_name, lessonCode: code, activities: labelled }),
      code,
      state,
    };
  }
  const primary = notesOf(state.primaryObjective);
  const material = materialFor(overview.stage, primary.vocabulary ?? [], (primary.structures ?? []).slice(0, 6), pack.pedagogical_constraints.max_new_vocabulary_items);
  return {
    prompt: renderExternalLessonPrompt({ pack, overview, activities, material }),
    closingRequest: renderExternalClosingRequest({ childName: pack.student.display_name, lessonCode: code, activities }),
    code,
    state,
  };
}

export function formatClosingNote(c: ExternalClosing): string {
  const parts = [
    `Fechamento da aula no ChatGPT: ${c.summary || "sem resumo."}`,
    c.went_well.length ? `Foi bem: ${c.went_well.join("; ")}.` : null,
    c.was_hard.length ? `Foi difícil: ${c.was_hard.join("; ")}.` : null,
    c.next_time ? `Próxima aula: ${c.next_time}` : null,
  ].filter(Boolean);
  return parts.join("\n").slice(0, 4000);
}

/** Parses and validates what the parent pasted, without writing anything. */
export function parseClosing(pasted: string): ExternalClosing {
  let json: unknown;
  try {
    json = extractClosingJson(pasted);
  } catch {
    throw new ValidationError("Não encontrei o bloco de fechamento. Saia do modo voz, cole o pedido de fechamento (passo 3) na mesma conversa e copie a resposta inteira do ChatGPT.");
  }
  const parsed = externalClosingSchema.safeParse(json);
  if (!parsed.success) {
    throw new ValidationError(
      "O bloco de fechamento veio num formato diferente do esperado. Cole o pedido de fechamento (passo 3) de novo na conversa e copie a nova resposta.",
      parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "bloco"}: ${i.message}`),
    );
  }
  return parsed.data;
}

/**
 * Records a pasted closing: validates everything first, then starts the
 * lesson if needed, records each attempt, closes the reported activities and
 * completes the lesson with the closing as the teacher's note.
 */
export async function recordExternalClosing(access: StudentAccess, lessonId: string, pasted: string, dbh: DbOrTx = db()) {
  const closing = parseClosing(pasted);
  const detail = await getLesson(access, lessonId, dbh);
  if (detail.lesson.status === "COMPLETED" || detail.lesson.status === "CANCELLED") throw new ConflictError("Esta aula já foi concluída; o fechamento não foi registrado de novo.");
  const expected = lessonCode(lessonId);
  if (closing.lesson_code.toUpperCase() !== expected) {
    throw new ValidationError(`Este fechamento é de outra aula (código ${closing.lesson_code}). O código desta aula é ${expected}. Confira se colou a conversa certa.`);
  }
  const bySequence = new Map(detail.activities.map((a) => [a.sequence, a]));
  const unknown = closing.activities.filter((a) => !bySequence.has(a.activity)).map((a) => a.activity);
  if (unknown.length) throw new ValidationError(`O fechamento cita atividades que não existem nesta aula: ${unknown.join(", ")}.`);
  const attempts = closing.activities.reduce((n, a) => n + a.attempts.length, 0);
  if (attempts === 0 && !closing.summary) throw new ValidationError("O fechamento veio vazio: nenhuma tentativa e nenhum resumo.");

  if (detail.lesson.status === "PLANNED") await startLesson(access, lessonId, dbh);
  const completed = new Set(detail.events.filter((e) => e.eventType === "ACTIVITY_COMPLETED" && e.activityId).map((e) => e.activityId!));
  let recorded = 0;
  for (const reported of [...closing.activities].sort((a, b) => a.activity - b.activity)) {
    const activity = bySequence.get(reported.activity)!;
    if (activity.objectiveId) {
      for (const at of reported.attempts) {
        const said = at.child_said?.trim() || null;
        const key = at.expected?.trim() || null;
        const m = said && key ? matchAnswer(said, [key]) : null;
        await recordEvidence(
          access,
          {
            lessonId,
            activityId: activity.id,
            objectiveId: activity.objectiveId,
            prompt: at.prompt,
            studentResponse: said ?? undefined,
            expectedResponse: key ?? undefined,
            result: m ? m.result : at.result,
            evidenceType: activity.activityType === "ASSESSMENT" ? "ASSESSMENT" : "PRACTICE",
            confidence: "LOW",
            errorTags: [],
          },
          {
            gradedBy: "AI_PROVIDER",
            graderRef: { provider: EXTERNAL_PROVIDER, promptVersion: EXTERNAL_PROMPT_VERSION, method: m ? `${m.method}_match` : "external_judgement", policy: m ? ANSWER_MATCH_POLICY.version : undefined, input: "external_report", reason: `external_judgement:${at.result}` },
          },
          dbh,
        );
        recorded++;
      }
    }
    if (!completed.has(activity.id)) {
      await recordLessonEvent(access, { lessonId, activityId: activity.id, eventType: "ACTIVITY_COMPLETED", payload: { surface: "chatgpt", attempts: reported.attempts.length } }, dbh);
    }
  }
  await recordLessonEvent(access, { lessonId, eventType: "AI_PROPOSAL_RECEIVED", payload: { kind: "external_closing", provider: EXTERNAL_PROVIDER, prompt_version: EXTERNAL_PROMPT_VERSION, proposal: closing } }, dbh);
  const result = await completeLesson(access, { lessonId, teacherNote: formatClosingNote(closing), actualDurationMinutes: closing.minutes ?? undefined }, dbh);
  metric("ai_proposal_received", { lessonId, kind: "external_closing", provider: EXTERNAL_PROVIDER });
  return { recorded, report: result.report };
}
