import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";

export const EXPORT_SCHEMA_VERSION = "export.v1";

/**
 * Everything recorded about one child, as one JSON document. Owner-only.
 * Tables from later phases are included as they exist; the shape is stable.
 */
export async function exportStudentData(access: StudentAccess, dbh: DbOrTx = db()) {
  const sid = access.studentId;
  const [student, guardians, consents, enrolments, states, transitions, reviews, evidence, lessons, activities, events, reports, inferences, recommendations, snapshots] =
    await Promise.all([
      dbh.query.students.findFirst({ where: eq(s.students.id, sid) }),
      dbh.query.studentGuardians.findMany({ where: eq(s.studentGuardians.studentId, sid) }),
      dbh.query.consents.findMany({ where: eq(s.consents.studentId, sid) }),
      dbh.query.studentSubjects.findMany({ where: eq(s.studentSubjects.studentId, sid) }),
      dbh.query.studentObjectiveState.findMany({ where: eq(s.studentObjectiveState.studentId, sid) }),
      dbh.query.studentObjectiveStateTransition.findMany({ where: eq(s.studentObjectiveStateTransition.studentId, sid), orderBy: asc(s.studentObjectiveStateTransition.createdAt) }),
      dbh.query.studentObjectiveReview.findMany({ where: eq(s.studentObjectiveReview.studentId, sid) }),
      dbh.query.learningEvidence.findMany({ where: eq(s.learningEvidence.studentId, sid), orderBy: asc(s.learningEvidence.createdAt) }),
      dbh.query.lessons.findMany({ where: eq(s.lessons.studentId, sid), orderBy: asc(s.lessons.createdAt) }),
      dbh.query.lessonActivities.findMany({ where: eq(s.lessonActivities.studentId, sid) }),
      dbh.query.lessonEvents.findMany({ where: eq(s.lessonEvents.studentId, sid), orderBy: asc(s.lessonEvents.createdAt) }),
      dbh.query.lessonReports.findMany({ where: eq(s.lessonReports.studentId, sid) }),
      dbh.query.learningInference.findMany({ where: eq(s.learningInference.studentId, sid) }),
      dbh.query.learningRecommendation.findMany({ where: eq(s.learningRecommendation.studentId, sid) }),
      dbh.query.learningSnapshots.findMany({ where: eq(s.learningSnapshots.studentId, sid), orderBy: asc(s.learningSnapshots.snapshotVersion) }),
    ]);
  return {
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    exported_by_user_id: access.userId,
    student,
    guardians: guardians.map((g) => ({ user_id: g.userId, role: g.role, accepted_at: g.acceptedAt, revoked_at: g.revokedAt })),
    consents,
    enrolments,
    objective_states: states,
    state_transitions: transitions,
    review_schedule: reviews,
    evidence,
    lessons,
    lesson_activities: activities,
    lesson_events: events,
    lesson_reports: reports,
    inferences,
    recommendations,
    snapshots,
  };
}
