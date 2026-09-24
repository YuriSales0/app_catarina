import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Access-code sign-in: a shared secret plus an email allowlist, for evaluating
 * a deployment before an identity provider is configured. Unlike the dev login
 * it is allowed in production, because nobody outside the allowlist can use it
 * and the code is a long random secret held only in the environment.
 */
export type AccessCodeConfig = { code: string; emails: readonly string[] };

export function parseAllowedEmails(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Returns the normalised email when both the email and the code match, else null. */
export function checkAccessCode(config: AccessCodeConfig, emailInput: unknown, codeInput: unknown): string | null {
  const email = String(emailInput ?? "").trim().toLowerCase();
  const code = String(codeInput ?? "");
  // Always compare the code, so response timing does not reveal allowlisted emails.
  const codeOk = timingSafeEqual(digest(code), digest(config.code));
  if (!codeOk || !email || !config.emails.includes(email)) return null;
  return email;
}
