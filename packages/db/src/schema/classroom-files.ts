import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { classes } from "./classes.js";
import { users } from "./users.js";

export const classroomFiles = pgTable("classroom_files", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id),
  uploaderId: text("uploader_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull(), // 'pdf' | 'image' | 'video' | 'other'
  size: integer("size").notNull(), // in bytes
  category: text("category").default("General").notNull(), // folder/category e.g., 'Chapter 4'
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
