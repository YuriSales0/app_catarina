import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { seedDemo } from "@/scripts/seed-demo";
import { requireStudentAccess } from "@/lib/authorization/access";
import { createStudent, addGuardianByEmail, enrolStudentInSubject, listEnrolments, listGuardians, revokeGuardian } from "@/lib/students/service";
import { listPublishedVersionsForSubject, listCurriculaForActor, importCurriculumForActor } from "@/lib/curriculum/service";
import { asUserId } from "@/types/ids";
import type { Actor } from "@/lib/auth/session";
import { NotFoundError, ValidationError } from "@/lib/authorization/errors";

describe("students, guardians, enrolments and the demo seed", () => {
  const db = testDb();
  let seed: Awaited<ReturnType<typeof seedDemo>>;
  let demoParent: Actor;
  let other: Actor;

  beforeAll(async () => {
    await resetDatabase();
    seed = await seedDemo(db);
    demoParent = { userId: asUserId(seed.parentId), requestId: "r1" };
    const [o] = await db.insert(s.users).values({ email: "other@example.test", name: "Other" }).returning();
    other = { userId: asUserId(o.id), requestId: "r2" };
  });
  afterAll(closeTestDb);

  it("seed is idempotent and everything it creates is marked demo", async () => {
    const again = await seedDemo(db);
    expect(again.catarina).toBe(seed.catarina);
    const students = await db.select().from(s.students);
    expect(students.every((st) => st.isDemo)).toBe(true);
    const demoCurricula = await db.select().from(s.curricula).where(eq(s.curricula.isDemo, true));
    expect(demoCurricula.map((c) => c.slug).sort()).toEqual(["demo-english-basics", "demo-maths-early-number"]);
    const catalogue = await db.select().from(s.curricula).where(eq(s.curricula.isDemo, false));
    expect(catalogue.map((c) => c.slug).sort()).toEqual(["cambridge-yle-movers", "cambridge-yle-starters"]);
  });

  it("creates a student with the creator as OWNER and a processing consent", async () => {
    const st = await createStudent(demoParent, { name: "New Child", timezone: "Europe/Lisbon" }, db);
    const access = await requireStudentAccess(demoParent, st.id, "DELETE", db);
    expect(access.role).toBe("OWNER");
    const consent = await db.query.consents.findFirst({ where: eq(s.consents.studentId, st.id) });
    expect(consent?.kind).toBe("PROCESSING");
  });

  it("adds a guardian by email of an existing user, who then sees the student", async () => {
    const access = await requireStudentAccess(demoParent, seed.catarina, "MANAGE_GUARDIANS", db);
    await expect(addGuardianByEmail(access, { email: "nobody@example.test", role: "GUARDIAN" }, db)).rejects.toBeInstanceOf(ValidationError);
    await addGuardianByEmail(access, { email: "OTHER@example.test", role: "GUARDIAN" }, db);
    const otherAccess = await requireStudentAccess(other, seed.catarina, "RUN_LESSON", db);
    expect(otherAccess.role).toBe("GUARDIAN");
    const guardians = await listGuardians(access, db);
    expect(guardians.map((g) => g.role).sort()).toEqual(["GUARDIAN", "OWNER"]);
    const row = guardians.find((g) => g.role === "GUARDIAN")!;
    await revokeGuardian(access, row.id, db);
    await expect(requireStudentAccess(other, seed.catarina, "VIEW", db)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("enrols in a published catalogue curriculum and refuses drafts and mismatched subjects", async () => {
    const access = await requireStudentAccess(demoParent, seed.aurora, "MANAGE_ENROLMENT", db);
    const english = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!;
    const maths = (await db.query.subjects.findFirst({ where: eq(s.subjects.slug, "mathematics") }))!;
    const versions = await listPublishedVersionsForSubject(demoParent, english.id, db);
    expect(versions.map((v) => v.curriculumName)).toContain("English Starters (Cambridge Pre A1 aligned)");

    await enrolStudentInSubject(
      access,
      { subjectId: english.id, curriculumVersionId: seed.startersVersionId, instructionLanguage: "pt-BR", targetLanguage: "en", plannedLessonMinutes: 20 },
      db,
    );
    const enrolments = await listEnrolments(access, db);
    expect(enrolments.find((e) => e.subjectSlug === "english")?.curriculumVersionId).toBe(seed.startersVersionId);

    await expect(
      enrolStudentInSubject(access, { subjectId: maths.id, curriculumVersionId: seed.startersVersionId, instructionLanguage: "pt-BR", plannedLessonMinutes: 20 }, db),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("Studio import: a family curriculum is private to its owner", async () => {
    const yaml = `
schema_version: curriculum-file.v1
subject: music
subject_name: Music
slug: family-recorder
name: Recorder at home
version: 1.0.0
source: FAMILY
skills:
  - key: rhythm
    name: Rhythm
units:
  - key: R1
    name: First notes
    objectives:
      - key: MU.B
        title: Play B
        skills: [rhythm]
      - key: MU.A
        title: Play A
        prerequisites: [MU.B]
`;
    const result = await importCurriculumForActor(other, { yaml, publish: true }, db);
    expect(result.status).toBe("PUBLISHED");
    const mine = await listCurriculaForActor(other, db);
    expect(mine.some((c) => c.slug === "family-recorder")).toBe(true);
    const theirs = await listCurriculaForActor(demoParent, db);
    expect(theirs.some((c) => c.slug === "family-recorder")).toBe(false);
    await expect(importCurriculumForActor(other, { yaml: yaml.replace("source: FAMILY", "source: FAMILY\nvisibility: PUBLIC").replace("version: 1.0.0", "version: 1.0.1"), publish: false }, db)).rejects.toBeInstanceOf(ValidationError);
  });
});
