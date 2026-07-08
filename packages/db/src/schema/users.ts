import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(createId),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  role: text("role").notNull(), // 'teacher' | 'parent' | 'school_admin' | 'super_admin'
  tenantId: text("tenant_id").references(() => tenants.id),
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
