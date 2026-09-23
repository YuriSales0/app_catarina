import { loadScriptEnv } from "./_env";
loadScriptEnv();
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import { parseCurriculumYaml } from "@/lib/curriculum/parse";
import { importValidatedCurriculum } from "@/lib/curriculum/import";

/**
 * Deploy step, run by the Vercel build before `next build` (see vercel.json).
 * Applies pending migrations and loads the public curriculum catalogue, both
 * idempotently, using the privileged migrator connection. Runs only on
 * production builds; previews and local builds skip it.
 */
const CATALOGUE = ["curricula/english-starters.yaml", "curricula/english-movers.yaml"];

async function main() {
  const url = process.env.DATABASE_MIGRATOR_URL;
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production") {
    console.log(`deploy-migrate: skipped on ${vercelEnv} build`);
    return;
  }
  if (!url) {
    console.log("deploy-migrate: DATABASE_MIGRATOR_URL not set, skipped");
    return;
  }
  const db = createDb(url, 1);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("deploy-migrate: migrations applied");
    for (const file of CATALOGUE) {
      const text = readFileSync(file, "utf8");
      const outcome = parseCurriculumYaml(text);
      if (!outcome.ok) throw new Error(`${file} invalid:\n${outcome.errors.join("\n")}`);
      const f = outcome.value.file;
      const subject = await db.query.subjects.findFirst({ where: eq(s.subjects.slug, f.subject) });
      const curriculum = subject
        ? await db.query.curricula.findFirst({ where: and(eq(s.curricula.subjectId, subject.id), eq(s.curricula.slug, f.slug)) })
        : undefined;
      const existing = curriculum
        ? await db.query.curriculumVersions.findFirst({
            where: and(eq(s.curriculumVersions.curriculumId, curriculum.id), eq(s.curriculumVersions.version, f.version)),
          })
        : undefined;
      if (existing) {
        console.log(`deploy-migrate: ${f.slug} v${f.version} already present`);
        continue;
      }
      const result = await db.transaction((tx) =>
        importValidatedCurriculum(tx, outcome.value, { ownerUserId: null, publish: true, provenance: { origin: "deploy", file }, rawText: text }),
      );
      console.log(`deploy-migrate: imported ${f.slug} v${f.version} (${result.objectives} objectives)`);
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
