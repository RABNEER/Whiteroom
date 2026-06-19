import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { classes } from "./classes.js";
import { users } from "./users.js";

export const bulletins = pgTable("bulletins", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  classId: text("class_id")
    .references(() => classes.id), // Null means school-wide broadcast
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull(), // 'FEES' | 'EXAM' | 'HOLIDAY' | 'GENERAL'
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
