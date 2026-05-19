import type { Context } from "hono";
import { db } from "../../lib/db.js";
import { tenants } from "@whiteroom/db";
import { generateInviteCode } from "../../lib/otp.js";
import type { JWTPayload, ApiResponse, InviteGenerateResponse } from "@whiteroom/shared";
import { eq } from "@whiteroom/db";

/**
 * POST /api/v1/invite
 *
 * Generate a new 6-char invite code for the teacher's tenant.
 * Replaces any existing invite code (one active code per tenant).
 * Requires: authMiddleware + requireRole("teacher").
 */
export async function generateInviteHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const inviteCode = generateInviteCode();

  await db
    .update(tenants)
    .set({ inviteCode, updatedAt: new Date() })
    .where(eq(tenants.id, user.tenantId));

  const response: ApiResponse<InviteGenerateResponse> = {
    success: true,
    data: { inviteCode },
  };

  return c.json(response, 200);
}
