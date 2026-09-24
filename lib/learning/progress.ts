import { and, asc, eq, inArray, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import { NotFoundError } from "@/lib/authorization/errors";
import { evaluateUnlock, type PrerequisiteEdge, type UnlockResult } from "./prerequisites";
import type { ObjectiveStatus, ConfidenceLevel } from "@/lib/db/enums";

export type ObjectiveProgress = {
  objective: s.LearningObjectiveRow;
  unit: { id: string; name: string; unitKey: string; sequence: number; parentUnitId: string | null };
  status: ObjectiveStatus;
  confidence: ConfidenceLevel;
  state: s.StudentObjectiveStateRow | null;
  review: s.StudentObjectiveReviewRow | null;
  /** A secure objective whose spaced review date has passed. */
  reviewDue: boolean;
  unlock: UnlockResult;
  skills: string[];
};

export type StudentProgress = {
  enrolment: s.StudentSubjectRow;
  version: s.CurriculumVersionRow;
  curriculum: s.CurriculumRow;
  subject: s.SubjectRow;
  units: s.CurriculumUnitRow[];
  objectives: ObjectiveProgress[];
  edges: PrerequisiteEdge[];
  statusByLineage: Map<string, ObjectiveStatus>;
  summary: Record<ObjectiveStatus, number> & { total: number; unlocked: number; dueForReview: number };
  recentTransitions: s.StudentObjectiveStateTransitionRow[];
};

/**
 * The knowledge model for one enrolment: every objective of the pinned
 * curriculum version with derived state, review schedule and unlock status.
 */
export async function getStudentProgress(access: StudentAccess, subjectId: string, dbh: DbOrTx = db(), now = new Date()): Promise<StudentProgress> {
  const enrolment = await dbh.query.studentSubjects.findFirst({
    where: and(eq(s.studentSubjects.studentId, access.studentId), eq(s.studentSubjects.subjectId, subjectId)),
  });
  if (!enrolment || !enrolment.curriculumVersionId) throw new NotFoundError();
  const version = await dbh.query.curriculumVersions.findFirst({ where: eq(s.curriculumVersions.id, enrolment.curriculumVersionId) });
  if (!version) throw new NotFoundError();
  const curriculum = (await dbh.query.curricula.findFirst({ where: eq(s.curricula.id, version.curriculumId) }))!;
  const subject = (await dbh.query.subjects.findFirst({ where: eq(s.subjects.id, subjectId) }))!;

  const units = await dbh.query.curriculumUnits.findMany({ where: eq(s.curriculumUnits.curriculumVersionId, version.id), orderBy: asc(s.curriculumUnits.sequence) });
  const objectives = await dbh.query.learningObjectives.findMany({ where: eq(s.learningObjectives.curriculumVersionId, version.id) });
  const ids = objectives.map((o) => o.id);
  const [edgesRaw, states, reviews, skillRows, transitions] = await Promise.all([
    ids.length ? dbh.query.objectivePrerequisites.findMany({ where: inArray(s.objectivePrerequisites.objectiveId, ids) }) : [],
    dbh.query.studentObjectiveState.findMany({ where: and(eq(s.studentObjectiveState.studentId, access.studentId), eq(s.studentObjectiveState.subjectId, subjectId)) }),
    dbh.query.studentObjectiveReview.findMany({ where: and(eq(s.studentObjectiveReview.studentId, access.studentId), eq(s.studentObjectiveReview.subjectId, subjectId)) }),
    ids.length
      ? dbh
          .select({ objectiveId: s.objectiveSkills.objectiveId, name: s.skills.name })
          .from(s.objectiveSkills)
          .innerJoin(s.skills, eq(s.skills.id, s.objectiveSkills.skillId))
          .where(inArray(s.objectiveSkills.objectiveId, ids))
      : [],
    dbh.query.studentObjectiveStateTransition.findMany({
      where: eq(s.studentObjectiveStateTransition.studentId, access.studentId),
      orderBy: desc(s.studentObjectiveStateTransition.createdAt),
      limit: 20,
    }),
  ]);

  const edges: PrerequisiteEdge[] = edgesRaw.map((e) => ({
    objectiveId: e.objectiveId,
    prerequisiteObjectiveId: e.prerequisiteObjectiveId,
    requiredStatus: e.requiredStatus,
    strength: e.strength,
  }));
  const lineageOf = new Map(objectives.map((o) => [o.id, o.lineageId]));
  // State by lineage: the most advanced status recorded for that lineage (any version).
  const statusByLineage = new Map<string, ObjectiveStatus>();
  for (const st of states) {
    const prev = statusByLineage.get(st.objectiveLineageId);
    if (!prev || rank(st.status) > rank(prev)) statusByLineage.set(st.objectiveLineageId, st.status);
  }
  const stateByObjective = new Map(states.map((st) => [st.objectiveId, st]));
  const reviewByObjective = new Map(reviews.map((r) => [r.objectiveId, r]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const unitOrder = new Map<string, number>();
  const topo = (u: s.CurriculumUnitRow): number => {
    if (unitOrder.has(u.id)) return unitOrder.get(u.id)!;
    const parent = u.parentUnitId ? unitById.get(u.parentUnitId) : null;
    const v = (parent ? topo(parent) * 100 : 0) + u.sequence;
    unitOrder.set(u.id, v);
    return v;
  };
  units.forEach(topo);

  const rows: ObjectiveProgress[] = objectives
    .map((o) => {
      const st = stateByObjective.get(o.id) ?? null;
      const unit = unitById.get(o.curriculumUnitId)!;
      const status = st?.status ?? statusByLineage.get(o.lineageId) ?? "NOT_STARTED";
      const review = reviewByObjective.get(o.id) ?? null;
      return {
        objective: o,
        unit: { id: unit.id, name: unit.name, unitKey: unit.unitKey, sequence: unit.sequence, parentUnitId: unit.parentUnitId },
        status,
        confidence: st?.confidence ?? "LOW",
        state: st,
        review,
        reviewDue: Boolean(review?.nextReviewAt && review.nextReviewAt.getTime() <= now.getTime() && rank(status) >= rank("PROFICIENT")),
        unlock: evaluateUnlock(o.id, edges, lineageOf, statusByLineage),
        skills: skillRows.filter((k) => k.objectiveId === o.id).map((k) => k.name),
      };
    })
    .sort((a, b) => (unitOrder.get(a.unit.id)! - unitOrder.get(b.unit.id)!) || a.objective.sequence - b.objective.sequence);

  const summary = { NOT_STARTED: 0, INTRODUCED: 0, PRACTISING: 0, DEVELOPING: 0, PROFICIENT: 0, MASTERED: 0, total: rows.length, unlocked: 0, dueForReview: 0 };
  for (const r of rows) {
    summary[r.status]++;
    if (r.unlock.unlocked) summary.unlocked++;
    if (r.reviewDue) summary.dueForReview++;
  }

  return { enrolment, version, curriculum, subject, units, objectives: rows, edges, statusByLineage, summary, recentTransitions: transitions };
}

function rank(st: ObjectiveStatus): number {
  return ["NOT_STARTED", "INTRODUCED", "PRACTISING", "DEVELOPING", "PROFICIENT", "MASTERED"].indexOf(st);
}

/** The evidence and transitions behind one objective's state: the audit view. */
export async function explainObjectiveState(access: StudentAccess, objectiveId: string, dbh: DbOrTx = db()) {
  const objective = await dbh.query.learningObjectives.findFirst({ where: eq(s.learningObjectives.id, objectiveId) });
  if (!objective) throw new NotFoundError();
  const state = await dbh.query.studentObjectiveState.findFirst({
    where: and(eq(s.studentObjectiveState.studentId, access.studentId), eq(s.studentObjectiveState.objectiveId, objectiveId)),
  });
  const transitions = await dbh.query.studentObjectiveStateTransition.findMany({
    where: and(eq(s.studentObjectiveStateTransition.studentId, access.studentId), eq(s.studentObjectiveStateTransition.objectiveId, objectiveId)),
    orderBy: asc(s.studentObjectiveStateTransition.createdAt),
  });
  const evidence = await dbh.query.learningEvidence.findMany({
    where: and(eq(s.learningEvidence.studentId, access.studentId), eq(s.learningEvidence.objectiveLineageId, objective.lineageId)),
    orderBy: asc(s.learningEvidence.occurredAt),
  });
  const lessonIds = [...new Set(evidence.map((e) => e.lessonId).filter((x): x is string => Boolean(x)))];
  const lessons = lessonIds.length ? await dbh.query.lessons.findMany({ where: inArray(s.lessons.id, lessonIds) }) : [];
  return { objective, state, transitions, evidence, lessons };
}
