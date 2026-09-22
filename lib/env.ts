import { z } from "zod";

/**
 * Every secret and configuration value the server reads, parsed once.
 * Nothing here is ever prefixed NEXT_PUBLIC_, and this module must never be
 * imported from a client component (enforced by ESLint boundaries).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Optional privileged connection string used only by scripts/migrate.ts. */
  DATABASE_MIGRATOR_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  AUTH_URL: z.string().url().optional(),
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
  /** Enables the development-only sign-in form. Refused in production. */
  AUTH_DEV_LOGIN: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  AI_PROVIDER: z.enum(["null", "openai"]).default("null"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production" && env.AUTH_DEV_LOGIN) {
    throw new Error("AUTH_DEV_LOGIN must not be enabled in production");
  }
  if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
    throw new Error("AI_PROVIDER=openai requires OPENAI_API_KEY");
  }
  cached = env;
  return env;
}

/** Test helper: forget the cached environment. */
export function resetEnvCache(): void {
  cached = null;
}
