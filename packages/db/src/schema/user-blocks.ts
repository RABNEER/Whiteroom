import { pgTable, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const userBlocks = pgTable(
  "user_blocks",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id), // The user performing the block
    blockedUserId: text("blocked_user_id")
      .notNull()
      .references(() => users.id), // The user being blocked
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("user_blocks_tenant_user_idx").on(table.tenantId, table.userId),
    unique("user_blocks_unique_block").on(table.userId, table.blockedUserId),
  ]
);
