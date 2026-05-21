import { pgTable, text, timestamp, boolean, index, integer } from "drizzle-orm/pg-core";
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

export const otpLockouts = pgTable(
  "otp_lockouts",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    phone: text("phone").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("otp_lockouts_phone_idx").on(table.phone),
  ]
);
