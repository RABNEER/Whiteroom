import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";

export const whatsappSessions = pgTable(
  "whatsapp_sessions",
  {
    id: text("id").primaryKey(), // Generated manually as WH-XXXX
    token: text("token").notNull().$defaultFn(createId), // Secure random token
    phone: text("phone"), // Set once verified via webhook
    verified: boolean("verified").default(false).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("whatsapp_sessions_verified_expires_at_idx").on(
      table.verified,
      table.expiresAt
    ),
  ]
);
