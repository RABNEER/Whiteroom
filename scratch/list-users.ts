import postgres from "postgres";
import { config } from "dotenv";

config({ path: "D:\\Whiteroom\\.env" });

async function run() {
  const url = process.env.DATABASE_URL!;
  const client = postgres(url);
  try {
    const classes = await client`
      SELECT id, name, subject, tenant_id, created_at
      FROM classes
      ORDER BY created_at DESC
      LIMIT 5;
    `;
    console.log("Latest 5 classes in database:");
    console.log(classes);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
