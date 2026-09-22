import { loadScriptEnv } from "./_env";
loadScriptEnv();
import { createDb } from "@/lib/db/create-db";
import { rebuildAllState } from "@/lib/learning/rebuild";

/**
 * Recomputes every derived state and review row from the evidence ledger.
 * Default is a dry run that reports differences; --write applies them.
 * Transitions are history and are never re-inserted by a rebuild.
 */
async function main() {
  const write = process.argv.includes("--write");
  const dbh = createDb(process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL!, 1);
  try {
    const report = await rebuildAllState(dbh, { write });
    console.log(JSON.stringify(report, null, 2));
    if (!write && report.differences.length) process.exit(2);
  } finally {
    await dbh.$client.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
