import { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { userTenants, notifications, deviceTokens, desc } from "@whiteroom/db";
import { and, eq, inArray } from "@whiteroom/db";
import { Errors, UserRole } from "@whiteroom/shared";
import { sendPushToUsers } from "../../lib/fcm.js";

const broadcastSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  body: z.string().min(1, "Body is required").max(500),
  targetRole: z.enum(["all", "parents", "teachers", "admins"]).default("all"),
  targetTenantId: z.string().optional(),
  deepLink: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

/**
 * POST /api/v1/admin/broadcast-notification
 * Allows School Admins & Super Admins to send marketing/engagement push notification blasts.
 */
export async function sendBroadcastNotificationHandler(c: Context) {
  const user = c.get("user") as {
    userId: string;
    role: string;
    tenantId: string;
  };

  if (!user) {
    throw Errors.unauthorized();
  }

  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = broadcastSchema.safeParse(rawBody);

  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid broadcast request body",
          details: parseResult.error.flatten().fieldErrors,
        },
      },
      400
    );
  }

  const { title, body, targetRole, targetTenantId, deepLink, imageUrl } =
    parseResult.data;

  // School Admins can only broadcast to their own school/tenant
  const effectiveTenantId =
    user.role === UserRole.SUPER_ADMIN && targetTenantId
      ? targetTenantId
      : user.tenantId;

  // 1. Resolve role filter
  let rolesToQuery: string[] = [];
  if (targetRole === "parents") {
    rolesToQuery = [UserRole.PARENT];
  } else if (targetRole === "teachers") {
    rolesToQuery = [UserRole.TEACHER];
  } else if (targetRole === "admins") {
    rolesToQuery = [UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN];
  } else {
    // "all"
    rolesToQuery = [
      UserRole.PARENT,
      UserRole.TEACHER,
      UserRole.SCHOOL_ADMIN,
      UserRole.SUPER_ADMIN,
    ];
  }

  // 2. Query target active users
  const conditions = [
    inArray(userTenants.role, rolesToQuery),
    eq(userTenants.status, "active"),
  ];

  if (effectiveTenantId) {
    conditions.push(eq(userTenants.tenantId, effectiveTenantId));
  }

  const activeUsers = await db
    .select({
      userId: userTenants.userId,
      tenantId: userTenants.tenantId,
      role: userTenants.role,
    })
    .from(userTenants)
    .where(and(...conditions));

  if (activeUsers.length === 0) {
    return c.json({
      success: true,
      data: {
        sentCount: 0,
        targetRole,
        message: "No active users found for the selected audience.",
      },
    });
  }

  // 3. Group by tenant to dispatch FCM multicast batches
  const usersByTenant = new Map<string, string[]>();
  for (const u of activeUsers) {
    const list = usersByTenant.get(u.tenantId) || [];
    list.push(u.userId);
    usersByTenant.set(u.tenantId, list);
  }

  const extraData: Record<string, string> = {
    type: "broadcast",
    targetRole,
  };
  if (deepLink) {
    extraData.deepLink = deepLink;
  }

  // 4. Dispatch push notifications per tenant (fire-and-forget background push)
  for (const [tId, userIds] of usersByTenant.entries()) {
    sendPushToUsers(tId, userIds, {
      title,
      body,
      type: "broadcast",
      imageUrl,
      data: extraData,
    }).catch((err) => {
      console.error(`[Broadcast] Failed to send push for tenant ${tId}:`, err);
    });
  }

  return c.json({
    success: true,
    data: {
      sentCount: activeUsers.length,
      targetRole,
      title,
      body,
      tenantId: effectiveTenantId || "all",
      message: `Broadcast successfully queued for ${activeUsers.length} users.`,
    },
  });
}

/**
 * GET /api/v1/admin/broadcast-notification/history
 * Returns recent broadcast notifications.
 */
export async function getBroadcastHistoryHandler(c: Context) {
  const user = c.get("user") as {
    userId: string;
    role: string;
    tenantId: string;
  };

  if (!user) {
    throw Errors.unauthorized();
  }

  const conditions = [eq(notifications.type, "broadcast")];
  if (user.role !== UserRole.SUPER_ADMIN && user.tenantId) {
    conditions.push(eq(notifications.tenantId, user.tenantId));
  }

  const recentBroadcasts = await db
    .select({
      id: notifications.id,
      tenantId: notifications.tenantId,
      title: notifications.title,
      body: notifications.body,
      type: notifications.type,
      sentAt: notifications.sentAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return c.json({
    success: true,
    data: {
      broadcasts: recentBroadcasts,
    },
  });
}
