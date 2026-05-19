import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";

export const reportsCache = pgTable(
  "reports_cache",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cacheKey: text("cache_key").notNull(),
    value: jsonb("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("reports_cache_tenant_key_idx").on(table.tenantId, table.cacheKey),
  ]
);
