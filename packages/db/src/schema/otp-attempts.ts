import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";

export const otpAttempts = pgTable(
  "otp_attempts",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    phoneHash: text("phone_hash").notNull(),
    otp: text("otp").notNull(), // SHA-256 hash of the OTP
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verified: boolean("verified").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("otp_attempts_phone_hash_created_at_idx").on(
      table.phoneHash,
      table.createdAt
    ),
  ]
);
