/**
 * Seed script — creates the "Sharma Coaching Centre" demo tenant
 * with a teacher, 30 students, and sample data.
 *
 * Usage: pnpm seed (from apps/api or monorepo root)
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@whiteroom/db";
import { createId } from "@whiteroom/db";
import { UserRole, PlanTier } from "@whiteroom/shared";
import { hashSHA256, generateInviteCode, slugify } from "./lib/otp.js";

// Load env
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is required for seeding.");
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log("🌱 Starting seed...\n");

  // ─── Create Tenant ───
  const inviteCode = generateInviteCode();
  const tenantName = "Sharma Coaching Centre";
  const slug = slugify(tenantName);

  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: tenantName,
      slug,
      inviteCode,
      phone: "+919876543210",
      brandColor: "#4F46E5",
    })
    .returning();

  console.log(`✅ Tenant: ${tenant!.name} (invite: ${inviteCode})`);

  // ─── Create Teacher ───
  const [teacherUser] = await db
    .insert(schema.users)
    .values({
      phone: "+919876543210",
      name: "Rajesh Sharma",
      role: UserRole.TEACHER,
      tenantId: tenant!.id,
    })
    .returning();

  await db.insert(schema.teacherProfiles).values({
    userId: teacherUser!.id,
    tenantId: tenant!.id,
    subject: "Mathematics",
  });

  console.log(`✅ Teacher: Rajesh Sharma (+91 98765 43210)`);

  // ─── Create 30 Students ───
  const studentNames = [
    "Aarav Patel", "Vivaan Gupta", "Aditya Singh", "Vihaan Sharma",
    "Arjun Kumar", "Reyansh Verma", "Ayaan Jain", "Krishna Mishra",
    "Ishaan Agarwal", "Sai Reddy", "Arnav Chauhan", "Shaurya Yadav",
    "Atharv Pandey", "Advait Tiwari", "Dhruv Saxena", "Kabir Mehta",
    "Ritvik Bhat", "Aarush Nair", "Kian Rajan", "Darsh Iyer",
    "Ananya Patel", "Diya Sharma", "Myra Gupta", "Sara Singh",
    "Aanya Verma", "Aadhya Kumar", "Ira Jain", "Navya Mishra",
    "Prisha Agarwal", "Kiara Reddy",
  ];

  for (let i = 0; i < studentNames.length; i++) {
    await db.insert(schema.students).values({
      name: studentNames[i]!,
      rollNumber: String(i + 1).padStart(2, "0"),
      tenantId: tenant!.id,
    });
  }

  console.log(`✅ Students: ${studentNames.length} created`);

  // ─── Create Parent (linked to first student) ───
  const [parentUser] = await db
    .insert(schema.users)
    .values({
      phone: "+919123456789",
      name: "Meera Patel",
      role: UserRole.PARENT,
      tenantId: tenant!.id,
    })
    .returning();

  await db.insert(schema.parentProfiles).values({
    userId: parentUser!.id,
    tenantId: tenant!.id,
  });

  await db.insert(schema.consentLogs).values({
    userId: parentUser!.id,
    tenantId: tenant!.id,
    consentType: "data_processing",
  });

  console.log(`✅ Parent: Meera Patel (+91 91234 56789)`);
  console.log(`✅ Consent log created for parent onboarding`);

  // ─── Summary ───
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  🌱 Seed Complete                        ║
  ║                                          ║
  ║  Tenant: ${tenantName.padEnd(25)}      ║
  ║  Invite: ${inviteCode.padEnd(25)}      ║
  ║  Teacher: +919876543210                  ║
  ║  Parent:  +919123456789                  ║
  ║  Students: 30                            ║
  ╚══════════════════════════════════════════╝
`);

  await client.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
