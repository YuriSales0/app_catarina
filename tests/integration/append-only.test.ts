import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb, migratorPoolHandle, expectDbRejection } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { newId } from "@/lib/ids";

/** Proof 4 of the brief: historical evidence cannot be modified. */
describe("append-only ledger", () => {
  const db = testDb();
  let studentId = "";
  let subjectId = "";
  let objectiveId = "";
  let evidenceId = "";

  beforeAll(async () => {
    await resetDatabase();
    const [user] = await db.insert(s.users).values({ email: "owner@example.test", name: "Owner" }).returning();
    const [student] = await db
      .insert(s.students)
      .values({ createdByUserId: user.id, name: "Test Child", timezone: "Europe/Lisbon" })
      .returning();
    const [subject] = await db.insert(s.subjects).values({ slug: "english", name: "English" }).returning();
    const [curriculum] = await db
      .insert(s.curricula)
      .values({ subjectId: subject.id, slug: "t", name: "T", source: "FAMILY" })
      .returning();
    const [version] = await db
      .insert(s.curriculumVersions)
      .values({ curriculumId: curriculum.id, version: "1.0.0" })
      .returning();
    const [unit] = await db
      .insert(s.curriculumUnits)
      .values({ curriculumVersionId: version.id, unitKey: "U1", lineageId: newId(), name: "U1", sequence: 1 })
      .returning();
    const [objective] = await db
      .insert(s.learningObjectives)
      .values({
        curriculumVersionId: version.id,
        curriculumUnitId: unit.id,
        objectiveKey: "O1",
        lineageId: newId(),
        code: "O1",
        title: "Objective 1",
        sequence: 1,
      })
      .returning();
    studentId = student.id;
    subjectId = subject.id;
    objectiveId = objective.id;

    const [ev] = await db
      .insert(s.learningEvidence)
      .values({
        studentId,
        subjectId,
        objectiveId,
        objectiveLineageId: objective.lineageId,
        attemptNumber: 1,
        prompt: "Say: I have a cat",
        studentResponse: "I have a cat",
        result: "CORRECT",
        evidenceType: "PRACTICE",
        gradedBy: "HUMAN",
      })
      .returning();
    evidenceId = ev.id;
  });

  afterAll(closeTestDb);

  it("refuses UPDATE on learning_evidence through the runtime role", async () => {
    await expectDbRejection(
      db.update(s.learningEvidence).set({ result: "INCORRECT" }).where(eq(s.learningEvidence.id, evidenceId)),
      /permission denied|append-only/,
    );
  });

  it("refuses DELETE on learning_evidence through the runtime role", async () => {
    await expectDbRejection(
      db.delete(s.learningEvidence).where(eq(s.learningEvidence.id, evidenceId)),
      /permission denied|append-only/,
    );
  });

  it("refuses UPDATE and DELETE even for the privileged migrator role (trigger)", async () => {
    const pool = migratorPoolHandle();
    await expect(pool.query(`UPDATE learning_evidence SET result = 'INCORRECT' WHERE id = $1`, [evidenceId])).rejects.toThrow(
      /append-only/,
    );
    await expect(pool.query(`DELETE FROM learning_evidence WHERE id = $1`, [evidenceId])).rejects.toThrow(/append-only/);
  });

  it("still accepts a CORRECTION row that supersedes the original", async () => {
    const [corr] = await db
      .insert(s.learningEvidence)
      .values({
        studentId,
        subjectId,
        objectiveId,
        objectiveLineageId: (await db.query.learningObjectives.findFirst({ where: eq(s.learningObjectives.id, objectiveId) }))!
          .lineageId,
        attemptNumber: 2,
        prompt: "Say: I have a cat",
        studentResponse: "I have cat",
        result: "PARTIALLY_CORRECT",
        evidenceType: "CORRECTION",
        supersedesEvidenceId: evidenceId,
        gradedBy: "HUMAN",
      })
      .returning();
    expect(corr.supersedesEvidenceId).toBe(evidenceId);
    const original = await db.query.learningEvidence.findFirst({ where: eq(s.learningEvidence.id, evidenceId) });
    expect(original?.result).toBe("CORRECT");
  });

  it("rejects a CORRECTION without a supersedes pointer", async () => {
    await expectDbRejection(
      db.insert(s.learningEvidence).values({
        studentId,
        subjectId,
        objectiveId,
        objectiveLineageId: newId(),
        attemptNumber: 3,
        prompt: "x",
        result: "CORRECT",
        evidenceType: "RETRACTION",
        gradedBy: "HUMAN",
      }),
      /learning_evidence_correction_supersedes_ck/,
    );
  });

  it("refuses mutation of lesson_events, snapshots and transitions", async () => {
    const pool = migratorPoolHandle();
    for (const t of ["lesson_events", "learning_snapshots", "student_objective_state_transition", "audit_log", "learning_inference"]) {
      const trig = await pool.query(
        `SELECT DISTINCT trigger_name FROM information_schema.triggers WHERE event_object_table = $1 AND trigger_name = $2`,
        [t, `${t}_append_only`],
      );
      expect(trig.rowCount, `${t} trigger`).toBe(1);
    }
  });
});
