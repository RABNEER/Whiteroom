import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { fileUploadSessions } from "./file-upload-sessions.js";

export const fileUploadChunks = pgTable("file_upload_chunks", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sessionId: text("session_id")
    .notNull()
    .references(() => fileUploadSessions.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  chunkSize: integer("chunk_size").notNull(),
  storagePath: text("storage_path").notNull(), // temporary S3/R2 location of the chunk
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
