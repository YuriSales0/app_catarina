import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import { studentGuardians, students } from "@/lib/db/schema";
import type { GuardianRole } from "@/lib/db/enums";
import { metric } from "@/lib/logging/logger";
import { writeAudit } from "@/lib/audit/write";
import { NotFoundError } from "./errors";
import { roleAllows, AUDITED_WHEN_ALLOWED, type Capability } from "./permissions";
import type { StudentId, UserId } from "@/types/ids";
import { asStudentId } from "@/types/ids";
import type { Actor } from "@/lib/auth/session";

declare const accessBrand: unique symbol;

/**
 * Proof that `userId` holds a sufficient role on `studentId`. The brand is not
 * exported, so a value of this type can only come from requireStudentAccess.
 * Every repository function that reads or writes student data takes one and
 * derives the student id from it, never from a caller-supplied argument.
 */
export type StudentAccess = {
  readonly studentId: StudentId;
  readonly userId: UserId;
  readonly role: GuardianRole;
  readonly requestId: string;
  readonly [accessBrand]: true;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveRole(dbh: DbOrTx, userId: UserId, studentId: string): Promise<GuardianRole | null> {
  const rows = await dbh
    .select({ role: studentGuardians.role })
    .from(studentGuardians)
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .where(
      and(
        eq(studentGuardians.studentId, studentId),
        eq(studentGuardians.userId, userId),
        isNotNull(studentGuardians.acceptedAt),
        isNull(studentGuardians.revokedAt),
        isNull(students.deletedAt),
      ),
    )
    .limit(1);
  return rows[0]?.role ?? null;
}

/**
 * The single authorization question in the system.
 * Throws NotFoundError (never Forbidden) when the actor may not perform the
 * capability, so existence is not revealed. Denials are always audited.
 */
export async function requireStudentAccess(
  actor: Actor,
  studentId: string,
  capability: Capability,
  dbh: DbOrTx = db(),
): Promise<StudentAccess> {
  if (!UUID_RE.test(studentId)) throw new NotFoundError();

  const role = await resolveRole(dbh, actor.userId, studentId);
  const allowed = role !== null && roleAllows(role, capability);

  if (!allowed) {
    metric("authz_denied", { userId: actor.userId, capability, requestId: actor.requestId });
    await writeAudit(dbh, {
      actorUserId: actor.userId,
      actorType: "USER",
      action: `student.${capability.toLowerCase()}`,
      resourceType: "student",
      resourceId: studentId,
      studentId,
      result: "DENIED",
      reason: role === null ? "no_guardian_relationship" : `role_${role}_insufficient`,
      requestId: actor.requestId,
    });
    throw new NotFoundError();
  }

  if (AUDITED_WHEN_ALLOWED.has(capability)) {
    await writeAudit(dbh, {
      actorUserId: actor.userId,
      actorType: "USER",
      action: `student.${capability.toLowerCase()}`,
      resourceType: "student",
      resourceId: studentId,
      studentId,
      result: "ALLOWED",
      requestId: actor.requestId,
    });
  }

  return {
    studentId: asStudentId(studentId),
    userId: actor.userId,
    role: role as GuardianRole,
    requestId: actor.requestId,
  } as StudentAccess;
}

/** Students the actor may see, with their role. Used by the dashboard. */
export async function listAccessibleStudents(actor: Actor, dbh: DbOrTx = db()) {
  return dbh
    .select({
      id: students.id,
      name: students.name,
      dateOfBirth: students.dateOfBirth,
      timezone: students.timezone,
      isDemo: students.isDemo,
      role: studentGuardians.role,
    })
    .from(studentGuardians)
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .where(
      and(
        eq(studentGuardians.userId, actor.userId),
        isNotNull(studentGuardians.acceptedAt),
        isNull(studentGuardians.revokedAt),
        isNull(students.deletedAt),
      ),
    )
    .orderBy(students.name);
}
