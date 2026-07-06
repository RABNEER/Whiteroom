import postgres from "postgres";
import { config } from "dotenv";

config({ path: "D:\\Whiteroom\\.env" });

async function run() {
  const url = process.env.DATABASE_URL!;
  console.log("Connecting to:", url);
  const client = postgres(url);
  try {
    console.log("Querying last 5 messages with attachments...");
    const rows = await client`
      SELECT id, content, attachments 
      FROM messages 
      WHERE attachments IS NOT NULL 
      ORDER BY created_at DESC 
      LIMIT 5;
    `;
    console.log("Messages with attachments:", JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await client.end();
  }
}

run();
