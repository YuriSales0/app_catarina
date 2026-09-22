import { loadScriptEnv } from "./_env";
loadScriptEnv();
import { readdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { Pool } from "pg";

/**
 * CI gate. Fails on:
 * - drift between the TypeScript schema and the committed migrations
 * - a foreign key with no supporting index
 * - a student-scoped table missing its student_id column
 * - an append-only table with updated_at or deleted_at
 * - an append-only table with no protective trigger
 */
const APPEND_ONLY = [
  "learning_evidence",
  "lesson_events",
  "learning_snapshots",
  "student_objective_state_transition",
  "audit_log",
  "learning_inference",
];
const STUDENT_SCOPED = [
  "student_guardians",
  "consents",
  "student_subjects",
  "student_objective_state",
  "student_objective_state_transition",
  "student_objective_review",
  "learning_evidence",
  "lesson_events",
  "lessons",
  "lesson_activities",
  "lesson_reports",
  "learning_inference",
  "learning_recommendation",
  "learning_snapshots",
];

const failures: string[] = [];

function checkDrift() {
  const out = execSync("pnpm exec drizzle-kit generate --name drift_check_tmp", { encoding: "utf8" });
  const created = readdirSync("drizzle").filter((f) => f.includes("drift_check_tmp"));
  if (created.length > 0) {
    for (const f of created) {
      const sql = readFileSync(`drizzle/${f}`, "utf8").trim();
      execSync(`rm -f drizzle/${f}`);
      if (sql.length > 0) failures.push(`schema drift detected; drizzle-kit would generate:\n${sql}`);
    }
    // drizzle-kit also appended a journal entry and snapshot; restore them from git.
    execSync("git checkout -- drizzle/meta/_journal.json && git clean -fq drizzle/meta");
  } else if (!/No schema changes/i.test(out)) {
    failures.push(`unexpected drizzle-kit output: ${out}`);
  }
}

async function checkDatabase() {
  const url = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    // FKs without an index whose leading columns match.
    const fk = await pool.query<{ table: string; cols: string }>(`
      WITH fks AS (
        SELECT c.conrelid::regclass::text AS "table", c.conkey AS cols FROM pg_constraint c WHERE c.contype = 'f'
      ), idx AS (
        SELECT i.indrelid::regclass::text AS "table", i.indkey::int2[] AS cols FROM pg_index i
      )
      SELECT f."table", array_to_string(f.cols, ',') AS cols FROM fks f
      WHERE NOT EXISTS (
        SELECT 1 FROM idx WHERE idx."table" = f."table"
          AND idx.cols[0:array_length(f.cols,1)-1] = f.cols
      )`);
    for (const r of fk.rows) failures.push(`foreign key without supporting index: ${r.table} (${r.cols})`);

    const cols = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const byTable = new Map<string, Set<string>>();
    for (const r of cols.rows) {
      if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Set());
      byTable.get(r.table_name)!.add(r.column_name);
    }
    for (const t of STUDENT_SCOPED) {
      if (!byTable.get(t)?.has("student_id")) failures.push(`student-scoped table ${t} lacks student_id`);
    }
    for (const t of APPEND_ONLY) {
      const c = byTable.get(t);
      if (!c) { failures.push(`append-only table ${t} missing`); continue; }
      if (c.has("updated_at") || c.has("deleted_at")) failures.push(`append-only table ${t} has a mutability column`);
    }
    const trig = await pool.query<{ event_object_table: string }>(
      `SELECT DISTINCT event_object_table FROM information_schema.triggers WHERE trigger_name LIKE '%_append_only'`,
    );
    const protectedTables = new Set(trig.rows.map((r) => r.event_object_table));
    for (const t of APPEND_ONLY) if (!protectedTables.has(t)) failures.push(`append-only table ${t} has no trigger`);
  } finally {
    await pool.end();
  }
}

async function main() {
  checkDrift();
  await checkDatabase();
  if (failures.length) {
    console.error("schema verification FAILED:\n- " + failures.join("\n- "));
    process.exit(1);
  }
  console.log("schema verification passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
