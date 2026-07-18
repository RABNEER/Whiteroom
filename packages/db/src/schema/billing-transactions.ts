import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";

export const billingTransactions = pgTable("billing_transactions", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  type: text("type").notNull(), // 'trial_grant' | 'recharge' | 'usage_deduction'
  amountPaise: integer("amount_paise").default(0).notNull(), // Actual money paid (if recharge)
  creditsChange: integer("credits_change").notNull(), // Positive for recharge/grant, negative for usage
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
