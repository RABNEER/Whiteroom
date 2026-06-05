import type { Context } from "hono";
import { z } from "zod";
import { env } from "../../lib/env.js";
import { db } from "../../lib/db.js";
import {
  otpAttempts,
  otpLockouts,
  users,
  tenants,
  teacherProfiles,
  parentProfiles,
  consentLogs,
  students,
  userTenants,
  registrationTokens,
} from "@whiteroom/db";
import {
  normalizePhone,
  isValidIndianPhone,
  hashSHA256,
  generateInviteCode,
  slugify,
} from "../../lib/otp.js";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import crypto from "node:crypto";
import {
  Errors,
  AppError,
  ErrorCode,
  UserRole,
  PlanTier,
} from "@whiteroom/shared";
import type { ApiResponse, OTPVerifyResponse, JWTPayload } from "@whiteroom/shared";
import { eq, and, gte, lt, isNull, count } from "@whiteroom/db";
import { verifyFirebaseIdToken } from "../../lib/firebase.js";

const verifySchema = z.object({
  idToken: z.string().min(1).optional(),
  phone: z.string().min(10).max(15).optional(),
  otp: z.string().min(5).max(6).optional(),
  inviteCode: z.string().length(6).optional(),
  studentName: z.string().trim().min(1).max(120).optional(),
  rollNumber: z.string().trim().min(1).max(40).optional(),
}).refine(data => {
  return !!data.idToken || (!!data.phone && !!data.otp);
}, {
  message: "Either 'idToken' or both 'phone' and 'otp' must be provided.",
  path: ["idToken"],
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
    console.error("❌ [OTP VERIFY VALIDATION FAILED]", {
      body,
      errors: parsed.error.format(),
    });
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  let phone: string;
  let firebaseUid = "legacy-otp";

  if (parsed.data.idToken) {
    try {
      const verified = await verifyFirebaseIdToken(parsed.data.idToken);
      phone = normalizePhone(verified.phone);
      firebaseUid = verified.uid;
    } catch (err: any) {
      throw new AppError(
        ErrorCode.INVALID_OTP,
        `Firebase token verification failed: ${err?.message || err}`,
        401
      );
    }
  } else {
    // ─── Legacy Phone/OTP Fallback Path ───
    const reqPhone = normalizePhone(parsed.data.phone!);
    if (!isValidIndianPhone(reqPhone)) {
      throw Errors.validation("Invalid phone number format.");
    }
    phone = reqPhone;

    const phoneHash = hashSHA256(phone);
    const otpHash = hashSHA256(parsed.data.otp!);
    const now = new Date();

    // ─── Brute-Force Guard (Fix 1) using a secure transaction with row locking ───
    await db.transaction(async (tx) => {
      let [lockout] = await tx
        .select()
        .from(otpLockouts)
        .where(eq(otpLockouts.phone, phone))
        .for("update")
        .limit(1);

      if (lockout) {
        if (lockout.lockedUntil && lockout.lockedUntil > now) {
          throw new AppError(
            ErrorCode.OTP_RATE_LIMITED,
            `Too many failed OTP attempts. Please wait until ${lockout.lockedUntil.toISOString()} to try again.`,
            429,
            { lockedUntil: lockout.lockedUntil }
          );
        }

        if (lockout.lockedUntil && lockout.lockedUntil <= now) {
          // Lockout expired - reset attempts
          await tx
            .update(otpLockouts)
            .set({
              attempts: 0,
              lockedUntil: null,
              updatedAt: now,
            })
            .where(eq(otpLockouts.id, lockout.id));

          lockout.attempts = 0;
          lockout.lockedUntil = null;
        }

        if (lockout.attempts >= 5) {
          const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
          await tx
            .update(otpLockouts)
            .set({
              lockedUntil,
              updatedAt: now,
            })
            .where(eq(otpLockouts.id, lockout.id));

          throw new AppError(
            ErrorCode.OTP_RATE_LIMITED,
            `Too many failed OTP attempts. Please wait until ${lockedUntil.toISOString()} to try again.`,
            429,
            { lockedUntil }
          );
        }
      }

      // ─── Find Matching OTP ───
      let otpRecord: { id: string } | null | undefined = null;
      const isDevBypass = env.ENABLE_DEV_BYPASS === "true" && parsed.data.otp === "000000";

      if (isDevBypass) {
        otpRecord = { id: "dev-bypass" };
      } else {
        const [fetched] = await tx
          .select({ id: otpAttempts.id })
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
        otpRecord = fetched;
      }

      if (!otpRecord) {
        // Increment attempts on wrong OTP
        let currentAttempts = 1;
        if (lockout) {
          currentAttempts = lockout.attempts + 1;
          let lockedUntil: Date | null = null;
          if (currentAttempts >= 5) {
            lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
          }
          await tx
            .update(otpLockouts)
            .set({
              attempts: currentAttempts,
              lockedUntil,
              updatedAt: now,
            })
            .where(eq(otpLockouts.id, lockout.id));

          if (currentAttempts >= 5) {
            throw new AppError(
              ErrorCode.OTP_RATE_LIMITED,
              `Too many failed OTP attempts. Please wait until ${lockedUntil!.toISOString()} to try again.`,
              429,
              { lockedUntil }
            );
          }
        } else {
          await tx
            .insert(otpLockouts)
            .values({
              phone,
              attempts: 1,
              lockedUntil: null,
              createdAt: now,
              updatedAt: now,
            });
        }

        // Check if there's an expired match → specific error
        const [expired] = await tx
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
            401
          );
        }

        throw new AppError(
          ErrorCode.INVALID_OTP,
          "Invalid OTP. Please check and try again.",
          401
        );
      }

      // ─── Reset attempts on correct OTP ───
      if (lockout) {
        await tx
          .update(otpLockouts)
          .set({
            attempts: 0,
            lockedUntil: null,
            updatedAt: now,
          })
          .where(eq(otpLockouts.id, lockout.id));
      }

      // ─── Mark OTP as Verified ───
      if (!isDevBypass) {
        await tx
          .update(otpAttempts)
          .set({ verified: true })
          .where(eq(otpAttempts.id, otpRecord.id));
      }
    });
  }

  // Ensure phone is valid Indian phone format
  if (!isValidIndianPhone(phone)) {
    throw Errors.validation("Invalid phone number format.");
  }

  // ─── Find or Create User ───
  // FIX: Parents cannot join multiple tenants — breaks multi-school families
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!existingUser) {
    // ─── NEW USER FLOW: Generate Registration Token ───
    const registrationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(registrationTokens).values({
      id: registrationToken,
      phone,
      firebaseUid,
      expiresAt,
    });

    const response: ApiResponse<any> = {
      success: true,
      data: {
        type: "new_user",
        registrationToken,
      },
    };

    return c.json(response, 200);
  }

  let userId: string;
  let tenantId: string;
  let role: string;
  let isNewUser = false;

  if (existingUser) {
    userId = existingUser.id;

    if (parsed.data.inviteCode) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.inviteCode, parsed.data.inviteCode))
        .limit(1);

      if (!tenant) {
        throw Errors.notFound("Invite code");
      }

      // Check if already mapped
      const [existingMapping] = await db
        .select()
        .from(userTenants)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenant.id)))
        .limit(1);

      if (!existingMapping) {
        // Link to the new school in transaction
        await db.transaction(async (tx) => {
          // Deactivate other tenants
          await tx
            .update(userTenants)
            .set({ activeTenant: false })
            .where(eq(userTenants.userId, userId));

          // Insert new mapping
          await tx.insert(userTenants).values({
            userId,
            tenantId: tenant.id,
            role: UserRole.PARENT,
            status: "active",
            activeTenant: true,
          });

          // Insert profile
          const [parentProfile] = await tx
            .insert(parentProfiles)
            .values({
              userId,
              tenantId: tenant.id,
            })
            .returning();

          // Consent log
          await tx.insert(consentLogs).values({
            userId,
            tenantId: tenant.id,
            consentType: "data_processing",
            ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
            userAgent: c.req.header("user-agent") ?? null,
          });

          // Automatic student auto-linking removed to prevent IDOR student claiming vulnerability (Finding 3)
        });
      } else {
        // Already mapped. If student details provided, try to link them
        // Automatic student auto-linking removed to prevent IDOR student claiming vulnerability (Finding 3)

        // Set as active
        await db.transaction(async (tx) => {
          await tx
            .update(userTenants)
            .set({ activeTenant: false })
            .where(eq(userTenants.userId, userId));
          await tx
            .update(userTenants)
            .set({ activeTenant: true })
            .where(eq(userTenants.id, existingMapping.id));
        });
      }

      tenantId = tenant.id;
      role = UserRole.PARENT;
    } else {
      // Returning user - login. Resolve active tenant
      const userMappings = await db
        .select()
        .from(userTenants)
        .where(eq(userTenants.userId, userId));

      if (userMappings.length === 0) {
        // Legacy user check - create userTenants record
        const tId = existingUser.tenantId ?? "";
        const r = existingUser.role;
        if (tId) {
          await db
            .insert(userTenants)
            .values({
              userId,
              tenantId: tId,
              role: r,
              status: "active",
              activeTenant: true,
            });
          tenantId = tId;
          role = r;
        } else {
          tenantId = "";
          role = r;
        }
      } else {
        const activeMapping = userMappings.find(m => m.activeTenant) ?? userMappings[0];
        tenantId = activeMapping.tenantId;
        role = activeMapping.role;
      }
    }
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

    const result = await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          phone,
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

      // Automatic student auto-linking removed to prevent IDOR student claiming vulnerability (Finding 3)

      return newUser!;
    });

    userId = result.id;
    tenantId = tenant.id;
    role = UserRole.PARENT;
  } else {
    // ─── New Teacher (first-time signup) ───
    isNewUser = true;

    const inviteCode = generateInviteCode();
    const tenantName = `My Institute`;
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

      await tx.insert(userTenants).values({
        userId: newUser!.id,
        tenantId: newTenant!.id,
        role: UserRole.TEACHER,
        status: "active",
        activeTenant: true,
      });

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

  // ─── Resolve All Linked Tenants for JWT ───
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

  // ─── Issue JWT Pair ───
  const jwtPayload: JWTPayload = {
    userId,
    tenantId,
    role,
    plan: PlanTier.FREE, // Default for new users
    activeTenantId: tenantId,
    tenants: tenantsPayload,
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

  const response: ApiResponse<any> = {
    success: true,
    data: {
      type: "existing_user",
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
      isNewUser,
    },
  };

  return c.json(response, 200);
}
