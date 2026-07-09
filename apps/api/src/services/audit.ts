import { db } from "../lib/db.js";
import { auditLogs } from "@whiteroom/db";

export async function logAuditEvent(params: {
  tenantId: string;
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}) {
  try {
    await db.insert(auditLogs).values({
      tenantId: params.tenantId,
      actorId: params.actorId ?? null,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId ?? null,
      details: (params.details ?? null) as Record<string, unknown> | null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch {
    // fire-and-forget: audit logging must never break the main operation
  }
}
