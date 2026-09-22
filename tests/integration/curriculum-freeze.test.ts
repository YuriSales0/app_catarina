import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb, expectDbRejection } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { newId } from "@/lib/ids";

describe("published curriculum versions are frozen", () => {
  const db = testDb();
  let versionId = "";
  let objectiveId = "";

  beforeAll(async () => {
    await resetDatabase();
    const [subject] = await db.insert(s.subjects).values({ slug: "maths", name: "Mathematics" }).returning();
    const [curriculum] = await db
      .insert(s.curricula)
      .values({ subjectId: subject.id, slug: "m", name: "M", source: "FAMILY" })
      .returning();
    const [version] = await db.insert(s.curriculumVersions).values({ curriculumId: curriculum.id, version: "1.0.0" }).returning();
    const [unit] = await db
      .insert(s.curriculumUnits)
      .values({ curriculumVersionId: version.id, unitKey: "U1", lineageId: newId(), name: "U1", sequence: 1 })
      .returning();
    const [objective] = await db
      .insert(s.learningObjectives)
      .values({ curriculumVersionId: version.id, curriculumUnitId: unit.id, objectiveKey: "O1", lineageId: newId(), code: "O1", title: "One", sequence: 1 })
      .returning();
    versionId = version.id;
    objectiveId = objective.id;
    await db.update(s.curriculumVersions).set({ status: "PUBLISHED", publishedAt: new Date() }).where(eq(s.curriculumVersions.id, versionId));
  });
  afterAll(closeTestDb);

  it("rejects editing an objective of a published version", async () => {
    await expectDbRejection(
      db.update(s.learningObjectives).set({ title: "Changed" }).where(eq(s.learningObjectives.id, objectiveId)),
      /frozen/,
    );
  });

  it("rejects adding an objective to a published version", async () => {
    const unit = await db.query.curriculumUnits.findFirst({ where: eq(s.curriculumUnits.curriculumVersionId, versionId) });
    await expectDbRejection(
      db.insert(s.learningObjectives).values({
        curriculumVersionId: versionId,
        curriculumUnitId: unit!.id,
        objectiveKey: "O2",
        lineageId: newId(),
        code: "O2",
        title: "Two",
        sequence: 2,
      }),
      /frozen/,
    );
  });

  it("rejects returning a published version to DRAFT", async () => {
    await expectDbRejection(
      db.update(s.curriculumVersions).set({ status: "DRAFT" }).where(eq(s.curriculumVersions.id, versionId)),
      /cannot return to DRAFT/,
    );
  });

  it("allows archiving", async () => {
    await db.update(s.curriculumVersions).set({ status: "ARCHIVED" }).where(eq(s.curriculumVersions.id, versionId));
    const v = await db.query.curriculumVersions.findFirst({ where: eq(s.curriculumVersions.id, versionId) });
    expect(v?.status).toBe("ARCHIVED");
  });
});
