import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx, Db } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import { NotFoundError } from "@/lib/authorization/errors";
import { getStudentProgress } from "@/lib/learning/progress";
import { getNextLessonPlan } from "@/lib/learning/next-lesson";
import { CURRENT_STATE_POLICY } from "@/lib/learning/state-policy";
import { ENGINE_VERSION } from "@/lib/learning/engine-policy";
import { findRecurringErrors } from "@/lib/assessment/recurring-errors";
import { effectiveEvidence, isAssessed, score, type EvidenceRow } from "@/lib/learning/evidence-view";
import { snapshotPayloadSchema, generatedFromSchema, EPISTEMIC_KEY, SNAPSHOT_SCHEMA_VERSION, type SnapshotPayload, type SnapshotSubject, type GeneratedFrom } from "@/schemas/snapshot";
import { contentHash } from "./canonical";
import { ageYears } from "@/lib/students/age";

export const SNAPSHOT_GENERATOR_VERSION = "snapshot-generator.v1";
const DAY_MS = 86_400_000;

export type SnapshotOptions = {
  scope: "STUDENT" | "SUBJECT";
  subjectId?: string;
  trigger: GeneratedFrom["trigger"];
  now?: Date;
};

/**
 * Computes the payload without persisting. Deterministic for a fixed `now`
 * and ledger, which is what the hash-stability test asserts.
 */
