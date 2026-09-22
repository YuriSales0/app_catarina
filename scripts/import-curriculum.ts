import { loadScriptEnv } from "./_env";
loadScriptEnv();
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { createDb } from "@/lib/db/create-db";
import * as s from "@/lib/db/schema";
import { parseCurriculumYaml } from "@/lib/curriculum/parse";
import { importValidatedCurriculum } from "@/lib/curriculum/import";

/**
 * Usage: pnpm curriculum:import <file.yaml> [--publish] [--owner <email>] [--demo]
 * Without --owner the curriculum is system-owned (catalogue).
 */
async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("usage: import-curriculum <file.yaml> [--publish] [--owner email] [--demo]");
  const publish = args.includes("--publish");
  const demo = args.includes("--demo");
  const ownerIdx = args.indexOf("--owner");
  const ownerEmail = ownerIdx >= 0 ? args[ownerIdx + 1]?.toLowerCase() : null;

  const text = readFileSync(file, "utf8");
  const outcome = parseCurriculumYaml(text);
  if (!outcome.ok) {
    console.error(`INVALID ${file}:\n- ` + outcome.errors.join("\n- "));
    process.exit(1);
  }
  const dbh = createDb(process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL!, 1);
  try {
    let ownerUserId: string | null = null;
    if (ownerEmail) {
      const user = await dbh.query.users.findFirst({ where: sql`lower(${s.users.email}) = ${ownerEmail}` });
      if (!user) throw new Error(`no user with email ${ownerEmail}`);
      ownerUserId = user.id;
    }
    const result = await dbh.transaction((tx) =>
      importValidatedCurriculum(tx, outcome.value, {
        ownerUserId,
        publish,
        isDemo: demo || undefined,
        provenance: { origin: "cli", file },
        rawText: text,
      }),
    );
    const version = await dbh.query.curriculumVersions.findFirst({ where: eq(s.curriculumVersions.id, result.curriculumVersionId) });
    console.log(JSON.stringify({ ...result, publishedAt: version?.publishedAt ?? null }, null, 2));
    if (result.warnings.length) console.warn("warnings:\n- " + result.warnings.join("\n- "));
  } finally {
    await dbh.$client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
