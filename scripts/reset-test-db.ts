import { loadScriptEnv } from "./_env";
loadScriptEnv();
import { Pool } from "pg";

/** Empties every table. Refuses to run unless the database name ends in _test. */
async function main() {
  const url = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_MIGRATOR_URL required");
  if (!/_test(\?|$)/.test(url)) throw new Error("reset-test-db only runs against a database named *_test");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    if (rows.length) await pool.query(`TRUNCATE TABLE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    console.log(`reset ${rows.length} tables`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
