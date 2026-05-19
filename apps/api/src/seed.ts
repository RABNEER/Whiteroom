/**
 * Seed script — creates the "Sharma Coaching Centre" demo tenant
 * with a teacher, 30 students, and sample data.
 *
 * Usage: pnpm seed (from apps/api or monorepo root)
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { drizzle } from "@whiteroom/db";
import postgres from "postgres";
import * as schema from "@whiteroom/db";
import { UserRole } from "@whiteroom/shared";
import { generateInviteCode, slugify } from "./lib/otp.js";
import { and, eq } from "@whiteroom/db";

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

  const [existingTenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1);

  const [tenant] = existingTenant
    ? [existingTenant]
    : await db
        .insert(schema.tenants)
        .values({
          name: tenantName,
          slug,
          inviteCode,
          phone: "+919876543210",
          brandColor: "#4F46E5",
        })
        .returning();

  console.log(`✅ Tenant: ${tenant!.name} (invite: ${tenant!.inviteCode})`);

  // ─── Create Teacher ───
  const [existingTeacher] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.phone, "+919876543210"))
    .limit(1);

  const [teacherUser] = existingTeacher
    ? [existingTeacher]
    : await db
        .insert(schema.users)
        .values({
          phone: "+919876543210",
          name: "Rajesh Sharma",
          role: UserRole.TEACHER,
          tenantId: tenant!.id,
        })
        .returning();

  await db
    .insert(schema.teacherProfiles)
    .values({
      userId: teacherUser!.id,
      tenantId: tenant!.id,
      subject: "Mathematics",
    })
    .onConflictDoNothing();

  console.log(`✅ Teacher: demo account seeded`);

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
    const rollNumber = String(i + 1).padStart(2, "0");
    const [existingStudent] = await db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(eq(schema.students.rollNumber, rollNumber))
      .limit(1);

    if (!existingStudent) {
      await db.insert(schema.students).values({
        name: studentNames[i]!,
        rollNumber,
        tenantId: tenant!.id,
      });
    }
  }

  console.log(`✅ Students: ${studentNames.length} created`);

  // ─── Create Parent (linked to first student) ───
  const [existingParent] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.phone, "+919123456789"))
    .limit(1);

  const [parentUser] = existingParent
    ? [existingParent]
    : await db
        .insert(schema.users)
        .values({
          phone: "+919123456789",
          name: "Meera Patel",
          role: UserRole.PARENT,
          tenantId: tenant!.id,
        })
        .returning();

  await db
    .insert(schema.parentProfiles)
    .values({
      userId: parentUser!.id,
      tenantId: tenant!.id,
    })
    .onConflictDoNothing();

  const [parentProfile] = await db
    .select({ id: schema.parentProfiles.id })
    .from(schema.parentProfiles)
    .where(eq(schema.parentProfiles.userId, parentUser!.id))
    .limit(1);

  if (parentProfile) {
    await db
      .update(schema.students)
      .set({ parentId: parentProfile.id, updatedAt: new Date() })
      .where(
        and(
          eq(schema.students.tenantId, tenant!.id),
          eq(schema.students.rollNumber, "01")
        )
      );
  }

  const [existingConsent] = await db
    .select({ id: schema.consentLogs.id })
    .from(schema.consentLogs)
    .where(eq(schema.consentLogs.userId, parentUser!.id))
    .limit(1);

  if (!existingConsent) {
    await db.insert(schema.consentLogs).values({
      userId: parentUser!.id,
      tenantId: tenant!.id,
      consentType: "data_processing",
    });
  }

  console.log(`✅ Parent: demo account seeded`);
  console.log(`✅ Consent log created for parent onboarding`);

  const superAdminPhone = process.env.SUPER_ADMIN_PHONE;
  if (superAdminPhone) {
    await db
      .insert(schema.users)
      .values({
        phone: superAdminPhone,
        name: "Whiteroom Admin",
        role: UserRole.SUPER_ADMIN,
        tenantId: tenant!.id,
      })
      .onConflictDoNothing();

    console.log(`✅ Super admin seeded from SUPER_ADMIN_PHONE`);
  }

  // ─── Summary ───
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  🌱 Seed Complete                        ║
  ║                                          ║
  ║  Tenant: ${tenantName.padEnd(25)}      ║
  ║  Invite: ${tenant!.inviteCode.padEnd(25)}      ║
  ║  Teacher and parent demo phones are      ║
  ║  defined inside the seed script.         ║
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
