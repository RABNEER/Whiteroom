import type { Context } from "hono";
import crypto from "node:crypto";
import { db } from "./db.js";
import {
  registrationTokens,
  users,
  tenants,
  parentProfiles,
  teacherProfiles,
  consentLogs,
  userTenants,
  eq,
  and,
  count,
  gte,
} from "@whiteroom/db";
import { hashSHA256 } from "./otp.js";
import { signAccessToken, signRefreshToken } from "./jwt.js";
import { getTenantPlanTier } from "./subscription.js";
import {
  Errors,
  UserRole,
} from "@whiteroom/shared";
import type { ApiResponse, JWTPayload, OTPVerifyResult } from "@whiteroom/shared";

export async function completeVerifiedPhoneAuth(
  c: Context,
  input: {
    phone: string;
    phoneHash: string;
    firebaseUid: string;
    inviteCode?: string;
    role?: string;
  }
) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [attemptCount] = await db
    .select({ total: count() })
    .from(registrationTokens)
    .where(
      and(
        eq(registrationTokens.phone, input.phone),
        gte(registrationTokens.createdAt, oneHourAgo),
      ),
    );

  if (attemptCount && attemptCount.total > 5) {
    throw Errors.rateLimited(
      "Too many registration attempts. Please try again in an hour.",
    );
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.phone, input.phoneHash))
    .limit(1);

  if (!existingUser) {
    const registrationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(registrationTokens).values({
      id: registrationToken,
      phone: input.phoneHash, // Store hashed phone number
      firebaseUid: input.firebaseUid,
      expiresAt,
    });

    const response: ApiResponse<OTPVerifyResult> = {
      success: true,
      data: {
        type: "new_user",
        registrationToken,
      },
    };

    return c.json(response, 200);
  }

  const userId = existingUser.id;
  let tenantId: string;
  let role: string;

  if (input.inviteCode) {
    const targetRole = input.role === UserRole.TEACHER ? UserRole.TEACHER : UserRole.PARENT;
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.inviteCode, input.inviteCode))
      .limit(1);

    if (!tenant) {
      throw Errors.notFound("Invite code");
    }

    const [existingMapping] = await db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenant.id)))
      .limit(1);

    await db.transaction(async (tx) => {
      await tx
        .update(userTenants)
        .set({ activeTenant: false })
        .where(eq(userTenants.userId, userId));

      if (existingMapping) {
        await tx
          .update(userTenants)
          .set({ activeTenant: true, role: targetRole })
          .where(eq(userTenants.id, existingMapping.id));
        return;
      }

      await tx.insert(userTenants).values({
        userId,
        tenantId: tenant.id,
        role: targetRole,
        status: "active",
        activeTenant: true,
      });

      if (targetRole === UserRole.TEACHER) {
        await tx.insert(teacherProfiles).values({
          userId,
          tenantId: tenant.id,
        });
      } else {
        await tx.insert(parentProfiles).values({
          userId,
          tenantId: tenant.id,
        });
      }

      await tx.insert(consentLogs).values({
        userId,
        tenantId: tenant.id,
        consentType: "data_processing",
        ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
      });

      await tx
        .update(users)
        .set({ role: targetRole, tenantId: tenant.id, updatedAt: new Date() })
        .where(eq(users.id, userId));
    });

    tenantId = tenant.id;
    role = targetRole;
  } else {
    const userMappings = await db
      .select()
      .from(userTenants)
      .where(eq(userTenants.userId, userId));

    if (userMappings.length === 0) {
      tenantId = existingUser.tenantId ?? "";
      role = existingUser.role;

      if (tenantId) {
        await db.insert(userTenants).values({
          userId,
          tenantId,
          role,
          status: "active",
          activeTenant: true,
        });
      }
    } else {
      const activeMapping = userMappings.find((mapping) => mapping.activeTenant) ?? userMappings[0]!;
      tenantId = activeMapping.tenantId;
      role = activeMapping.role;
    }
  }

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

  const tenantsPayload = userTenantRecords.map((record) => ({
    tenantId: record.tenantId,
    role: record.role,
    status: record.status,
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

  const response: ApiResponse<OTPVerifyResult> = {
    success: true,
    data: {
      type: "existing_user",
      accessToken,
      refreshToken,
      user: {
        id: userId,
        role,
        tenantId,
        tenants: userTenantRecords.map((record) => ({
          tenantId: record.tenantId,
          role: record.role,
          status: record.status,
          tenantName: record.tenantName,
        })),
      },
      isNewUser: false,
    },
  };

  return c.json(response, 200);
}
