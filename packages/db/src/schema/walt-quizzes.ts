import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { classes } from "./classes.js";

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
}

export const waltQuizzes = pgTable("walt_quizzes", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id),
  title: text("title").notNull(),
  questions: jsonb("questions").$type<QuizQuestion[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
