import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import type { StudentAccess } from "@/lib/authorization/access";
import { NotFoundError, ValidationError } from "@/lib/authorization/errors";
import { roleAllows } from "@/lib/authorization/permissions";
import { writeAudit } from "@/lib/audit/write";
import { newPlacement, placementOf, type Placement } from "@/lib/learning/placement";
import { cancelLesson } from "./service";

/**
 * The family's answer to "where does this child start?", stored on the
 * enrolment. BEGINNER starts at the very first unit; TEST makes the next
 * lesson a level check; CHOSEN starts at the first unit of a track the family
 * picked; CONFIRM_SUGGESTED applies a level check's result.
 * Lessons planned for the old starting point are cancelled (their evidence,
 * if any, stays in the ledger). Owner or guardian; audited.
 */
export type StartingChoice = "BEGINNER" | "TEST" | "CHOSEN" | "CONFIRM_SUGGESTED";

export async function setStartingPoint(access: StudentAccess, subjectId: string, choice: StartingChoice, dbh: DbOrTx = db()): Promise<Placement> {
  if (!roleAllows(access.role, "MANAGE_ENROLMENT")) throw new NotFoundError();
  return dbh.transaction(async (tx) => {
    const enrolment = await tx.query.studentSubjects.findFirst({ where: and(eq(s.studentSubjects.studentId, access.studentId), eq(s.studentSubjects.subjectId, subjectId)) });
    if (!enrolment) throw new NotFoundError();
    const now = new Date();
    const current = placementOf(enrolment.metadata);
    let placement: Placement;
    if (choice === "CONFIRM_SUGGESTED") {
      if (current?.status !== "RESULT_READY" || !current.result) throw new ValidationError("Não há resultado de teste de nível para confirmar.");
      placement = { ...current, status: "SET", start_unit_key: current.result.suggested_start_unit_key, decided_at: now.toISOString() };
    } else {
      placement = newPlacement(choice, now);
    }
    await tx
      .update(s.studentSubjects)
      .set({ metadata: { ...(enrolment.metadata as Record<string, unknown>), placement } })
      .where(eq(s.studentSubjects.id, enrolment.id));

    const open = await tx.query.lessons.findMany({
      where: and(eq(s.lessons.studentId, access.studentId), eq(s.lessons.subjectId, subjectId), inArray(s.lessons.status, ["PLANNED", "IN_PROGRESS"])),
      columns: { id: true },
    });
    for (const l of open) await cancelLesson(access, l.id, tx);

    await writeAudit(tx, {
      actorUserId: access.userId,
      actorType: "USER",
      action: "student.starting_point",
      resourceType: "student_subject",
      resourceId: enrolment.id,
      studentId: access.studentId,
      result: "ALLOWED",
      requestId: access.requestId,
      metadata: { subjectId, choice, method: placement.method, status: placement.status, start_unit_key: placement.start_unit_key, cancelled_lessons: open.length },
    });
    return placement;
  });
}

/** The enrolment's current starting point, for display. */
export async function getStartingPoint(access: StudentAccess, subjectId: string, dbh: DbOrTx = db()): Promise<Placement | null> {
  const enrolment = await dbh.query.studentSubjects.findFirst({ where: and(eq(s.studentSubjects.studentId, access.studentId), eq(s.studentSubjects.subjectId, subjectId)) });
  return enrolment ? placementOf(enrolment.metadata) : null;
}