export async function computeSnapshot(access: StudentAccess, opts: SnapshotOptions, dbh: DbOrTx = db()): Promise<{ payload: Omit<SnapshotPayload, "snapshot_version">; generatedFrom: Omit<GeneratedFrom, "trigger"> }> {
  const now = opts.now ?? new Date();
  const student = await dbh.query.students.findFirst({ where: eq(s.students.id, access.studentId) });
  if (!student) throw new NotFoundError();
  const enrolments = await dbh.query.studentSubjects.findMany({
    where: and(eq(s.studentSubjects.studentId, access.studentId), opts.scope === "SUBJECT" && opts.subjectId ? eq(s.studentSubjects.subjectId, opts.subjectId) : undefined),
    orderBy: asc(s.studentSubjects.createdAt),
  });
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const subjects: SnapshotSubject[] = [];
  const lessonIds: string[] = [];
  let evidenceWatermark: Date | null = null;
  let evidenceCount = 0;

  for (const e of enrolments) {
    if (!e.curriculumVersionId) continue;
    const progress = await getStudentProgress(access, e.subjectId, dbh, now);
    const [windowEvidence, allEvidenceMeta, recentLessons, skillLinks] = await Promise.all([
      dbh.query.learningEvidence.findMany({ where: and(eq(s.learningEvidence.studentId, access.studentId), eq(s.learningEvidence.subjectId, e.subjectId), gte(s.learningEvidence.occurredAt, since)) }),
      dbh
        .select({ count: sql<number>`count(*)`, max: sql<Date | null>`max(${s.learningEvidence.createdAt})` })
        .from(s.learningEvidence)
        .where(and(eq(s.learningEvidence.studentId, access.studentId), eq(s.learningEvidence.subjectId, e.subjectId))),
      dbh.query.lessons.findMany({
        where: and(eq(s.lessons.studentId, access.studentId), eq(s.lessons.subjectId, e.subjectId), eq(s.lessons.status, "COMPLETED")),
        orderBy: desc(s.lessons.completedAt),
        limit: 5,
      }),
      dbh
        .select({ objectiveId: s.objectiveSkills.objectiveId, skillId: s.skills.id, name: s.skills.name })
        .from(s.objectiveSkills)
        .innerJoin(s.skills, eq(s.skills.id, s.objectiveSkills.skillId))
        .where(inArray(s.objectiveSkills.objectiveId, progress.objectives.map((o) => o.objective.id))),
    ]);
    evidenceCount += Number(allEvidenceMeta[0]?.count ?? 0);
    const mx = allEvidenceMeta[0]?.max ? new Date(allEvidenceMeta[0].max) : null;
    if (mx && (!evidenceWatermark || mx > evidenceWatermark)) evidenceWatermark = mx;

    const asView = (r: s.LearningEvidenceRow): EvidenceRow => ({ id: r.id, lessonId: r.lessonId, result: r.result, evidenceType: r.evidenceType, gradedBy: r.gradedBy, confidence: r.confidence, supersedesEvidenceId: r.supersedesEvidenceId, errorTags: r.errorTags, occurredAt: r.occurredAt });
    const eff = effectiveEvidence(windowEvidence.map(asView)).filter(isAssessed);
    const effIds = new Set(eff.map((r) => r.id));
    const byResult = { CORRECT: 0, PARTIALLY_CORRECT: 0, INCORRECT: 0, NOT_ASSESSED: 0 };
    const byGrader = { SYSTEM: 0, HUMAN: 0, AI_PROVIDER: 0 };
    for (const r of eff) {
      byResult[r.result]++;
      byGrader[r.gradedBy]++;
    }

    // Skill states over the 30-day window: first half vs second half for the trend.
    const skillIds = [...new Set(skillLinks.map((k) => k.skillId))];
    const objectiveSkills = new Map<string, string[]>();
    for (const k of skillLinks) objectiveSkills.set(k.objectiveId, [...(objectiveSkills.get(k.objectiveId) ?? []), k.skillId]);
    const mid = new Date(now.getTime() - 15 * DAY_MS);
    const skillStates = skillIds
      .map((skillId) => {
        const name = skillLinks.find((k) => k.skillId === skillId)!.name;
        const rows = windowEvidence.filter((r) => effIds.has(r.id) && (r.skillId === skillId || objectiveSkills.get(r.objectiveId)?.includes(skillId)));
        const rate = (list: typeof rows) => (list.length ? list.reduce((a, r) => a + score(asView(r), CURRENT_STATE_POLICY.partialCreditScore), 0) / list.length : null);
        const early = rows.filter((r) => r.occurredAt < mid);
        const late = rows.filter((r) => r.occurredAt >= mid);
        let trend: SnapshotSubject["skill_states"][number]["trend"] = "INSUFFICIENT_DATA";
        if (early.length >= 3 && late.length >= 3) {
          const d = (rate(late) ?? 0) - (rate(early) ?? 0);
          trend = d > 0.1 ? "IMPROVING" : d < -0.1 ? "DECLINING" : "STABLE";
        }
        return { skill_id: skillId, name, attempts_30d: rows.length, success_rate_30d: rate(rows), trend };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const recurring = findRecurringErrors(windowEvidence.map((r) => ({ id: r.id, lessonId: r.lessonId, objectiveId: r.objectiveId, errorTags: r.errorTags, occurredAt: r.occurredAt })), now);
    const vocabulary = progress.version.errorTagVocabulary;
    const difficulties = recurring.map((r) => {
      const early = windowEvidence.filter((x) => x.errorTags.includes(r.errorTag) && x.occurredAt < mid).length;
      const late = windowEvidence.filter((x) => x.errorTags.includes(r.errorTag) && x.occurredAt >= mid).length;
      return {
        error_tag: r.errorTag,
        human_label: vocabulary[r.errorTag] ?? r.errorTag,
        occurrences_30d: r.occurrences,
        affected_objective_ids: r.objectiveIds,
        first_seen_at: r.firstSeenAt.toISOString(),
        trend: (late > early ? "WORSENING" : late < early ? "IMPROVING" : "PERSISTENT") as "WORSENING" | "IMPROVING" | "PERSISTENT",
      };
    });

    const lessonEvidence = recentLessons.length ? await dbh.query.learningEvidence.findMany({ where: inArray(s.learningEvidence.lessonId, recentLessons.map((l) => l.id)) }) : [];
    const recentLessonRows = recentLessons.map((l) => {
      const rows = effectiveEvidence(lessonEvidence.filter((x) => x.lessonId === l.id).map(asView)).filter(isAssessed);
      const primary = progress.objectives.find((o) => o.objective.id === l.primaryObjectiveId);
      lessonIds.push(l.id);
      return {
        lesson_id: l.id,
        lesson_number: l.lessonNumber,
        completed_at: l.completedAt!.toISOString(),
        primary_objective: { id: l.primaryObjectiveId, title: primary?.objective.title ?? "" },
        attempts: rows.length,
        success_rate: rows.length ? rows.reduce((a, r) => a + score(r, CURRENT_STATE_POLICY.partialCreditScore), 0) / rows.length : null,
      };
    });

    const unitsWithObjectives = new Map<string, { total: number; mastered: number }>();
    for (const o of progress.objectives) {
      const u = unitsWithObjectives.get(o.unit.id) ?? { total: 0, mastered: 0 };
      u.total++;
      if (o.status === "MASTERED") u.mastered++;
      unitsWithObjectives.set(o.unit.id, u);
    }
    const plan = await getNextLessonPlan(access, e.subjectId, { now, lessonMinutes: e.plannedLessonMinutes }, dbh);
    const recommended = plan.primary_objective
      ? [{ objective_id: plan.primary_objective.id, code: plan.primary_objective.code, title: plan.primary_objective.title, reason: plan.rationale.selected_because.map((x) => x.kind).join(", ") || plan.outcome }]
      : [];

    subjects.push({
      subject: { id: progress.subject.id, name: progress.subject.name, slug: progress.subject.slug },
      active: e.active,
      curriculum: { name: progress.curriculum.name, version: progress.version.version, source: progress.curriculum.source, version_id: progress.version.id },
      instruction_language: e.instructionLanguage,
      target_language: e.targetLanguage,
      progress: {
        objectives_total: progress.summary.total,
        by_status: { NOT_STARTED: progress.summary.NOT_STARTED, INTRODUCED: progress.summary.INTRODUCED, PRACTISING: progress.summary.PRACTISING, DEVELOPING: progress.summary.DEVELOPING, PROFICIENT: progress.summary.PROFICIENT, MASTERED: progress.summary.MASTERED },
        mastered_percent: progress.summary.total ? Math.round((progress.summary.MASTERED / progress.summary.total) * 1000) / 10 : 0,
        units_completed: [...unitsWithObjectives.values()].filter((u) => u.total > 0 && u.mastered === u.total).length,
        units_total: unitsWithObjectives.size,
      },
      current_objectives: progress.objectives
        .filter((o) => o.status !== "NOT_STARTED" && o.status !== "MASTERED")
        .map((o) => ({
          objective_id: o.objective.id,
          code: o.objective.code,
          title: o.objective.title,
          status: o.status,
          confidence: o.confidence,
          assessed_attempts: o.state?.assessedAttempts ?? 0,
          success_rate_recent: o.state?.successRateRecent === null || o.state?.successRateRecent === undefined ? null : Number(o.state.successRateRecent),
          last_assessed_at: o.state?.lastAssessedAt?.toISOString() ?? null,
          proficient_since: o.state?.proficientSince?.toISOString() ?? null,
        })),
      objective_states: progress.objectives.map((o) => ({
        objective_id: o.objective.id,
        lineage_id: o.objective.lineageId,
        code: o.objective.code,
        status: o.status,
        confidence: o.confidence,
        last_assessed_at: o.state?.lastAssessedAt?.toISOString() ?? null,
      })),
      skill_states: skillStates,
      recurring_difficulties: difficulties,
      recent_evidence_summary: { window_days: 30, total_attempts: eff.length, by_result: byResult, by_grader: byGrader, distinct_objectives: new Set(windowEvidence.filter((r) => effIds.has(r.id)).map((r) => r.objectiveId)).size },
      recent_lessons: recentLessonRows,
      review_priorities: progress.objectives
        .filter((o) => o.review?.nextReviewAt && o.review.nextReviewAt.getTime() <= now.getTime() && (o.status === "PROFICIENT" || o.status === "MASTERED"))
        .map((o) => ({
          objective_id: o.objective.id,
          code: o.objective.code,
          title: o.objective.title,
          next_review_at: o.review!.nextReviewAt!.toISOString(),
          days_overdue: Math.floor((now.getTime() - o.review!.nextReviewAt!.getTime()) / DAY_MS),
          interval_days: o.review!.intervalDays,
        }))
        .sort((a, b) => b.days_overdue - a.days_overdue),
      recommended_next_objectives: recommended,
    });
  }

  const payload = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    student: { display_name: student.name, age_years: ageYears(student.dateOfBirth, now), school_year: student.schoolYear },
    generated_at: now.toISOString(),
    subjects,
    epistemic_key: { observed: [...EPISTEMIC_KEY.observed], inferred: [...EPISTEMIC_KEY.inferred], recommended: [...EPISTEMIC_KEY.recommended] },
  };
  return {
    payload,
    generatedFrom: {
      rule_version: CURRENT_STATE_POLICY.version,
      engine_version: ENGINE_VERSION,
      snapshot_generator_version: SNAPSHOT_GENERATOR_VERSION,
      evidence_watermark: evidenceWatermark?.toISOString() ?? null,
      evidence_count: evidenceCount,
      lesson_ids: [...new Set(lessonIds)].sort(),
    },
  };
}

/** Persists an immutable snapshot with a monotonic per-student version. */
export async function generateSnapshot(access: StudentAccess, opts: SnapshotOptions, dbh: DbOrTx = db()) {
  const { payload, generatedFrom } = await computeSnapshot(access, opts, dbh);
  const run = async (tx: DbOrTx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"snapshot:" + access.studentId}))`);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${s.learningSnapshots.snapshotVersion}), 0) + 1` })
      .from(s.learningSnapshots)
      .where(eq(s.learningSnapshots.studentId, access.studentId));
    const full: SnapshotPayload = snapshotPayloadSchema.parse({ ...payload, snapshot_version: Number(next) });
    const gf = generatedFromSchema.parse({ ...generatedFrom, trigger: opts.trigger });
    const [row] = await tx
      .insert(s.learningSnapshots)
      .values({
        studentId: access.studentId,
        snapshotVersion: Number(next),
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        scope: opts.scope,
        subjectId: opts.scope === "SUBJECT" ? (opts.subjectId ?? null) : null,
        generatedFrom: gf,
        statePayload: full,
        contentHash: contentHash(full),
      })
      .returning();
    return row;
  };
  // Inside a caller's transaction this simply runs; on a plain handle it opens one.
  return "rollback" in dbh ? run(dbh) : (dbh as Db).transaction(run);
}

export async function listSnapshots(access: StudentAccess, dbh: DbOrTx = db()) {
  return dbh.query.learningSnapshots.findMany({ where: eq(s.learningSnapshots.studentId, access.studentId), orderBy: desc(s.learningSnapshots.snapshotVersion) });
}

export async function getSnapshot(access: StudentAccess, snapshotId: string, dbh: DbOrTx = db()) {
  const row = await dbh.query.learningSnapshots.findFirst({ where: and(eq(s.learningSnapshots.id, snapshotId), eq(s.learningSnapshots.studentId, access.studentId)) });
  if (!row) throw new NotFoundError();
  return { row, payload: snapshotPayloadSchema.parse(row.statePayload), generatedFrom: generatedFromSchema.parse(row.generatedFrom) };
}
