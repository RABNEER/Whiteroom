import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { classes } from "./classes.js";
import { tenants } from "./tenants.js";

export const schedules = pgTable("schedules", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id),
  dayOfWeek: text("day_of_week").notNull(), // 'monday' | 'tuesday' | ...
  startTime: text("start_time").notNull(), // "16:00" (24hr format)
  endTime: text("end_time").notNull(), // "17:30"
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
