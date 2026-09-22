import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { requireStudentAccess, listAccessibleStudents } from "@/lib/authorization/access";
import { NotFoundError } from "@/lib/authorization/errors";
import { asUserId } from "@/types/ids";
import type { Actor } from "@/lib/auth/session";

/** Proofs 1 and 7 of the brief: student isolation, and identity by users.id never email. */
describe("authorization", () => {
  const db = testDb();
  let parentA: Actor;
  let parentB: Actor;
  let viewer: Actor;
  let studentOfA = "";
  let studentOfB = "";

  beforeAll(async () => {
    await resetDatabase();
    const [a] = await db.insert(s.users).values({ email: "a@example.test", name: "A" }).returning();
    const [b] = await db.insert(s.users).values({ email: "b@example.test", name: "B" }).returning();
    const [v] = await db.insert(s.users).values({ email: "v@example.test", name: "V" }).returning();
    parentA = { userId: asUserId(a.id), requestId: "req-a" };
    parentB = { userId: asUserId(b.id), requestId: "req-b" };
    viewer = { userId: asUserId(v.id), requestId: "req-v" };

    const [sa] = await db.insert(s.students).values({ createdByUserId: a.id, name: "Child A" }).returning();
    const [sb] = await db.insert(s.students).values({ createdByUserId: b.id, name: "Child B" }).returning();
    studentOfA = sa.id;
    studentOfB = sb.id;
    await db.insert(s.studentGuardians).values([
      { studentId: sa.id, userId: a.id, role: "OWNER", acceptedAt: new Date() },
      { studentId: sb.id, userId: b.id, role: "OWNER", acceptedAt: new Date() },
      { studentId: sa.id, userId: v.id, role: "VIEWER", acceptedAt: new Date() },
    ]);
  });
  afterAll(closeTestDb);

  it("grants the owner every capability on their own student", async () => {
    const access = await requireStudentAccess(parentA, studentOfA, "DELETE", db);
    expect(access.role).toBe("OWNER");
    expect(access.studentId).toBe(studentOfA);
  });

  it("parent A cannot access parent B's student, and the denial is indistinguishable from not-found", async () => {
    await expect(requireStudentAccess(parentA, studentOfB, "VIEW", db)).rejects.toBeInstanceOf(NotFoundError);
    await expect(requireStudentAccess(parentA, "00000000-0000-0000-0000-000000000000", "VIEW", db)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(requireStudentAccess(parentA, "not-a-uuid", "VIEW", db)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("records every denial in the audit log", async () => {
    const rows = await db.select().from(s.auditLog).where(eq(s.auditLog.result, "DENIED"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.some((r) => r.actorUserId === parentA.userId && r.studentId === studentOfB)).toBe(true);
  });

  it("applies the permission matrix: a VIEWER can view but not run lessons", async () => {
    await expect(requireStudentAccess(viewer, studentOfA, "VIEW", db)).resolves.toBeTruthy();
    await expect(requireStudentAccess(viewer, studentOfA, "RUN_LESSON", db)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a revoked guardian loses access immediately", async () => {
    await db
      .update(s.studentGuardians)
      .set({ revokedAt: new Date() })
      .where(eq(s.studentGuardians.userId, viewer.userId));
    await expect(requireStudentAccess(viewer, studentOfA, "VIEW", db)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a pending (unaccepted) invitation grants nothing", async () => {
    await db.insert(s.studentGuardians).values({ studentId: studentOfB, userId: parentA.userId, role: "GUARDIAN" });
    await expect(requireStudentAccess(parentA, studentOfB, "VIEW", db)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("created_by_user_id grants nothing by itself", async () => {
    const [orphan] = await db.insert(s.students).values({ createdByUserId: parentA.userId, name: "Orphan" }).returning();
    await expect(requireStudentAccess(parentA, orphan.id, "VIEW", db)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists only the students the actor may see", async () => {
    const list = await listAccessibleStudents(parentA, db);
    expect(list.map((x) => x.id)).toEqual([studentOfA]);
  });

  it("identity is users.id: changing the email preserves relationships and grants no new access", async () => {
    // Parent A takes over parent B's old email address. Nothing about access changes.
    await db.update(s.users).set({ email: "b-old@example.test" }).where(eq(s.users.id, parentB.userId));
    await db.update(s.users).set({ email: "b@example.test" }).where(eq(s.users.id, parentA.userId));
    await expect(requireStudentAccess(parentA, studentOfA, "VIEW", db)).resolves.toBeTruthy();
    await expect(requireStudentAccess(parentA, studentOfB, "VIEW", db)).rejects.toBeInstanceOf(NotFoundError);
    await expect(requireStudentAccess(parentB, studentOfB, "VIEW", db)).resolves.toBeTruthy();
  });

  it("enforces one active OWNER per student at the database", async () => {
    await expect(
      db.insert(s.studentGuardians).values({ studentId: studentOfA, userId: parentB.userId, role: "OWNER", acceptedAt: new Date() }),
    ).rejects.toThrow();
  });
});
