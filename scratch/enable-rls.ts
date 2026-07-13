import postgres from "postgres";
import { config } from "dotenv";

config({ path: "D:\\Whiteroom\\.env" });

async function run() {
  const url = process.env.DATABASE_URL!;
  console.log("Connecting to exact project:", url);
  const client = postgres(url);
  try {
    console.log("Enabling RLS on public.audit_logs...");
    await client`ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;`;
    console.log("✅ RLS successfully enabled on public.audit_logs!");
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await client.end();
  }
}

run();
