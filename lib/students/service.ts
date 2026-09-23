import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import { requireStudentAccess, type StudentAccess } from "@/lib/authorization/access";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/authorization/errors";
import type { Actor } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/write";
import type { CreateStudentInput, UpdateStudentInput, AddGuardianInput, EnrolStudentInput } from "@/schemas/students";
import { generateSnapshot } from "@/lib/snapshots/generate";

export const CONSENT_POLICY_VERSION = "privacy.v1";

/** Creates the student, the creator's OWNER relationship and the processing consent atomically. */
export async function createStudent(actor: Actor, input: CreateStudentInput, dbh: DbOrTx = db()) {
  return dbh.transaction(async (tx) => {
    const [student] = await tx
      .insert(s.students)
      .values({
        createdByUserId: actor.userId,
        name: input.name,
        dateOfBirth: input.dateOfBirth ?? null,
        schoolYear: input.schoolYear ?? null,
        educationSystem: input.educationSystem ?? null,
        timezone: input.timezone,
      })
      .returning();
    await tx.insert(s.studentGuardians).values({ studentId: student.id, userId: actor.userId, role: "OWNER", acceptedAt: new Date() });
    await tx.insert(s.consents).values({ userId: actor.userId, studentId: student.id, kind: "PROCESSING", policyVersion: CONSENT_POLICY_VERSION });
    await writeAudit(tx, {
      actorUserId: actor.userId,
      actorType: "USER",
      action: "student.create",
      resourceType: "student",
      resourceId: student.id,
      studentId: student.id,
      result: "ALLOWED",
      requestId: actor.requestId,
    });
    return student;
  });
}

export async function getStudent(access: StudentAccess, dbh: DbOrTx = db()) {
  const row = await dbh.query.students.findFirst({ where: and(eq(s.students.id, access.studentId), isNull(s.students.deletedAt)) });
  if (!row) throw new NotFoundError();
  return row;
}

export async function updateStudent(access: StudentAccess, input: UpdateStudentInput, dbh: DbOrTx = db()) {
  const [row] = await dbh
    .update(s.students)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
      ...(input.schoolYear !== undefined ? { schoolYear: input.schoolYear } : {}),
      ...(input.educationSystem !== undefined ? { educationSystem: input.educationSystem } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    })
    .where(and(eq(s.students.id, access.studentId), isNull(s.students.deletedAt)))
    .returning();
  if (!row) throw new NotFoundError();
  return row;
}

/** Soft delete. A purge script hard-deletes after the grace period. */
export async function deleteStudent(access: StudentAccess, dbh: DbOrTx = db()) {
  await dbh.update(s.students).set({ deletedAt: new Date() }).where(eq(s.students.id, access.studentId));
}

export async function listGuardians(access: StudentAccess, dbh: DbOrTx = db()) {
  return dbh
    .select({
      id: s.studentGuardians.id,
      userId: s.users.id,
      name: s.users.name,
      email: s.users.email,
      role: s.studentGuardians.role,
      acceptedAt: s.studentGuardians.acceptedAt,
      revokedAt: s.studentGuardians.revokedAt,
    })
    .from(s.studentGuardians)
    .innerJoin(s.users, eq(s.users.id, s.studentGuardians.userId))
    .where(and(eq(s.studentGuardians.studentId, access.studentId), isNull(s.studentGuardians.revokedAt)))
    .orderBy(asc(s.studentGuardians.createdAt));
}

/** MVP form of sharing: the user must already have signed in once. No invitation email. */
export async function addGuardianByEmail(access: StudentAccess, input: AddGuardianInput, dbh: DbOrTx = db()) {
  if (access.role !== "OWNER") throw new NotFoundError();
  const email = input.email.toLowerCase();
  const user = await dbh.query.users.findFirst({ where: and(sql`lower(${s.users.email}) = ${email}`, isNull(s.users.deletedAt)) });
  if (!user) throw new ValidationError("No account exists for that email. Ask them to sign in once first.");
  if (user.id === access.userId) throw new ValidationError("You are already the owner.");
  const existing = await dbh.query.studentGuardians.findFirst({
    where: and(eq(s.studentGuardians.studentId, access.studentId), eq(s.studentGuardians.userId, user.id)),
  });
  return dbh.transaction(async (tx) => {
    if (existing) {
      if (!existing.revokedAt) throw new ConflictError("That person already has access.");
      await tx
        .update(s.studentGuardians)
        .set({ role: input.role, revokedAt: null, acceptedAt: new Date(), invitedByUserId: access.userId })
        .where(eq(s.studentGuardians.id, existing.id));
    } else {
      await tx.insert(s.studentGuardians).values({
        studentId: access.studentId,
        userId: user.id,
        role: input.role,
        invitedByUserId: access.userId,
        acceptedAt: new Date(),
      });
    }
    await writeAudit(tx, {
      actorUserId: access.userId,
      actorType: "USER",
      action: "student.guardian_add",
      resourceType: "student",
      resourceId: access.studentId,
      studentId: access.studentId,
      result: "ALLOWED",
      requestId: access.requestId,
      metadata: { grantedUserId: user.id, role: input.role },
    });
  });
}

