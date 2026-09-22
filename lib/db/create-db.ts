import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Builds a Drizzle handle over node-postgres. Used by the server-only client,
 * by scripts and by integration tests, each with their own connection string.
 */
export function createDb(connectionString: string, max = 5) {
  const pool = new Pool({ connectionString, max });
  return drizzle(pool, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
