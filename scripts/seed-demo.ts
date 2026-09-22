import { loadScriptEnv } from "./_env";
loadScriptEnv();
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { createDb } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import { parseCurriculumYaml } from "@/lib/curriculum/parse";
import { importValidatedCurriculum } from "@/lib/curriculum/import";
import { CONSENT_POLICY_VERSION } from "@/lib/students/service";

/**
 * Idempotent demo seed. Everything it creates is marked is_demo = true.
 * Also loads the public catalogue curricula (not demo). Never runs
 * automatically against production.
 */
export const DEMO_PARENT_EMAIL = "demo.parent@learning-os.local";

async function importFile(dbh: ReturnType<typeof createDb>, file: string, opts: { demo: boolean }) {
  const text = readFileSync(file, "utf8");
  const outcome = parseCurriculumYaml(text);
  if (!outcome.ok) throw new Error(`${file} invalid:\n${outcome.errors.join("\n")}`);
  const { file: f } = outcome.value;
  const subject = await dbh.query.subjects.findFirst({ where: eq(s.subjects.slug, f.subject) });
  if (subject) {
    const curriculum = await dbh.query.curricula.findFirst({ where: and(eq(s.curricula.subjectId, subject.id), eq(s.curricula.slug, f.slug)) });
    if (curriculum) {
      const existing = await dbh.query.curriculumVersions.findFirst({
        where: and(eq(s.curriculumVersions.curriculumId, curriculum.id), eq(s.curriculumVersions.version, f.version)),
      });
      if (existing) return existing.id;
    }
  }
  const result = await dbh.transaction((tx) =>
    importValidatedCurriculum(tx, outcome.value, {
      ownerUserId: null,
      publish: true,
      isDemo: opts.demo,
      provenance: { origin: "seed", file },
      rawText: text,
    }),
  );
  return result.curriculumVersionId;
}

export async function seedDemo(dbh: ReturnType<typeof createDb>) {
  // Catalogue (real, public).
  const startersVersionId = await importFile(dbh, "curricula/english-starters.yaml", { demo: false });
  await importFile(dbh, "curricula/english-movers.yaml", { demo: false });
  // Demo curricula.
  const demoEnglishVersionId = await importFile(dbh, "curricula/demo-english.yaml", { demo: true });
  const demoMathsVersionId = await importFile(dbh, "curricula/demo-mathematics.yaml", { demo: true });

  let parent = await dbh.query.users.findFirst({ where: sql`lower(${s.users.email}) = ${DEMO_PARENT_EMAIL}` });
  if (!parent) {
    [parent] = await dbh.insert(s.users).values({ email: DEMO_PARENT_EMAIL, name: "Demo Parent", emailVerified: new Date() }).returning();
  }

  const english = (await dbh.query.subjects.findFirst({ where: eq(s.subjects.slug, "english") }))!;
  const maths = (await dbh.query.subjects.findFirst({ where: eq(s.subjects.slug, "mathematics") }))!;

  async function ensureStudent(name: string, dob: string) {
    const existing = await dbh
      .select({ id: s.students.id })
      .from(s.students)
      .innerJoin(s.studentGuardians, eq(s.studentGuardians.studentId, s.students.id))
      .where(and(eq(s.students.name, name), eq(s.students.isDemo, true), eq(s.studentGuardians.userId, parent!.id)))
      .limit(1);
    if (existing[0]) return existing[0].id;
    const [student] = await dbh
      .insert(s.students)
      .values({ createdByUserId: parent!.id, name, dateOfBirth: dob, timezone: "Europe/Lisbon", isDemo: true, schoolYear: "Year 2" })
      .returning();
    await dbh.insert(s.studentGuardians).values({ studentId: student.id, userId: parent!.id, role: "OWNER", acceptedAt: new Date() });
    await dbh.insert(s.consents).values({ userId: parent!.id, studentId: student.id, kind: "PROCESSING", policyVersion: CONSENT_POLICY_VERSION });
    return student.id;
  }

  async function ensureEnrolment(studentId: string, subjectId: string, versionId: string, targetLanguage: string | null) {
    const existing = await dbh.query.studentSubjects.findFirst({
      where: and(eq(s.studentSubjects.studentId, studentId), eq(s.studentSubjects.subjectId, subjectId)),
    });
    if (existing) return existing.id;
    const [row] = await dbh
      .insert(s.studentSubjects)
      .values({
        studentId,
        subjectId,
        curriculumVersionId: versionId,
        instructionLanguage: "pt-BR",
        targetLanguage,
        plannedLessonMinutes: 20,
        isDemo: true,
      })
      .returning();
    return row.id;
  }

  const catarina = await ensureStudent("Catarina", "2019-03-14");
  const aurora = await ensureStudent("Aurora", "2021-08-02");
  await ensureEnrolment(catarina, english.id, demoEnglishVersionId, "en");
  await ensureEnrolment(catarina, maths.id, demoMathsVersionId, null);
  await ensureEnrolment(aurora, english.id, demoEnglishVersionId, "en");

  return { parentId: parent.id, catarina, aurora, startersVersionId, demoEnglishVersionId, demoMathsVersionId };
}

if (process.argv[1]?.endsWith("seed-demo.ts")) {
  const dbh = createDb(process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL!, 1);
  seedDemo(dbh)
    .then((r) => {
      console.log("demo seed complete", r);
      return dbh.$client.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
