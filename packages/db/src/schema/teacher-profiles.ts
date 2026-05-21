import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { users } from "./users.js";
import { tenants } from "./tenants.js";

export const teacherProfiles = pgTable("teacher_profiles", {
  id: text("id").primaryKey().$defaultFn(createId),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  subject: text("subject"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