export async function revokeGuardian(access: StudentAccess, guardianRowId: string, dbh: DbOrTx = db()) {
  if (access.role !== "OWNER") throw new NotFoundError();
  return dbh.transaction(async (tx) => {
    const row = await tx.query.studentGuardians.findFirst({
      where: and(eq(s.studentGuardians.id, guardianRowId), eq(s.studentGuardians.studentId, access.studentId)),
    });
    if (!row) throw new NotFoundError();
    if (row.role === "OWNER") throw new ValidationError("The owner cannot be revoked.");
    await tx.update(s.studentGuardians).set({ revokedAt: new Date() }).where(eq(s.studentGuardians.id, row.id));
    await writeAudit(tx, {
      actorUserId: access.userId,
      actorType: "USER",
      action: "student.guardian_revoke",
      resourceType: "student",
      resourceId: access.studentId,
      studentId: access.studentId,
      result: "ALLOWED",
      requestId: access.requestId,
      metadata: { revokedUserId: row.userId },
    });
  });
}

export async function listEnrolments(access: StudentAccess, dbh: DbOrTx = db()) {
  return dbh
    .select({
      id: s.studentSubjects.id,
      subjectId: s.subjects.id,
      subjectName: s.subjects.name,
      subjectSlug: s.subjects.slug,
      active: s.studentSubjects.active,
      curriculumVersionId: s.studentSubjects.curriculumVersionId,
      curriculumName: s.curricula.name,
      curriculumVersion: s.curriculumVersions.version,
      curriculumIsDemo: s.curricula.isDemo,
      instructionLanguage: s.studentSubjects.instructionLanguage,
      targetLanguage: s.studentSubjects.targetLanguage,
      targetLevel: s.studentSubjects.targetLevel,
      goal: s.studentSubjects.goal,
      plannedLessonMinutes: s.studentSubjects.plannedLessonMinutes,
      startedAt: s.studentSubjects.startedAt,
    })
    .from(s.studentSubjects)
    .innerJoin(s.subjects, eq(s.subjects.id, s.studentSubjects.subjectId))
    .leftJoin(s.curriculumVersions, eq(s.curriculumVersions.id, s.studentSubjects.curriculumVersionId))
    .leftJoin(s.curricula, eq(s.curricula.id, s.curriculumVersions.curriculumId))
    .where(eq(s.studentSubjects.studentId, access.studentId))
    .orderBy(asc(s.subjects.name));
}

export async function getEnrolment(access: StudentAccess, subjectId: string, dbh: DbOrTx = db()) {
  const rows = await listEnrolments(access, dbh);
  const row = rows.find((r) => r.subjectId === subjectId);
  if (!row) throw new NotFoundError();
  return row;
}

/** Enrols the student and pins a published curriculum version. Re-enrolling updates the pin. */
export async function enrolStudentInSubject(access: StudentAccess, input: EnrolStudentInput, dbh: DbOrTx = db()) {
  const [version] = await dbh
    .select({ id: s.curriculumVersions.id, status: s.curriculumVersions.status, subjectId: s.curricula.subjectId })
    .from(s.curriculumVersions)
    .innerJoin(s.curricula, eq(s.curricula.id, s.curriculumVersions.curriculumId))
    .where(eq(s.curriculumVersions.id, input.curriculumVersionId))
    .limit(1);
  if (!version) throw new NotFoundError();
  if (version.subjectId !== input.subjectId) throw new ValidationError("That curriculum is for a different subject.");
  if (version.status !== "PUBLISHED") throw new ValidationError("Only a published curriculum version can be used.");

  return dbh.transaction(async (tx) => {
    const existing = await tx.query.studentSubjects.findFirst({
      where: and(eq(s.studentSubjects.studentId, access.studentId), eq(s.studentSubjects.subjectId, input.subjectId)),
    });
    if (existing?.curriculumVersionId && existing.curriculumVersionId !== input.curriculumVersionId) {
      // Moving to another version is reversible in evidence terms only if the state before is frozen.
      await generateSnapshot(access, { scope: "STUDENT", trigger: "PRE_MIGRATION" }, tx);
    }
    const values = {
      curriculumVersionId: input.curriculumVersionId,
      active: true,
      instructionLanguage: input.instructionLanguage,
      targetLanguage: input.targetLanguage ?? null,
      targetLevel: input.targetLevel ?? null,
      goal: input.goal ?? null,
      plannedLessonMinutes: input.plannedLessonMinutes,
    };
    const row = existing
      ? (await tx.update(s.studentSubjects).set(values).where(eq(s.studentSubjects.id, existing.id)).returning())[0]
      : (await tx.insert(s.studentSubjects).values({ studentId: access.studentId, subjectId: input.subjectId, ...values }).returning())[0];
    await writeAudit(tx, {
      actorUserId: access.userId,
      actorType: "USER",
      action: existing ? "student.enrolment_update" : "student.enrol",
      resourceType: "student_subject",
      resourceId: row.id,
      studentId: access.studentId,
      result: "ALLOWED",
      requestId: access.requestId,
      metadata: { subjectId: input.subjectId, curriculumVersionId: input.curriculumVersionId, previousVersionId: existing?.curriculumVersionId ?? null },
    });
    return row;
  });
}

export async function setEnrolmentActive(access: StudentAccess, subjectId: string, active: boolean, dbh: DbOrTx = db()) {
  await dbh
    .update(s.studentSubjects)
    .set({ active })
    .where(and(eq(s.studentSubjects.studentId, access.studentId), eq(s.studentSubjects.subjectId, subjectId)));
}

export { requireStudentAccess };
