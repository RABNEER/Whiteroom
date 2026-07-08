import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import {
  otpAttempts,
  otpLockouts,
  users,
  tenants,
  teacherProfiles,
  parentProfiles,
  consentLogs,
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
import { getTenantPlanTier } from "../../lib/subscription.js";
import crypto from "node:crypto";
import {
  Errors,
  AppError,
  ErrorCode,
  UserRole,
} from "@whiteroom/shared";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { eq, and, or, desc } from "@whiteroom/db";
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
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  let phone: string;
  let firebaseUid = "legacy-otp";
  let phoneHash = "";

  if (parsed.data.idToken) {
    try {
      const verified = await verifyFirebaseIdToken(parsed.data.idToken);
      phone = normalizePhone(verified.phone);
      phoneHash = hashSHA256(phone);
      firebaseUid = verified.uid;
    } catch {
      throw new AppError(
        ErrorCode.INVALID_OTP,
        "Firebase token verification failed.",
        401
      );
    }
  } else {
    // ——— Legacy Phone/OTP Fallback Path ———
    const reqPhone = normalizePhone(parsed.data.phone!);
    if (!isValidIndianPhone(reqPhone)) {
      throw Errors.validation("Invalid phone number format.");
    }
    phone = reqPhone;
    phoneHash = hashSHA256(phone);

    // Enforce OTP lockout check (Bug 4)
    const [lockout] = await db
      .select()
      .from(otpLockouts)
      .where(eq(otpLockouts.phone, phoneHash))
      .limit(1);

    if (lockout && lockout.lockedUntil && lockout.lockedUntil > new Date()) {
      throw Errors.unauthorized(`Too many verification attempts. Locked until ${lockout.lockedUntil.toLocaleTimeString()}`);
    }

    // Verify OTP against otpAttempts (Bug 1)
    const [latestAttempt] = await db
      .select()
      .from(otpAttempts)
      .where(
        and(
          eq(otpAttempts.phoneHash, phoneHash),
          eq(otpAttempts.verified, false)
        )
      )
      .orderBy(desc(otpAttempts.createdAt))
      .limit(1);

    const enteredOtpHash = hashSHA256(parsed.data.otp || "");
    if (!latestAttempt || latestAttempt.expiresAt <= new Date() || latestAttempt.otp !== enteredOtpHash) {
      // Increment lockout counter
      const currentAttempts = (lockout?.attempts ?? 0) + 1;
      const isLockoutThreshold = currentAttempts >= 5;
      const lockedUntil = isLockoutThreshold ? new Date(Date.now() + 15 * 60 * 1000) : null;

      if (lockout) {
        await db
          .update(otpLockouts)
          .set({
            attempts: currentAttempts,
            lockedUntil,
            updatedAt: new Date()
          })
          .where(eq(otpLockouts.phone, phoneHash));
      } else {
        await db.insert(otpLockouts).values({
          phone: phoneHash,
          attempts: currentAttempts,
          lockedUntil
        });
      }

      if (isLockoutThreshold) {
        throw Errors.unauthorized("Too many failed OTP verification attempts. Locked for 15 minutes.");
      }
      throw new AppError(
        ErrorCode.INVALID_OTP,
        "Invalid or expired OTP code.",
        401
      );
    }

    // Successfully verified! Update attempt and reset lockout
    await db
      .update(otpAttempts)
      .set({ verified: true })
      .where(eq(otpAttempts.id, latestAttempt.id));

    if (lockout) {
      await db
        .update(otpLockouts)
        .set({ attempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(otpLockouts.phone, phoneHash));
    }
    
    console.log(`[AUTH] Successfully verified OTP for phone: ${phone}`);
  }

  // Ensure phone is valid Indian phone format
  if (!isValidIndianPhone(phone)) {
    throw Errors.validation("Invalid phone number format.");
  }

  // ——— Find or Create User ———
  // Parents can join multiple tenants (e.g., multi-school families)
  const [existingUser] = await db
    .select()
    .from(users)
    .where(or(eq(users.phone, phoneHash), eq(users.phone, phone)))
    .limit(1);

  if (!existingUser) {
    // ——— NEW USER FLOW: Generate Registration Token ———
    const registrationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(registrationTokens).values({
      id: registrationToken,
      phone: phone, // Save plaintext phone number
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
          await tx
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
    // â”€â”€â”€ New Parent via Invite â”€â”€â”€
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
          phone: phoneHash,
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

      await tx
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
    // â”€â”€â”€ New Teacher (first-time signup) â”€â”€â”€
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
          phone: phoneHash,
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

  // â”€â”€â”€ Resolve All Linked Tenants for JWT â”€â”€â”€
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
