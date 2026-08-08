import { db } from "../apps/api/src/lib/db.js";
import { whatsappBotStore } from "@whiteroom/db";

async function run() {
  console.log("Deleting whatsapp_bot_store rows...");
  await db.delete(whatsappBotStore);
  console.log("Database reset complete!");
  process.exit(0);
}

run();
