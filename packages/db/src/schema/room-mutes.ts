import { pgTable, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const roomMutes = pgTable(
  "room_mutes",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    roomId: text("room_id").notNull(),
    mutedUntil: timestamp("muted_until", { withTimezone: true }), // Null or expired means not muted
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("room_mutes_user_room_idx").on(table.userId, table.roomId),
    unique("room_mutes_unique_user_room").on(table.userId, table.roomId),
  ]
);
