import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const dmRooms = pgTable(
  "dm_rooms",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    participant1Id: text("participant_1_id")
      .notNull()
      .references(() => users.id),
    participant2Id: text("participant_2_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("dm_rooms_tenant_id_idx").on(table.tenantId),
    index("dm_rooms_participants_idx").on(table.participant1Id, table.participant2Id),
  ]
);
