import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
