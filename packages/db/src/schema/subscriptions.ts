import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id),
  plan: text("plan").notNull().default("free"), // 'free' | 'pro'
  planType: text("plan_type").default("tuition").notNull(), // 'tuition' | 'school'
  waltAiEnabled: boolean("walt_ai_enabled").default(false).notNull(),
  creditsBalance: integer("credits_balance").default(100).notNull(), // Prepaid credits (1 credit = ₹5 = 1 student/month)
  calculatedMonthlyAmount: integer("calculated_monthly_amount").default(0).notNull(), // in paise
  billingCycleStartDate: timestamp("billing_cycle_start_date", { withTimezone: true }),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
