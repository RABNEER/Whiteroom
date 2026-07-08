import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { userBlocks, users } from "@whiteroom/db";
import { and, eq } from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";

const blockSchema = z.object({
  blockedUserId: z.string().min(1),
});

/**
 * POST /api/v1/chat/blocks
 */
export async function blockUserHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const body = await c.req.json();
  const parsed = blockSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const { blockedUserId } = parsed.data;

  if (blockedUserId === user.userId) {
    throw Errors.validation("You cannot block yourself.");
  }

  // Check if target user exists in same tenant
  const [targetUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, blockedUserId), eq(users.tenantId, user.tenantId)))
    .limit(1);

  if (!targetUser) {
    throw Errors.notFound("User to block");
  }

  // Insert block
  await db
    .insert(userBlocks)
    .values({
      tenantId: user.tenantId,
      userId: user.userId,
      blockedUserId,
    })
    .onConflictDoNothing();

  const response: ApiResponse<any> = {
    success: true,
    data: { blocked: true },
  };

  return c.json(response, 201);
}

/**
 * DELETE /api/v1/chat/blocks/:userId
 */
export async function unblockUserHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const blockedUserId = c.req.param("userId")!;

  if (blockedUserId === user.userId) {
    throw Errors.validation("You cannot unblock yourself.");
  }

  await db
    .delete(userBlocks)
    .where(
      and(
        eq(userBlocks.tenantId, user.tenantId),
        eq(userBlocks.userId, user.userId),
        eq(userBlocks.blockedUserId, blockedUserId)
      )
    );

  const response: ApiResponse<any> = {
    success: true,
    data: { unblocked: true },
  };

  return c.json(response, 200);
}

/**
 * GET /api/v1/chat/blocks
 */
export async function listBlockedUsersHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  const list = await db
    .select({
      blockedUserId: userBlocks.blockedUserId,
      name: users.name,
      role: users.role,
      createdAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .innerJoin(users, eq(userBlocks.blockedUserId, users.id))
    .where(and(eq(userBlocks.tenantId, user.tenantId), eq(userBlocks.userId, user.userId)));

  const response: ApiResponse<any[]> = {
    success: true,
    data: list,
  };

  return c.json(response, 200);
}
