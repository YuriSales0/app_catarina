import type { GuardianRole } from "@/lib/db/enums";

export const CAPABILITIES = [
  "VIEW",
  "RUN_LESSON",
  "RECORD_EVIDENCE",
  "MANAGE_ENROLMENT",
  "EDIT_PROFILE",
  "MANAGE_GUARDIANS",
  "EXPORT",
  "DELETE",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** The permission matrix from the architecture proposal (03 §1). */
const MATRIX: Record<Capability, ReadonlySet<GuardianRole>> = {
  VIEW: new Set(["OWNER", "GUARDIAN", "TEACHER", "VIEWER"]),
  RUN_LESSON: new Set(["OWNER", "GUARDIAN", "TEACHER"]),
  RECORD_EVIDENCE: new Set(["OWNER", "GUARDIAN", "TEACHER"]),
  MANAGE_ENROLMENT: new Set(["OWNER", "GUARDIAN"]),
  EDIT_PROFILE: new Set(["OWNER", "GUARDIAN"]),
  MANAGE_GUARDIANS: new Set(["OWNER"]),
  EXPORT: new Set(["OWNER"]),
  DELETE: new Set(["OWNER"]),
};

export function roleAllows(role: GuardianRole, capability: Capability): boolean {
  return MATRIX[capability].has(role);
}

/** Capabilities whose ALLOWED outcome is also audited (sensitive actions). */
export const AUDITED_WHEN_ALLOWED: ReadonlySet<Capability> = new Set(["MANAGE_GUARDIANS", "EXPORT", "DELETE"]);
