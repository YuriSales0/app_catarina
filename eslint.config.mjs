import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Module boundaries, enforced rather than documented:
 * - app/** and components/** never import the database layer or env directly.
 * - lib/ai/** never imports the database or the learning engine (AI proposes, never writes).
 * - lib/learning/** and lib/lessons/engine never import lib/ai (no model on the decision path).
 */
const noDbFromUi = {
  patterns: [
    { group: ["@/lib/db/client", "@/lib/db/create-db", "@/lib/db/repositories/*"], message: "UI must go through lib/*/service modules, never the database." },
    { group: ["@/lib/env"], message: "Environment is server-only; read it inside a service." },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**", "playwright-report/**", "test-results/**"]),
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", noDbFromUi] },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    ignores: ["app/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/lib/db/client", "@/lib/db/create-db", "@/lib/db/repositories/*"], message: "Routes must call lib/*/service modules, never the database." },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/ai/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/lib/db/*", "@/lib/db", "@/lib/learning/*", "@/lib/lessons/*", "@/lib/authorization/*"], message: "AI providers return proposals; they never touch the database or the learning engine." },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/learning/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/lib/ai/*", "@/lib/ai"], message: "No AI provider on the learning-state or lesson-selection path." }] },
      ],
    },
  },
]);

export default eslintConfig;
