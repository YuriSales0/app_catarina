import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import { getLesson, recordLessonEvent, startLesson, recordEvidence, completeLesson } from "./service";
import type { RecordEvidenceInput } from "@/schemas/lessons";

import { proposalFromPayload, type PlayProposal } from "./proposal-payload";

export { proposalFromPayload, type PlayProposal };

/**
 * The child-facing lesson flow, built on the same services as the parent
 * runner. Progress through activities is the event log; nothing here is a
 * new source of truth.
 */
export async function getPlayState(access: StudentAccess, lessonId: string, dbh: DbOrTx = db()) {
  const detail = await getLesson(access, lessonId, dbh);
  const completedActivityIds = new Set(detail.events.filter((e) => e.eventType === "ACTIVITY_COMPLETED" && e.activityId).map((e) => e.activityId!));
  const current = detail.activities.find((a) => !completedActivityIds.has(a.id)) ?? null;
  const objective = current?.objectiveId ? detail.objectives.find((o) => o.id === current.objectiveId) ?? null : null;
  const student = await dbh.query.students.findFirst({ where: and(eq(s.students.id, access.studentId)) });
  const currentEvidence = current ? detail.evidence.filter((e) => e.activityId === current.id) : [];
  const attemptsInCurrent = currentEvidence.length;
  // AI content for the current activity, if any: the latest accepted proposal, and whether one was rejected.
  const proposalEvents = current ? detail.events.filter((e) => e.activityId === current.id && (e.payload as { kind?: string }).kind === "activity") : [];
  const accepted = proposalEvents.filter((e) => e.eventType === "AI_PROPOSAL_RECEIVED").at(-1);
  const proposal = accepted ? proposalFromPayload(accepted.payload) : null;
  const proposalFailed = !proposal && proposalEvents.some((e) => e.eventType === "AI_PROPOSAL_REJECTED");
  return { ...detail, student: student!, current, objective, completedCount: completedActivityIds.size, attemptsInCurrent, currentEvidence, proposal, proposalFailed };
}

export async function playStart(access: StudentAccess, lessonId: string, dbh: DbOrTx = db()) {
  const lesson = await startLesson(access, lessonId, dbh);
  const state = await getPlayState(access, lessonId, dbh);
  if (state.current && !state.events.some((e) => e.activityId === state.current!.id && e.eventType === "ACTIVITY_STARTED")) {
    await recordLessonEvent(access, { lessonId, activityId: state.current.id, eventType: "ACTIVITY_STARTED", payload: { surface: "child" } }, dbh);
  }
  return lesson;
}

export async function playNextActivity(access: StudentAccess, lessonId: string, dbh: DbOrTx = db()) {
  const state = await getPlayState(access, lessonId, dbh);
  if (!state.current) return null;
  await recordLessonEvent(access, { lessonId, activityId: state.current.id, eventType: "ACTIVITY_COMPLETED", payload: { surface: "child", attempts: state.attemptsInCurrent } }, dbh);
  const next = await getPlayState(access, lessonId, dbh);
  if (next.current) await recordLessonEvent(access, { lessonId, activityId: next.current.id, eventType: "ACTIVITY_STARTED", payload: { surface: "child" } }, dbh);
  return next.current;
}

/** A quick mark from the adult sitting with the child: one prompt, one result. Graded by a human. */
export async function playQuickMark(access: StudentAccess, input: RecordEvidenceInput, dbh: DbOrTx = db()) {
  return recordEvidence(access, input, { gradedBy: "HUMAN" }, dbh);
}

export async function playFinish(access: StudentAccess, lessonId: string, dbh: DbOrTx = db()) {
  const state = await getPlayState(access, lessonId, dbh);
  if (state.current) await recordLessonEvent(access, { lessonId, activityId: state.current.id, eventType: "ACTIVITY_COMPLETED", payload: { surface: "child", attempts: state.attemptsInCurrent, early_finish: true } }, dbh);
  return completeLesson(access, { lessonId }, dbh);
}
