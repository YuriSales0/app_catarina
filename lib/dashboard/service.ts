import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { Actor } from "@/lib/auth/session";
import { listAccessibleStudents, requireStudentAccess } from "@/lib/authorization/access";
import { listEnrolments } from "@/lib/students/service";
import { getStudentProgress, type StudentProgress } from "@/lib/learning/progress";
import { getNextLessonPlan } from "@/lib/learning/next-lesson";
import { listRecommendations } from "@/lib/recommendations/service";
import { findRecurringErrors, RECURRING_ERROR_POLICY } from "@/lib/assessment/recurring-errors";
import { effectiveEvidence, isAssessed, type EvidenceRow } from "@/lib/learning/evidence-view";
import { NotFoundError } from "@/lib/authorization/errors";
import type { NextLessonPlan } from "@/schemas/lesson-plan";

export type SubjectCard = {
  subjectId: string;
  subjectName: string;
  curriculumName: string | null;
  curriculumVersion: string | null;
  curriculumIsDemo: boolean;
  active: boolean;
  summary: StudentProgress["summary"] | null;
  currentObjectives: Array<{ id: string; code: string; title: string; status: StudentProgress["objectives"][number]["status"]; confidence: string; attempts: number; recentCorrect: number; recentTotal: number }>;
  recurringDifficulties: Array<{ errorTag: string; label: string; occurrences: number }>;
  next: { outcome: NextLessonPlan["outcome"]; primaryTitle: string | null; primaryStatus: string | null; reasons: string[] } | null;
  inProgressLessonId: string | null;
  lastLesson: { id: string; number: number; completedAt: Date | null; primaryTitle: string } | null;
};

export type WeekDay = { date: string; weekday: string; done: boolean; today: boolean };

export type StudentCard = {
  id: string;
  name: string;
  metadata: unknown;
  timezone: string;
  /** The last seven days in the student's timezone, oldest first, marking days with a completed lesson. */
  week: WeekDay[];
  isDemo: boolean;
  role: string;
  age: number | null;
  subjects: SubjectCard[];
  recommendations: Awaited<ReturnType<typeof listRecommendations>>;
};

const DAY_MS = 86_400_000;

