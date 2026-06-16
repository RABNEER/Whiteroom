import postgres from "postgres";
import { config } from "dotenv";

config({ path: "D:\\Whiteroom\\.env" });

async function run() {
  const url = process.env.DATABASE_URL!;
  console.log("Connecting to:", url);
  const client = postgres(url);
  try {
    const phone = "+919296003226";
    const [user] = await client`
      SELECT id, phone, role, tenant_id, created_at, updated_at
      FROM users
      WHERE phone = ${phone}
      LIMIT 1;
    `;
    if (!user) {
      console.log(`User with phone ${phone} does not exist in users table.`);
      return;
    }

    console.log("User found:");
    console.log(user);

    const mappings = await client`
      SELECT ut.id, ut.tenant_id, ut.role, ut.status, ut.active_tenant, t.name as tenant_name
      FROM user_tenants ut
      LEFT JOIN tenants t ON ut.tenant_id = t.id
      WHERE ut.user_id = ${user.id};
    `;
    console.log("User mappings in user_tenants:");
    console.log(mappings);
  } catch (err) {
    console.error("Error connecting to DB:", err);
  } finally {
    await client.end();
  }
}

run();
