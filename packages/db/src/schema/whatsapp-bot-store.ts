import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const whatsappBotStore = pgTable("whatsapp_bot_store", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
