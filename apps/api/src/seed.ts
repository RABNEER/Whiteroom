/**
 * Seed script â€” creates the "Sharma Coaching Centre" demo tenant
 * with a teacher, 30 students, and sample data.
 *
 * Usage: pnpm seed (from apps/api or monorepo root)
 */
import { drizzle } from "@whiteroom/db";
import postgres from "postgres";
import * as schema from "@whiteroom/db";
import { UserRole } from "@whiteroom/shared";
import { generateInviteCode, slugify, hashSHA256 } from "./lib/otp.js";
import { env } from "./lib/env.js";
import { and, eq } from "@whiteroom/db";

const client = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log("ðŸŒ± Starting seed...\n");

  // â”€â”€â”€ Create Tenant â”€â”€â”€
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

  console.log(`âœ… Tenant: ${tenant!.name} (invite: ${tenant!.inviteCode})`);

  // â”€â”€â”€ Create Teacher â”€â”€â”€
  const [existingTeacher] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.phone, hashSHA256("+919876543210")))
    .limit(1);

  const [teacherUser] = existingTeacher
    ? [existingTeacher]
    : await db
        .insert(schema.users)
        .values({
          phone: hashSHA256("+919876543210"),
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

  console.log(`âœ… Teacher: demo account seeded`);

  // â”€â”€â”€ Create 30 Students â”€â”€â”€
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

  console.log(`âœ… Students: ${studentNames.length} created`);

  // â”€â”€â”€ Create Parent (linked to first student) â”€â”€â”€
  const [existingParent] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.phone, hashSHA256("+919123456789")))
    .limit(1);

  const [parentUser] = existingParent
    ? [existingParent]
    : await db
        .insert(schema.users)
        .values({
          phone: hashSHA256("+919123456789"),
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

  console.log(`âœ… Parent: demo account seeded`);
  console.log(`âœ… Consent log created for parent onboarding`);

  const superAdminPhone = env.SUPER_ADMIN_PHONE;
  if (superAdminPhone) {
    await db
      .insert(schema.users)
      .values({
        phone: hashSHA256(superAdminPhone),
        name: "Whiteroom Admin",
        role: UserRole.SUPER_ADMIN,
        tenantId: tenant!.id,
      })
      .onConflictDoNothing();

    console.log(`âœ… Super admin seeded from SUPER_ADMIN_PHONE`);
  }

  // â”€â”€â”€ Summary â”€â”€â”€
  console.log(`
  â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
  â•‘  ðŸŒ± Seed Complete                        â•‘
  â•‘                                          â•‘
  â•‘  Tenant: ${tenantName.padEnd(25)}      â•‘
  â•‘  Invite: ${tenant!.inviteCode.padEnd(25)}      â•‘
  â•‘  Teacher and parent demo phones are      â•‘
  â•‘  defined inside the seed script.         â•‘
  â•‘  Students: 30                            â•‘
  â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
`);

  await client.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("âŒ Seed failed:", err);
  process.exit(1);
});
