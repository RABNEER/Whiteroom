import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { classes } from "./classes.js";
import { users } from "./users.js";

export const fileUploadSessions = pgTable("file_upload_sessions", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id),
  uploaderId: text("uploader_id")
    .notNull()
    .references(() => users.id),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  category: text("category").default("General").notNull(),
  checksum: text("checksum").notNull(), // client-provided SHA-256
  status: text("status").default("pending").notNull(), // 'pending' | 'assembling' | 'completed' | 'failed'
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
