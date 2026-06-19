import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { bulletins } from "./bulletins.js";
import { users } from "./users.js";

export const bulletinReads = pgTable("bulletin_reads", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  bulletinId: text("bulletin_id")
    .notNull()
    .references(() => bulletins.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
