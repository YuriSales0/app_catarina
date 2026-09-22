import "server-only";
import { createDb, type Db } from "./create-db";
import { getEnv } from "@/lib/env";

let instance: Db | null = null;

/** The one database handle the application uses. Server-only. */
export function db(): Db {
  if (!instance) instance = createDb(getEnv().DATABASE_URL);
  return instance;
}

export type { Db, Tx } from "./create-db";
