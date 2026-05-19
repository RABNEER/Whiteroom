import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { tenants } from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import type { JWTPayload, ApiResponse, TenantInfo } from "@whiteroom/shared";
import { eq } from "@whiteroom/db";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logoUrl: z.string().url().optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Brand color must be a valid hex color (e.g., #4F46E5)")
    .optional(),
});

/**
 * PATCH /api/v1/tenants/me
 *
 * Update the authenticated teacher's tenant details.
 * Requires: authMiddleware + requireRole("teacher").
 */
export async function updateTenantMeHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.logoUrl !== undefined) updates.logoUrl = parsed.data.logoUrl;
  if (parsed.data.brandColor !== undefined) updates.brandColor = parsed.data.brandColor;

  // Only update if there are actual changes beyond updatedAt
  if (Object.keys(updates).length <= 1) {
    throw Errors.validation("No fields to update.");
  }

  const [updated] = await db
    .update(tenants)
    .set(updates)
    .where(eq(tenants.id, user.tenantId))
    .returning();

  if (!updated) {
    throw Errors.notFound("Tenant");
  }

  const response: ApiResponse<TenantInfo> = {
    success: true,
    data: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      logoUrl: updated.logoUrl ?? undefined,
      brandColor: updated.brandColor ?? undefined,
      inviteCode: updated.inviteCode,
      plan: user.plan,
    },
  };

  return c.json(response, 200);
}
