import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { users } from "./users.js";
import { tenants } from "./tenants.js";

export const schoolAdmins = pgTable("school_admins", {
  id: text("id").primaryKey().$defaultFn(createId),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  designation: text("designation"), // e.g. "Principal", "Director"
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
