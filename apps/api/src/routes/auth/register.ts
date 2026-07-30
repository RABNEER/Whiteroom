import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { env } from "../../lib/env.js";
import {
  registrationTokens,
  users,
  tenants,
  schoolAdmins,
  teacherProfiles,
  parentProfiles,
  consentLogs,
  userTenants,
  students,
  classes,
  classEnrollments,
} from "@whiteroom/db";
import {
  generateInviteCode,
  slugify,
  hashSHA256,
} from "../../lib/otp.js";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import { getTenantPlanTier } from "../../lib/subscription.js";
import {
  Errors,
  AppError,
  ErrorCode,
  UserRole,
} from "@whiteroom/shared";
import type { ApiResponse, OTPVerifyResponse, JWTPayload } from "@whiteroom/shared";
import { eq, and, gte, count, isNull } from "@whiteroom/db";

const registerSchema = z.object({
  registrationToken: z.string().uuid(),
  role: z.enum([UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.PARENT]),
  name: z.string().trim().min(2).max(120).optional(),
  consentAccepted: z.boolean(),
  consentAcceptedAt: z.string().optional(),
  inviteCode: z.preprocess(val => val === "" ? undefined : val, z.string().length(6).optional()),
  schoolName: z.preprocess(val => val === "" ? undefined : val, z.string().trim().min(2).max(120).optional()),
  designation: z.preprocess(val => val === "" ? undefined : val, z.string().trim().min(2).max(80).optional()),
  studentName: z.preprocess(val => val === "" ? undefined : val, z.string().trim().min(1).max(120).optional()),
  rollNumber: z.preprocess(val => val === "" ? undefined : val, z.string().trim().min(1).max(40).optional()),
  turnstileToken: z.string().optional(),
});

/**
 * POST /api/v1/auth/register
 *
 * 1. Validate request body
 * 2. Retrieve & verify registrationToken (expiresAt > now, usedAt is null)
 * 3. Enforce rate limit (max 5 tokens generated per phone per hour)
 * 4. Begin transaction:
 *    a. Mark token as used (set usedAt = now)
 *    b. Create user & profiles
 *    c. Log DPDP Act consent
 *    d. Rollback if any step fails
 * 5. Sign & return JWTs
 */
