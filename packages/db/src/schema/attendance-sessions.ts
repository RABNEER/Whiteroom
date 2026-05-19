import { pgTable, text, timestamp, date, integer } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { classes } from "./classes.js";
import { tenants } from "./tenants.js";

export const attendanceSessions = pgTable("attendance_sessions", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id),
  date: date("date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("live"), // 'live' | 'done'
  totalPresent: integer("total_present").default(0),
  totalAbsent: integer("total_absent").default(0),
  totalStudents: integer("total_students").default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
