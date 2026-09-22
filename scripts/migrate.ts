import { loadScriptEnv } from "./_env";
loadScriptEnv();
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "@/lib/db/create-db";

async function main() {
  const url = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_MIGRATOR_URL or DATABASE_URL is required");
  const db = createDb(url, 1);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
