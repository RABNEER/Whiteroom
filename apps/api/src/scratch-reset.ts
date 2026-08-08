import { db } from "./lib/db.js";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Deleting whatsapp_bot_store rows...");
  await db.execute(sql`DELETE FROM whatsapp_bot_store`);
  console.log("Database reset complete!");
  process.exit(0);
}

run();