/** Everything the dashboard shows, evidence-first, bounded per student. */
export async function getDashboard(actor: Actor, dbh: DbOrTx = db(), now = new Date()): Promise<StudentCard[]> {
  const students = await listAccessibleStudents(actor, dbh);
  const cards: StudentCard[] = [];
  for (const st of students) {
    const access = await requireStudentAccess(actor, st.id, "VIEW", dbh);
    const [enrolments, recommendations] = await Promise.all([listEnrolments(access, dbh), listRecommendations(access, { status: "PROPOSED", limit: 6 }, dbh)]);
    const subjects: SubjectCard[] = [];
    for (const e of enrolments) {
      let progress: StudentProgress | null = null;
      let next: SubjectCard["next"] = null;
      if (e.curriculumVersionId) {
        try {
          progress = await getStudentProgress(access, e.subjectId, dbh, now);
          const plan = await getNextLessonPlan(access, e.subjectId, { now }, dbh);
          next = { outcome: plan.outcome, primaryTitle: plan.primary_objective?.title ?? null, primaryStatus: plan.primary_objective?.status ?? null, reasons: plan.rationale.selected_because.map((r) => r.kind) };
        } catch (err) {
          if (!(err instanceof NotFoundError)) throw err;
        }
      }
      const since = new Date(now.getTime() - RECURRING_ERROR_POLICY.windowDays * DAY_MS);
      const windowRows = await dbh.query.learningEvidence.findMany({
        where: and(eq(s.learningEvidence.studentId, st.id), eq(s.learningEvidence.subjectId, e.subjectId), gte(s.learningEvidence.occurredAt, since)),
      });
      const recurring = findRecurringErrors(windowRows.map((r) => ({ id: r.id, lessonId: r.lessonId, objectiveId: r.objectiveId, errorTags: r.errorTags, occurredAt: r.occurredAt })), now);
      const vocabulary = progress?.version.errorTagVocabulary ?? {};
      const [lastLesson, inProgress] = await Promise.all([
        dbh.query.lessons.findFirst({ where: and(eq(s.lessons.studentId, st.id), eq(s.lessons.subjectId, e.subjectId), eq(s.lessons.status, "COMPLETED")), orderBy: desc(s.lessons.completedAt) }),
        dbh.query.lessons.findFirst({ where: and(eq(s.lessons.studentId, st.id), eq(s.lessons.subjectId, e.subjectId), inArray(s.lessons.status, ["IN_PROGRESS", "PLANNED"])), orderBy: desc(s.lessons.createdAt) }),
      ]);
      const current = (progress?.objectives ?? []).filter((o) => o.status === "DEVELOPING" || o.status === "PRACTISING" || o.status === "INTRODUCED").slice(0, 4);
      const currentIds = current.map((o) => o.objective.lineageId);
      const recentRows = currentIds.length
        ? await dbh.query.learningEvidence.findMany({ where: and(eq(s.learningEvidence.studentId, st.id), inArray(s.learningEvidence.objectiveLineageId, currentIds)), orderBy: desc(s.learningEvidence.occurredAt), limit: 200 })
        : [];
      const asView = (r: s.LearningEvidenceRow): EvidenceRow => ({ id: r.id, lessonId: r.lessonId, result: r.result, evidenceType: r.evidenceType, gradedBy: r.gradedBy, confidence: r.confidence, supersedesEvidenceId: r.supersedesEvidenceId, errorTags: r.errorTags, occurredAt: r.occurredAt });
      subjects.push({
        subjectId: e.subjectId,
        subjectName: e.subjectName,
        curriculumName: e.curriculumName,
        curriculumVersion: e.curriculumVersion,
        curriculumIsDemo: Boolean(e.curriculumIsDemo),
        active: e.active,
        summary: progress?.summary ?? null,
        currentObjectives: current.map((o) => {
          const rows = effectiveEvidence(recentRows.filter((r) => r.objectiveLineageId === o.objective.lineageId).map(asView)).filter(isAssessed).slice(-10);
          return {
            id: o.objective.id,
            code: o.objective.code,
            title: o.objective.title,
            status: o.status,
            confidence: o.confidence,
            attempts: o.state?.assessedAttempts ?? 0,
            recentCorrect: rows.filter((r) => r.result === "CORRECT").length,
            recentTotal: rows.length,
          };
        }),
        recurringDifficulties: recurring.slice(0, 3).map((r) => ({ errorTag: r.errorTag, label: vocabulary[r.errorTag] ?? r.errorTag, occurrences: r.occurrences })),
        next,
        inProgressLessonId: inProgress?.id ?? null,
        lastLesson: lastLesson ? { id: lastLesson.id, number: lastLesson.lessonNumber, completedAt: lastLesson.completedAt, primaryTitle: progress?.objectives.find((o) => o.objective.id === lastLesson.primaryObjectiveId)?.objective.title ?? "" } : null,
      });
    }
    const recentLessons = await dbh.query.lessons.findMany({
      where: and(eq(s.lessons.studentId, st.id), eq(s.lessons.status, "COMPLETED"), gte(s.lessons.completedAt, new Date(now.getTime() - 7 * DAY_MS))),
      columns: { completedAt: true },
    });
    const week = lastSevenDays(now, st.timezone, recentLessons.map((l) => l.completedAt).filter((d): d is Date => Boolean(d)));
    cards.push({ id: st.id, name: st.name, metadata: st.metadata, timezone: st.timezone, week, isDemo: st.isDemo, role: st.role, age: ageFrom(st.dateOfBirth, now), subjects, recommendations });
  }
  return cards;
}

export function lastSevenDays(now: Date, timeZone: string, completed: Date[]): WeekDay[] {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "narrow" });
  const doneDays = new Set(completed.map((d) => day.format(d)));
  const today = day.format(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * DAY_MS);
    const key = day.format(d);
    return { date: key, weekday: weekday.format(d).toUpperCase(), done: doneDays.has(key), today: key === today };
  });
}

function ageFrom(dob: string | null, now: Date): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}
