import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { users } from "./users.js";
import { tenants } from "./tenants.js";

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull(), // 'absence' | 'reminder' | 'announcement'
  isRead: boolean("is_read").default(false).notNull(),
  fcmToken: text("fcm_token"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
