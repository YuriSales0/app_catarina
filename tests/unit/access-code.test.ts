import { describe, it, expect, afterEach } from "vitest";
import { checkAccessCode, parseAllowedEmails } from "@/lib/auth/access-code";
import { getEnv, resetEnvCache } from "@/lib/env";

const config = { code: "correct-horse-battery-staple-42", emails: ["parent@example.com"] };

describe("parseAllowedEmails", () => {
  it("splits on commas and whitespace, lowercases and drops non-emails", () => {
    expect(parseAllowedEmails(" Parent@Example.com, other@example.com\nnot-an-email ,")).toEqual([
      "parent@example.com",
      "other@example.com",
    ]);
  });
});

describe("checkAccessCode", () => {
  it("accepts an allowlisted email with the right code, normalising the email", () => {
    expect(checkAccessCode(config, "  PARENT@example.com ", config.code)).toBe("parent@example.com");
  });

  it("rejects the right code for an email outside the allowlist", () => {
    expect(checkAccessCode(config, "stranger@example.com", config.code)).toBeNull();
  });

  it("rejects a wrong, empty, or prefix code", () => {
    expect(checkAccessCode(config, "parent@example.com", "wrong")).toBeNull();
    expect(checkAccessCode(config, "parent@example.com", "")).toBeNull();
    expect(checkAccessCode(config, "parent@example.com", config.code.slice(0, -1))).toBeNull();
    expect(checkAccessCode(config, "parent@example.com", undefined)).toBeNull();
  });

  it("rejects a missing email", () => {
    expect(checkAccessCode(config, undefined, config.code)).toBeNull();
  });
});

describe("env: access code", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });

  it("requires an allowlist when a code is set", () => {
    process.env.AUTH_ACCESS_CODE = config.code;
    delete process.env.AUTH_ACCESS_EMAILS;
    resetEnvCache();
    expect(() => getEnv()).toThrow(/AUTH_ACCESS_EMAILS/);
  });

  it("refuses a short code", () => {
    process.env.AUTH_ACCESS_CODE = "short";
    process.env.AUTH_ACCESS_EMAILS = "parent@example.com";
    resetEnvCache();
    expect(() => getEnv()).toThrow(/AUTH_ACCESS_CODE/);
  });

  it("is allowed in production, unlike the dev login", () => {
    Object.assign(process.env, { NODE_ENV: "production", AUTH_DEV_LOGIN: "false" });
    process.env.AUTH_ACCESS_CODE = config.code;
    process.env.AUTH_ACCESS_EMAILS = "parent@example.com";
    resetEnvCache();
    expect(getEnv().AUTH_ACCESS_CODE).toBe(config.code);
  });
});
