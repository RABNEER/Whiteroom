import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";
import { messages } from "./messages.js";

export const messageReceipts = pgTable(
  "message_receipts",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    readAt: timestamp("read_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("message_receipts_tenant_message_idx").on(table.tenantId, table.messageId),
    index("message_receipts_user_read_idx").on(table.userId),
  ]
);
