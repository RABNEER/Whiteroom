import postgres from "postgres";
import { config } from "dotenv";

config({ path: "D:\\Whiteroom\\.env" });

async function run() {
  const url = process.env.DATABASE_URL!;
  console.log("Connecting to:", url);
  const client = postgres(url);
  try {
    const sessions = await client`
      SELECT id, phone, verified, expires_at, created_at
      FROM whatsapp_sessions
      ORDER BY created_at DESC
      LIMIT 10;
    `;
    console.log("Latest 10 WhatsApp sessions:");
    for (const s of sessions) {
      console.log(`ID: ${s.id} | Phone: ${s.phone} | Verified: ${s.verified} | ExpiresAt: ${s.expires_at} | CreatedAt: ${s.created_at}`);
    }
  } catch (err) {
    console.error("Error connecting to DB:", err);
  } finally {
    await client.end();
  }
}

run();
