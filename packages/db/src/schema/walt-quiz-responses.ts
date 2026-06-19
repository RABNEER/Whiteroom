import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { waltQuizzes } from "./walt-quizzes.js";
import { students } from "./students.js";

export const waltQuizResponses = pgTable("walt_quiz_responses", {
  id: text("id").primaryKey().$defaultFn(createId),
  quizId: text("quiz_id")
    .notNull()
    .references(() => waltQuizzes.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<number[]>().notNull(), // array of selected answer indices
  score: integer("score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
