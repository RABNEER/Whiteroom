import postgres from "postgres";
import { config } from "dotenv";

config({ path: "D:\\Whiteroom\\.env" });

async function run() {
  const url = process.env.DATABASE_URL!;
  console.log("Connecting to:", url);
  const client = postgres(url);
  try {
    const tables = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `;
    console.log("Existing tables:", tables.map(t => t.table_name));

    const policies = await client`
      SELECT policyname, tablename 
      FROM pg_policies;
    `;
    console.log("Existing policies:", policies);
  } catch (err) {
    console.error("Error connecting to DB:", err);
  } finally {
    await client.end();
  }
}

run();
