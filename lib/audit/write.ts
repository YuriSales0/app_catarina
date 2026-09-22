import { auditLog } from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/create-db";
import type { ActorType, AuditResult } from "@/lib/db/enums";
import { createHash } from "node:crypto";

export type AuditEntry = {
  actorUserId?: string | null;
  actorType: ActorType;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  studentId?: string | null;
  result: AuditResult;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
};

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/** Append-only. Stores actions and resource ids, never payloads. */
export async function writeAudit(dbh: DbOrTx, entry: AuditEntry): Promise<void> {
  await dbh.insert(auditLog).values({
    actorUserId: entry.actorUserId ?? null,
    actorType: entry.actorType,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    studentId: entry.studentId ?? null,
    result: entry.result,
    reason: entry.reason ?? null,
    ipHash: hashIp(entry.ip),
    userAgent: entry.userAgent ?? null,
    requestId: entry.requestId ?? null,
    metadata: entry.metadata ?? {},
  });
}
