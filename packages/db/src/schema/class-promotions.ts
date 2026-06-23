import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const classPromotions = pgTable("class_promotions", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  academicYear: text("academic_year").notNull(), // e.g., "2026-2027"
  promotedBy: text("promoted_by")
    .notNull()
    .references(() => users.id),
  promotionRules: jsonb("promotion_rules").notNull(), // array of: { fromClassId: string, toClassId: string, fromClassName: string, toClassName: string }
  graduatingClassIds: jsonb("graduating_class_ids"), // array of class IDs
  studentsPromoted: integer("students_promoted").notNull(),
  studentsGraduated: integer("students_graduated").default(0).notNull(),
  promotionDate: timestamp("promotion_date", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
