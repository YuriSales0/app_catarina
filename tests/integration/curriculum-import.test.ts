import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { testDb, resetDatabase, closeTestDb } from "../helpers/db";
import * as s from "@/lib/db/schema";
import { parseCurriculumYaml } from "@/lib/curriculum/parse";
import { importValidatedCurriculum } from "@/lib/curriculum/import";
import { validateCurriculumObject } from "@/lib/curriculum/validate";

const baseFile = () => ({
  schema_version: "curriculum-file.v1",
  subject: "english",
  subject_name: "English",
  slug: "t-lineage",
  name: "Lineage test",
  version: "1.0.0",
  source: "FAMILY",
  skills: [{ key: "speaking", name: "Speaking" }],
  error_tags: { X: "x" },
  units: [
    {
      key: "U1",
      name: "One",
      objectives: [
        { key: "A", title: "A", skills: ["speaking"] },
        { key: "B", title: "B", prerequisites: ["A"], error_tags: ["X"] },
      ],
    },
    { key: "U2", name: "Two", objectives: [{ key: "C", title: "C", prerequisites: ["B"] }] },
  ],
});

describe("curriculum validation", () => {
  it("accepts every shipped curriculum file", () => {
    for (const f of ["english-starters", "english-movers", "demo-english", "demo-mathematics"]) {
      const r = parseCurriculumYaml(readFileSync(`curricula/${f}.yaml`, "utf8"));
      expect(r.ok, `${f}: ${!r.ok ? r.errors.join("; ") : ""}`).toBe(true);
    }
  });

  it("rejects a prerequisite cycle", () => {
    const f = baseFile();
    f.units[0].objectives[0] = { key: "A", title: "A", prerequisites: ["B"], skills: ["speaking"] } as never;
    const r = validateCurriculumObject(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/cycle|comes later/);
  });

  it("rejects a prerequisite that points to a later unit", () => {
    const f = baseFile();
    f.units[0].objectives[0] = { key: "A", title: "A", prerequisites: ["C"], skills: ["speaking"] } as never;
    const r = validateCurriculumObject(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/later unit/);
  });

  it("rejects unknown skills, tags, prerequisites and extra keys", () => {
    const f = baseFile() as Record<string, unknown>;
    (f.units as Array<{ objectives: unknown[] }>)[0].objectives.push({ key: "Z", title: "Z", skills: ["nope"], error_tags: ["NOPE"], prerequisites: ["GHOST"], bogus: 1 });
    const r = validateCurriculumObject(f);
    expect(r.ok).toBe(false);
  });
});

describe("curriculum import", () => {
  const db = testDb();
  beforeAll(resetDatabase);
  afterAll(closeTestDb);

  it("imports, publishes, and carries lineage ids across versions by key", async () => {
    const v1 = validateCurriculumObject(baseFile());
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    const r1 = await db.transaction((tx) => importValidatedCurriculum(tx, v1.value, { ownerUserId: null, publish: true }));
    expect(r1.status).toBe("PUBLISHED");
    expect(r1.objectives).toBe(3);
    expect(r1.prerequisites).toBe(2);
    expect(r1.lineage.newObjectives).toBe(3);

    // Version 1.1.0: rename B, drop C, add D.
    const f2 = baseFile();
    f2.version = "1.1.0";
    f2.units[0].objectives[1].title = "B renamed";
    f2.units[1].objectives = [{ key: "D", title: "D", prerequisites: ["B"] }];
    const v2 = validateCurriculumObject(f2);
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    const r2 = await db.transaction((tx) => importValidatedCurriculum(tx, v2.value, { ownerUserId: null, publish: false }));
    expect(r2.status).toBe("DRAFT");
    expect(r2.lineage).toEqual({ carriedUnits: 2, newUnits: 0, carriedObjectives: 2, newObjectives: 1 });

    const b1 = await db.query.learningObjectives.findFirst({
      where: (o, { and, eq }) => and(eq(o.curriculumVersionId, r1.curriculumVersionId), eq(o.objectiveKey, "B")),
    });
    const b2 = await db.query.learningObjectives.findFirst({
      where: (o, { and, eq }) => and(eq(o.curriculumVersionId, r2.curriculumVersionId), eq(o.objectiveKey, "B")),
    });
    expect(b1!.lineageId).toBe(b2!.lineageId);
    expect(b2!.title).toBe("B renamed");
  });

  it("refuses a duplicate version and a foreign owner", async () => {
    const v = validateCurriculumObject(baseFile());
    if (!v.ok) throw new Error("fixture");
    await expect(db.transaction((tx) => importValidatedCurriculum(tx, v.value, { ownerUserId: null, publish: false }))).rejects.toThrow(/already exists/);
    const [u] = await db.insert(s.users).values({ email: "x@example.test" }).returning();
    const f = baseFile();
    f.version = "9.9.9";
    const v9 = validateCurriculumObject(f);
    if (!v9.ok) throw new Error("fixture");
    await expect(db.transaction((tx) => importValidatedCurriculum(tx, v9.value, { ownerUserId: u.id, publish: false }))).rejects.toThrow(/owned by someone else/);
  });

  it("creates subjects and skills once and reuses them", async () => {
    const subjects = await db.select().from(s.subjects).where(eq(s.subjects.slug, "english"));
    expect(subjects).toHaveLength(1);
    const skills = await db.select().from(s.skills).where(eq(s.skills.subjectId, subjects[0].id));
    expect(skills.map((k) => k.slug)).toEqual(["speaking"]);
  });
});
