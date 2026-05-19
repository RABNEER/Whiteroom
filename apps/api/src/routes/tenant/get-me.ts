import type { Context } from "hono";
import { db } from "../../lib/db.js";
import { tenants } from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import type { JWTPayload, ApiResponse, TenantInfo } from "@whiteroom/shared";
import { eq } from "@whiteroom/db";

/**
 * GET /api/v1/tenants/me
 *
 * Returns the authenticated user's tenant details.
 * Requires: authMiddleware.
 */
export async function getTenantMeHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);

  if (!tenant) {
    throw Errors.notFound("Tenant");
  }

  const response: ApiResponse<TenantInfo> = {
    success: true,
    data: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl ?? undefined,
      brandColor: tenant.brandColor ?? undefined,
      inviteCode: tenant.inviteCode,
      plan: user.plan,
    },
  };

  return c.json(response, 200);
}
