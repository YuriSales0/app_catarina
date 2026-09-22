import { config } from "dotenv";
import { existsSync } from "node:fs";

/** Loads .env.test when NODE_ENV=test, otherwise .env.local then .env. */
export function loadScriptEnv() {
  const files = process.env.NODE_ENV === "test" ? [".env.test"] : [".env.local", ".env"];
  for (const f of files) if (existsSync(f)) config({ path: f, override: false, quiet: true });
}
