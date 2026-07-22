import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";

export const securityAuditLogs = pgTable(
  "security_audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tenantId: text("tenant_id")
      .references(() => tenants.id),
    userId: text("user_id"),
    eventType: text("event_type").notNull(), // e.g. 'UNAUTHORIZED_ACCESS', 'BRUTE_FORCE', 'CONTENT_GUARDRAIL_BLOCK', 'SUSPICIOUS_EXPORT'
    severity: text("severity").notNull().default("LOW"), // 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    ipAddress: text("ip_address"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("security_audit_logs_tenant_idx").on(table.tenantId),
    index("security_audit_logs_event_type_idx").on(table.eventType),
    index("security_audit_logs_severity_idx").on(table.severity),
    index("security_audit_logs_created_at_idx").on(table.createdAt),
  ]
);
