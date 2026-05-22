const { Client } = require('pg');
require('dotenv').config({ path: 'D:\\Whiteroom\\.env' });

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  console.log("Connecting to:", process.env.DATABASE_URL);
  await client.connect();
  
  const statements = [
    `CREATE TABLE IF NOT EXISTS "user_tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"active_tenant" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `ALTER TABLE "parent_profiles" DROP CONSTRAINT IF EXISTS "parent_profiles_user_id_unique";`,
    `ALTER TABLE "teacher_profiles" DROP CONSTRAINT IF EXISTS "teacher_profiles_user_id_unique";`,
    `ALTER TABLE "user_tenants" DROP CONSTRAINT IF EXISTS "user_tenants_user_id_users_id_fk";`,
    `ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;`,
    `ALTER TABLE "user_tenants" DROP CONSTRAINT IF EXISTS "user_tenants_tenant_id_tenants_id_fk";`,
    `ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;`
  ];

  for (const stmt of statements) {
    console.log("Executing:", stmt.split('\n')[0] + "...");
    try {
      await client.query(stmt);
      console.log("  ✅ Success");
    } catch (err) {
      console.error("  ❌ Failed:", err.message);
    }
  }

  await client.end();
  console.log("Done running custom migration patch!");
}

run().catch(console.error);
