import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { attendanceSessions } from "./attendance-sessions.js";
import { students } from "./students.js";

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    sessionId: text("session_id")
      .notNull()
      .references(() => attendanceSessions.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    status: text("status").notNull(), // 'present' | 'absent' | 'late'
    markedAt: timestamp("marked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("attendance_session_student_idx").on(
      table.sessionId,
      table.studentId
    ),
  ]
);
