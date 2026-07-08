import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { userTenants, users, tenants } from "@whiteroom/db";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import { getTenantPlanTier } from "../../lib/subscription.js";
import { hashSHA256 } from "../../lib/otp.js";
import { Errors, AppError, ErrorCode, PlanTier } from "@whiteroom/shared";
import type { ApiResponse, OTPVerifyResponse, JWTPayload } from "@whiteroom/shared";
import { eq, and } from "@whiteroom/db";

const switchTenantSchema = z.object({
  tenantId: z.string().min(1),
});

/**
 * POST /api/v1/auth/switch-tenant
 *
 * 1. Validate request body
 * 2. Verify user belongs to the requested tenantId
 * 3. Update active_tenant mapping in database
 * 4. Issue new access and refresh JWT pair
 */
export async function switchTenantHandler(c: Context) {
  // Switch active tenant for users (including parents with multiple tenant associations)
  const user = c.get("user") as JWTPayload;
  if (!user) {
    throw Errors.unauthorized();
  }

  const body = await c.req.json();
  const parsed = switchTenantSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("tenantId is required.");
  }

  const targetTenantId = parsed.data.tenantId;

  // Check if mapping exists for this user and tenant
  const [mapping] = await db
    .select()
    .from(userTenants)
    .where(and(eq(userTenants.userId, user.userId), eq(userTenants.tenantId, targetTenantId)))
    .limit(1);

  if (!mapping) {
    throw Errors.forbidden("You do not have access to this tenant.");
  }

  // Update active flags
  await db.transaction(async (tx) => {
    await tx
      .update(userTenants)
      .set({ activeTenant: false })
      .where(eq(userTenants.userId, user.userId));

    await tx
      .update(userTenants)
      .set({ activeTenant: true })
      .where(eq(userTenants.id, mapping.id));
  });

  // Query all linked tenants to build tenants payload for JWT and return them in response
  const userTenantRecords = await db
    .select({
      tenantId: userTenants.tenantId,
      role: userTenants.role,
      status: userTenants.status,
      tenantName: tenants.name,
    })
    .from(userTenants)
    .innerJoin(tenants, eq(userTenants.tenantId, tenants.id))
    .where(eq(userTenants.userId, user.userId));

  const tenantsPayload = userTenantRecords.map((r) => ({
    tenantId: r.tenantId,
    role: r.role,
    status: r.status,
  }));

  const plan = await getTenantPlanTier(targetTenantId);
  const jwtPayload: JWTPayload = {
    userId: user.userId,
    tenantId: targetTenantId,
    role: mapping.role,
    plan,
    activeTenantId: targetTenantId,
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
    .where(eq(users.id, user.userId));

  const response: ApiResponse<OTPVerifyResponse> = {
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.userId,
        role: mapping.role,
        tenantId: targetTenantId,
        tenants: userTenantRecords.map((r) => ({
          tenantId: r.tenantId,
          role: r.role,
          status: r.status,
          tenantName: r.tenantName,
        })),
      },
      isNewUser: false,
    },
  };

  return c.json(response, 200);
}
