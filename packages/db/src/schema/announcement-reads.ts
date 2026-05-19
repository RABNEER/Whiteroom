import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { announcements } from "./announcements.js";
import { users } from "./users.js";

export const announcementReads = pgTable(
  "announcement_reads",
  {
    announcementId: text("announcement_id")
      .notNull()
      .references(() => announcements.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    readAt: timestamp("read_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.announcementId, table.userId] }),
  ]
);
