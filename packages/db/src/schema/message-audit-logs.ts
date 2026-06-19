import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const messageAuditLogs = pgTable(
  "message_audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    messageId: text("message_id").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(), // 'send' | 'delete' | 'pin' | 'unpin' | 'block' | 'mute'
    details: jsonb("details"), // metadata like message length, action context
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("message_audit_logs_tenant_idx").on(table.tenantId),
    index("message_audit_logs_created_at_idx").on(table.createdAt),
  ]
);
