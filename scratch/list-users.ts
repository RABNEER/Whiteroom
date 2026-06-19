import postgres from "postgres";
import { config } from "dotenv";

config({ path: "D:\\Whiteroom\\.env" });

async function run() {
  const url = process.env.DATABASE_URL!;
  const client = postgres(url);
  try {
    const schoolAdmins = await client`
      SELECT * FROM school_admins;
    `;
    console.log("School Admins in school_admins table:");
    console.log(schoolAdmins);

    const usersRoleAdmin = await client`
      SELECT * FROM users WHERE role = 'school_admin';
    `;
    console.log("Users with role 'school_admin':");
    console.log(usersRoleAdmin);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
