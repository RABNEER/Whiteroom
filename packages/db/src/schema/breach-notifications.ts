import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";

export const breachNotifications = pgTable(
  "breach_notifications",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tenantId: text("tenant_id")
      .references(() => tenants.id),
    incidentSummary: text("incident_summary").notNull(),
    remedialActions: text("remedial_actions").notNull(),
    affectedUserCount: integer("affected_user_count").notNull().default(0),
    notifiedAt: timestamp("notified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdById: text("created_by_id"),
  },
  (table) => [
    index("breach_notifications_tenant_idx").on(table.tenantId),
    index("breach_notifications_notified_at_idx").on(table.notifiedAt),
  ]
);
