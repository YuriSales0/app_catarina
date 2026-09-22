import { Pool } from "pg";
import { createDb, type Db } from "@/lib/db/create-db";

/**
 * Two handles: the runtime role (what the application uses, so privilege
 * guarantees are exercised) and the migrator role (for cleanup only).
 */
let appDb: Db | null = null;
let migratorPool: Pool | null = null;

export function testDb(): Db {
  if (!appDb) appDb = createDb(process.env.DATABASE_URL!, 3);
  return appDb;
}

export function migratorPoolHandle(): Pool {
  if (!migratorPool) migratorPool = new Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL!, max: 1 });
  return migratorPool;
}

const ALL_TABLES = [
  "learning_snapshots",
  "learning_recommendation",
  "learning_inference",
  "lesson_reports",
  "lesson_events",
  "learning_evidence",
  "lesson_activities",
  "lessons",
  "student_objective_review",
  "student_objective_state_transition",
  "student_objective_state",
  "objective_skills",
  "objective_prerequisites",
  "learning_objectives",
  "curriculum_units",
  "curriculum_versions",
  "curricula",
  "student_subjects",
  "skills",
  "subjects",
  "consents",
  "student_guardians",
  "students",
  "audit_log",
  "verification_tokens",
  "sessions",
  "accounts",
  "users",
];

/** TRUNCATE bypasses row-level triggers, so append-only tables can be reset. */
export async function resetDatabase() {
  const pool = migratorPoolHandle();
  await pool.query(`TRUNCATE TABLE ${ALL_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function closeTestDb() {
  if (appDb) { await appDb.$client.end(); appDb = null; }
  if (migratorPool) { await migratorPool.end(); migratorPool = null; }
}

/** Drizzle wraps driver errors as "Failed query: ..." with the pg error in `cause`. */
export function dbErrorMessage(err: unknown): string {
  const e = err as { message?: string; cause?: { message?: string } };
  return `${e?.cause?.message ?? ""} ${e?.message ?? ""}`;
}

export async function expectDbRejection(promise: Promise<unknown>, pattern: RegExp) {
  let caught: unknown = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  if (caught === null) throw new Error(`expected rejection matching ${pattern}, but the query succeeded`);
  const msg = dbErrorMessage(caught);
  if (!pattern.test(msg)) throw new Error(`expected error matching ${pattern}, got: ${msg}`);
}
