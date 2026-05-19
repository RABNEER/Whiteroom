import type { Context } from "hono";
import { db } from "../../lib/db.js";
import { tenants } from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import type { ApiResponse, InviteResolveResponse } from "@whiteroom/shared";
import { eq, and } from "@whiteroom/db";

/**
 * GET /api/v1/invite/:code
 *
 * Resolve an invite code to the tenant's public info.
 * No auth required — parents use this to preview the institute before joining.
 * Returns tenant name, logo, and brand color only (no sensitive data).
 */
export async function resolveInviteHandler(c: Context) {
  const code = c.req.param("code");

  if (!code || code.length !== 6) {
    throw Errors.validation("Invalid invite code format.");
  }

  const [tenant] = await db
    .select({
      name: tenants.name,
      logoUrl: tenants.logoUrl,
      brandColor: tenants.brandColor,
      isActive: tenants.isActive,
    })
    .from(tenants)
    .where(
      and(
        eq(tenants.inviteCode, code.toUpperCase()),
        eq(tenants.isActive, true)
      )
    )
    .limit(1);

  if (!tenant) {
    throw Errors.notFound("Invite code");
  }

  const response: ApiResponse<InviteResolveResponse> = {
    success: true,
    data: {
      tenantName: tenant.name,
      logoUrl: tenant.logoUrl,
      brandColor: tenant.brandColor!,
    },
  };

  return c.json(response, 200);
}
