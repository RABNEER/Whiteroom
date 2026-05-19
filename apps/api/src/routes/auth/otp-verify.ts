import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import {
  otpAttempts,
  users,
  tenants,
  teacherProfiles,
  parentProfiles,
  consentLogs,
  students,
} from "@whiteroom/db";
import {
  normalizePhone,
  isValidIndianPhone,
  hashSHA256,
  generateInviteCode,
  slugify,
} from "../../lib/otp.js";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import {
  Errors,
  AppError,
  ErrorCode,
  UserRole,
  PlanTier,
} from "@whiteroom/shared";
import type { ApiResponse, OTPVerifyResponse, JWTPayload } from "@whiteroom/shared";
import { eq, and, gte, isNull } from "@whiteroom/db";

const verifySchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
  inviteCode: z.string().length(6).optional(),
  studentName: z.string().trim().min(1).max(120).optional(),
  rollNumber: z.string().trim().min(1).max(40).optional(),
});

/**
 * POST /api/v1/auth/otp/verify
 *
 * 1. Validate & normalize phone
 * 2. Find matching unexpired, unverified OTP
 * 3. Mark OTP as verified
 * 4. If new user: create user + tenant + profile in transaction
 * 5. If returning user: just issue tokens
 * 6. Return JWT pair
 */
export async function otpVerifyHandler(c: Context) {
  const body = await c.req.json();
  const parsed = verifySchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!isValidIndianPhone(phone)) {
    throw Errors.validation("Invalid phone number format.");
  }

  const phoneHash = hashSHA256(phone);
  const otpHash = hashSHA256(parsed.data.otp);
  const now = new Date();

  // ─── Find Matching OTP ───
  const [otpRecord] = await db
    .select()
    .from(otpAttempts)
    .where(
      and(
        eq(otpAttempts.phoneHash, phoneHash),
        eq(otpAttempts.otp, otpHash),
        eq(otpAttempts.verified, false),
        gte(otpAttempts.expiresAt, now)
      )
    )
    .limit(1);

  if (!otpRecord) {
    // Check if there's an expired match → specific error
    const [expired] = await db
      .select()
      .from(otpAttempts)
      .where(
        and(
          eq(otpAttempts.phoneHash, phoneHash),
          eq(otpAttempts.otp, otpHash),
          eq(otpAttempts.verified, false)
        )
      )
      .limit(1);

    if (expired) {
      throw new AppError(
        ErrorCode.OTP_EXPIRED,
        "OTP has expired. Please request a new one.",
        400
      );
    }

    throw new AppError(
      ErrorCode.INVALID_OTP,
      "Invalid OTP. Please check and try again.",
      400
    );
  }

  // ─── Mark OTP as Verified ───
  await db
    .update(otpAttempts)
    .set({ verified: true })
    .where(eq(otpAttempts.id, otpRecord.id));

  // ─── Find or Create User ───
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  let userId: string;
  let tenantId: string;
  let role: string;
  let isNewUser = false;

  if (existingUser) {
    if (parsed.data.inviteCode) {
      const [tenant] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.inviteCode, parsed.data.inviteCode))
        .limit(1);

      if (!tenant) {
        throw Errors.notFound("Invite code");
      }

      if (
        existingUser.tenantId !== tenant.id ||
        existingUser.role !== UserRole.PARENT
      ) {
        throw new AppError(
          ErrorCode.ALREADY_EXISTS,
          "This phone number is already linked to another account. Multi-tenant account switching is not supported in v1.",
          409
        );
      }
    }

    // ─── Returning User ───
    userId = existingUser.id;
    tenantId = existingUser.tenantId!;
    role = existingUser.role;
  } else if (parsed.data.inviteCode) {
    // ─── New Parent via Invite ───
    isNewUser = true;

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.inviteCode, parsed.data.inviteCode))
      .limit(1);

    if (!tenant) {
      throw Errors.notFound("Invite code");
    }

    // Atomic transaction: user + parent profile + consent log
    const result = await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          phone,
          role: UserRole.PARENT,
          tenantId: tenant.id,
        })
        .returning();

      const [parentProfile] = await tx
        .insert(parentProfiles)
        .values({
          userId: newUser!.id,
          tenantId: tenant.id,
        })
        .returning();

      await tx.insert(consentLogs).values({
        userId: newUser!.id,
        tenantId: tenant.id,
        consentType: "data_processing",
        ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
      });

      if (parsed.data.studentName && parsed.data.rollNumber) {
        await tx
          .update(students)
          .set({ parentId: parentProfile!.id, updatedAt: new Date() })
          .where(
            and(
              eq(students.tenantId, tenant.id),
              eq(students.name, parsed.data.studentName),
              eq(students.rollNumber, parsed.data.rollNumber),
              isNull(students.parentId),
              isNull(students.deletedAt)
            )
          );
      }

      return newUser!;
    });

    userId = result.id;
    tenantId = tenant.id;
    role = UserRole.PARENT;
  } else {
    // ─── New Teacher (first-time signup) ───
    isNewUser = true;

    const inviteCode = generateInviteCode();
    const tenantName = `My Institute`; // Default name, teacher can update later
    const slug = slugify(tenantName) + "-" + inviteCode.toLowerCase();

    const result = await db.transaction(async (tx) => {
      const [newTenant] = await tx
        .insert(tenants)
        .values({
          name: tenantName,
          slug,
          inviteCode,
          phone,
          brandColor: "#4F46E5",
        })
        .returning();

      const [newUser] = await tx
        .insert(users)
        .values({
          phone,
          role: UserRole.TEACHER,
          tenantId: newTenant!.id,
        })
        .returning();

      await tx.insert(teacherProfiles).values({
        userId: newUser!.id,
        tenantId: newTenant!.id,
      });

      return { user: newUser!, tenant: newTenant! };
    });

    userId = result.user.id;
    tenantId = result.tenant.id;
    role = UserRole.TEACHER;
  }

  // ─── Issue JWT Pair ───
  const jwtPayload: JWTPayload = {
    userId,
    tenantId,
    role,
    plan: PlanTier.FREE, // Default for new users
  };

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(jwtPayload),
    signRefreshToken(jwtPayload),
  ]);

  // Store refresh token hash on user record
  await db
    .update(users)
    .set({ refreshToken: hashSHA256(refreshToken), updatedAt: new Date() })
    .where(eq(users.id, userId));

  const response: ApiResponse<OTPVerifyResponse> = {
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: { id: userId, role, tenantId },
      isNewUser,
    },
  };

  return c.json(response, 200);
}
