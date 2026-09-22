import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
