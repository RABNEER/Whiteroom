import { pgTable, text, integer, customType } from "drizzle-orm/pg-core";
import { createId } from "../utils.js";
import { tenants } from "./tenants.js";
import { classroomFiles } from "./classroom-files.js";

// Custom pgvector type for Drizzle
const vector1536 = customType<{ data: number[] }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === "string") {
      return value.slice(1, -1).split(",").map(Number);
    }
    return value as number[];
  },
});

export const classroomFileChunks = pgTable("classroom_file_chunks", {
  id: text("id").primaryKey().$defaultFn(createId),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  fileId: text("file_id")
    .notNull()
    .references(() => classroomFiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  pageNumber: integer("page_number").notNull(),
  embedding: vector1536("embedding").notNull(),
});
