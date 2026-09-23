import { execSync } from "node:child_process";

/** Migrates and seeds the test database before the e2e server starts. */
export default function globalSetup() {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test" };
  execSync("pnpm db:migrate", { stdio: "inherit", env });
  execSync("pnpm db:reset-test", { stdio: "inherit", env });
  execSync("pnpm db:seed", { stdio: "inherit", env });
}
