import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { classes } from "./classes.js";
import { students } from "./students.js";

export const classEnrollments = pgTable(
  "class_enrollments",
  {
    classId: text("class_id")
      .notNull()
      .references(() => classes.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.classId, table.studentId] }),
  ]
);
