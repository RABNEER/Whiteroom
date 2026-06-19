import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color").default("#4F46E5"),
  inviteCode: text("invite_code").notNull().unique(),
  phone: text("phone").notNull(), // owner's phone
  isActive: boolean("is_active").default(true).notNull(),
  gdprAgreedAt: timestamp("gdpr_agreed_at", { withTimezone: true }),
  ferpaCompliant: boolean("ferpa_compliant").default(false).notNull(),
  
  // Public Profile / Trust Badges
  address: text("address"),
  contactEmail: text("contact_email"),
  publicSearch: boolean("public_search").default(false).notNull(),
  complianceBadges: jsonb("compliance_badges").$type<string[]>().default([]).notNull(),

  // Billing
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
