import { pgTable, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    roomId: text("room_id").notNull(), // class_id (for group/channel) or dm_room_id
    roomType: text("room_type").notNull(), // 'classroom' | 'teacher_channel' | 'direct_message'
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(), // AES-256-GCM encrypted string for direct_message
    attachments: jsonb("attachments").$type<{
      type: "image" | "video" | "document";
      url: string;
      name: string;
      size: number;
    }[]>(),
    isPinned: boolean("is_pinned").default(false).notNull(),
    mentions: jsonb("mentions").$type<string[]>(), // Array of user IDs
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("messages_tenant_room_idx").on(table.tenantId, table.roomId),
    index("messages_created_at_idx").on(table.createdAt),
  ]
);