export async function registerHandler(c: Context) {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const {
    registrationToken,
    role,
    name,
    consentAccepted,
    inviteCode,
    schoolName,
    designation,
    studentName,
    rollNumber,
    turnstileToken,
  } = parsed.data;

  if (!consentAccepted) {
    throw Errors.validation("Consent is required to complete registration.");
  }

  // Cloudflare Turnstile Verification (Web clients with Turnstile secret configured)
  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret && turnstileSecret.trim() !== "") {
    if (!turnstileToken) {
      throw Errors.validation("CAPTCHA token is required to register.");
    }
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: turnstileSecret,
        response: turnstileToken,
        remoteip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "",
      }),
    });
    const data = (await response.json()) as { success: boolean };
    if (!data.success) {
      throw Errors.validation("CAPTCHA verification failed. Please try again.");
    }
  }


  // â”€â”€â”€ 1. Retrieve Registration Token â”€â”€â”€
  const [tokenRecord] = await db
    .select()
    .from(registrationTokens)
    .where(eq(registrationTokens.id, registrationToken))
    .limit(1);

  if (!tokenRecord) {
    throw Errors.notFound("Registration token");
  }

  // â”€â”€â”€ 2. Enforce Token Status & Expiry â”€â”€â”€
  if (tokenRecord.expiresAt < new Date()) {
    throw new AppError(
      ErrorCode.OTP_EXPIRED,
      "Registration token has expired. Please verify OTP again.",
      401
    );
  }

  if (tokenRecord.usedAt) {
    throw new AppError(
      ErrorCode.INVALID_OTP,
      "Registration token has already been used.",
      401
    );
  }

  // â”€â”€â”€ 3. Enforce Rate Limiting (Max 5 attempts/hour) â”€â”€â”€
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [attemptCount] = await db
    .select({ total: count() })
    .from(registrationTokens)
    .where(
      and(
        eq(registrationTokens.phone, tokenRecord.phone),
        gte(registrationTokens.createdAt, oneHourAgo)
      )
    );

  if (attemptCount && attemptCount.total > 5) {
    throw Errors.rateLimited("Too many registration attempts. Please try again in an hour.");
  }

  const phoneLookup = tokenRecord.phone.startsWith("+91")
    ? hashSHA256(tokenRecord.phone)
    : tokenRecord.phone;
  const tenantContactPhone = tokenRecord.phone.startsWith("+91")
    ? tokenRecord.phone
    : phoneLookup;


  // â”€â”€â”€ 4. Execute Registration Transaction â”€â”€â”€
  const txnResult = await db.transaction(async (tx) => {
    // a. Mark registration token as used immediately to block replay attempts
    await tx
      .update(registrationTokens)
      .set({ usedAt: new Date() })
      .where(eq(registrationTokens.id, registrationToken));

    if (role === UserRole.SCHOOL_ADMIN) {
      // â”€â”€â”€ School Admin Signup â”€â”€â”€
      const tName = schoolName || `My Institution`;
      const generatedInvite = generateInviteCode();
      const slug = slugify(tName) + "-" + generatedInvite.toLowerCase();

      const [newTenant] = await tx
        .insert(tenants)
        .values({
          name: tName,
          slug,
          inviteCode: generatedInvite,
          phone: tenantContactPhone,
          brandColor: "#4F46E5",
        })
        .returning();

      const [newUser] = await tx
        .insert(users)
        .values({
          phone: phoneLookup,
          name: name || null,
          role: UserRole.SCHOOL_ADMIN,
          tenantId: newTenant!.id,
        })
        .returning();

      await tx.insert(userTenants).values({
        userId: newUser!.id,
        tenantId: newTenant!.id,
        role: UserRole.SCHOOL_ADMIN,
        status: "active",
        activeTenant: true,
      });

      await tx.insert(schoolAdmins).values({
        userId: newUser!.id,
        tenantId: newTenant!.id,
        designation: designation || null,
      });

      // Log consent for school admin
      await tx.insert(consentLogs).values({
        userId: newUser!.id,
        tenantId: newTenant!.id,
        consentType: "data_processing",
        ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
      });

      return { user: newUser!, tenantId: newTenant!.id };
    } else if (role === UserRole.TEACHER) {
      // ——— Teacher Signup (Joins existing Tenant) ———
      if (!inviteCode) {
        throw Errors.validation("Invite code is required for teacher registration.");
      }

      const [tenant] = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.inviteCode, inviteCode))
        .limit(1);

      if (!tenant) {
        throw Errors.notFound("Invite code");
      }

      const [newUser] = await tx
        .insert(users)
        .values({
          phone: phoneLookup,
          name: name || null,
          role: UserRole.TEACHER,
          tenantId: tenant.id,
        })
        .returning();

      await tx.insert(userTenants).values({
        userId: newUser!.id,
        tenantId: tenant.id,
        role: UserRole.TEACHER,
        status: "active",
        activeTenant: true,
      });

      await tx.insert(teacherProfiles).values({
        userId: newUser!.id,
        tenantId: tenant.id,
      });

      // Log consent for teachers
      await tx.insert(consentLogs).values({
        userId: newUser!.id,
        tenantId: tenant.id,
        consentType: "data_processing",
        ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
      });

      return { user: newUser!, tenantId: tenant.id };
    } else {
      // ——— Parent Signup ———
      if (!inviteCode) {
        throw Errors.validation("Invite code is required for parent registration.");
      }

      const [tenant] = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.inviteCode, inviteCode))
        .limit(1);

      if (!tenant) {
        throw Errors.notFound("Invite code");
      }

      const [newUser] = await tx
        .insert(users)
        .values({
          phone: phoneLookup,
          name: name || null,
          role: UserRole.PARENT,
          tenantId: tenant.id,
        })
        .returning();

      await tx.insert(userTenants).values({
        userId: newUser!.id,
        tenantId: tenant.id,
        role: UserRole.PARENT,
        status: "active",
        activeTenant: true,
      });

      const [newParentProfile] = await tx
        .insert(parentProfiles)
        .values({
          userId: newUser!.id,
          tenantId: tenant.id,
        })
        .returning();

      // Log consent under DPDP Act 2023 specifications
      await tx.insert(consentLogs).values({
        userId: newUser!.id,
        tenantId: tenant.id,
        consentType: "data_processing",
        ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
      });

      if (studentName) {
        const [existingStudent] = await tx
          .select()
          .from(students)
          .where(
            and(
              eq(students.tenantId, tenant.id),
              isNull(students.parentId),
              isNull(students.deletedAt),
              eq(students.name, studentName)
            )
          )
          .limit(1);

        let linkedStudentId: string;
        if (existingStudent) {
          await tx
            .update(students)
            .set({ parentId: newParentProfile!.id })
            .where(eq(students.id, existingStudent.id));
          linkedStudentId = existingStudent.id;
        } else {
          const [createdStudent] = await tx
            .insert(students)
            .values({
              tenantId: tenant.id,
              name: studentName,
              rollNumber: rollNumber || null,
              phone: phoneLookup,
              parentId: newParentProfile!.id,
            })
            .returning();
          linkedStudentId = createdStudent!.id;
        }

        const activeSchoolClasses = await tx
          .select({ id: classes.id })
          .from(classes)
          .where(and(eq(classes.tenantId, tenant.id), isNull(classes.deletedAt)));

        if (activeSchoolClasses.length > 0) {
          await tx
            .insert(classEnrollments)
            .values(
              activeSchoolClasses.map((cls) => ({
                classId: cls.id,
                studentId: linkedStudentId,
              }))
            )
            .onConflictDoNothing();
        }
      }

      return { user: newUser!, tenantId: tenant.id };
    }
  });

  const userId = txnResult.user.id;
  const tenantId = txnResult.tenantId;

  // â”€â”€â”€ 5. Resolve Tenant Payload & Sign JWTs â”€â”€â”€
  const userTenantRecords = await db
    .select({
      tenantId: userTenants.tenantId,
      role: userTenants.role,
      status: userTenants.status,
      tenantName: tenants.name,
    })
    .from(userTenants)
    .innerJoin(tenants, eq(userTenants.tenantId, tenants.id))
    .where(eq(userTenants.userId, userId));

  const tenantsPayload = userTenantRecords.map((r) => ({
    tenantId: r.tenantId,
    role: r.role,
    status: r.status,
  }));

  const plan = await getTenantPlanTier(tenantId);
  const jwtPayload: JWTPayload = {
    userId,
    tenantId,
    role,
    plan,
    activeTenantId: tenantId,
    tenants: tenantsPayload,
  };

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(jwtPayload),
    signRefreshToken(jwtPayload),
  ]);

  await db
    .update(users)
    .set({ refreshToken: hashSHA256(refreshToken), updatedAt: new Date() })
    .where(eq(users.id, userId));

  const response: ApiResponse<OTPVerifyResponse> = {
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        role,
        tenantId,
        tenants: userTenantRecords.map((r) => ({
          tenantId: r.tenantId,
          role: r.role,
          status: r.status,
          tenantName: r.tenantName,
        })),
      },
      isNewUser: true,
    },
  };

  return c.json(response, 201);
}
