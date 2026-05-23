import { pgTable, text, timestamp, uuid, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const registrationTokens = pgTable(
  "registration_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    firebaseUid: text("firebase_uid").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("registration_tokens_phone_idx").on(table.phone),
    index("registration_tokens_id_idx").on(table.id),
    check("registration_tokens_expires_at_check", sql`${table.expiresAt} > now()`),
  ]
);
