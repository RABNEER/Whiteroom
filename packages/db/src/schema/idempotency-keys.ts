import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    key: text("key").notNull(),
    scope: text("scope").notNull(),
    resourceId: text("resource_id").notNull(),
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_tenant_key_idx").on(table.tenantId, table.key),
  ]
);
