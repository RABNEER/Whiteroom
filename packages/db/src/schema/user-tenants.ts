import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { users } from "./users.js";
import { tenants } from "./tenants.js";

// FIX: Parents cannot join multiple tenants — breaks multi-school families
export const userTenants = pgTable("user_tenants", {
  id: text("id").primaryKey().$defaultFn(createId),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  role: text("role").notNull(), // 'teacher' | 'parent'
  status: text("status").default("active").notNull(), // 'active' | 'pending' | 'removed'
  activeTenant: boolean("active_tenant").default(false).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
