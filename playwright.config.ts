import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The sandbox pins a Chromium build; use it when present instead of downloading.
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
  webServer: {
    command: "pnpm exec next dev -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://learning_os_app:app@127.0.0.1:5433/learning_os_test",
      DATABASE_MIGRATOR_URL:
        process.env.DATABASE_MIGRATOR_URL ?? "postgres://learning_os_migrator:migrator@127.0.0.1:5433/learning_os_test",
      AUTH_SECRET: "e2e-secret-not-for-production-0123456789",
      AUTH_URL: "http://127.0.0.1:3100",
      AUTH_DEV_LOGIN: "true",
      AI_PROVIDER: "null",
      LOG_LEVEL: "warn",
    },
  },
});
