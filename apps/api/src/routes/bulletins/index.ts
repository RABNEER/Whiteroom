import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.js";
import { Errors, UserRole } from "@whiteroom/shared";
import type { JWTPayload, ApiResponse } from "@whiteroom/shared";
import { db } from "../../lib/db.js";
import {
  bulletins,
  bulletinReads,
  users,
  eq,
  and,
  isNull,
} from "@whiteroom/db";

const bulletinsRoutes = new Hono<{ Variables: { user: JWTPayload } }>();

bulletinsRoutes.use("*", authMiddleware);

// 1. GET /api/v1/bulletins - Retrieve bulletins (optionally filtered by classId)
bulletinsRoutes.get("/", async (c) => {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.query("classId");

  let list;
  if (classId) {
    list = await db
      .select()
      .from(bulletins)
      .where(
        and(
          eq(bulletins.classId, classId),
          eq(bulletins.tenantId, user.tenantId)
        )
      )
      .orderBy(bulletins.createdAt);
  } else {
    // School-wide bulletins (classId is null)
    list = await db
      .select()
      .from(bulletins)
      .where(
        and(
          isNull(bulletins.classId),
          eq(bulletins.tenantId, user.tenantId)
        )
      )
      .orderBy(bulletins.createdAt);
  }

  // Fetch read statuses for this user
  const readList = await db
    .select({ bulletinId: bulletinReads.bulletinId })
    .from(bulletinReads)
    .where(
      and(
        eq(bulletinReads.userId, user.userId),
        eq(bulletinReads.tenantId, user.tenantId)
      )
    );
  
  const readSet = new Set(readList.map((r) => r.bulletinId));

  const data = list.map((b) => ({
    ...b,
    isRead: readSet.has(b.id),
  }));

  const response: ApiResponse = {
    success: true,
    data,
  };
  return c.json(response, 200);
});

// 2. POST /api/v1/bulletins - Create a bulletin (restricted to teachers/admins)
bulletinsRoutes.post("/", async (c) => {
  const user = c.get("user") as JWTPayload;

  if (user.role !== UserRole.TEACHER && user.role !== UserRole.SCHOOL_ADMIN) {
    throw Errors.forbidden("Only teachers and school admins can publish bulletins");
  }

  const body = await c.req.json().catch(() => ({}));
  const { title, body: contentText, category, classId } = body;

  if (!title || !contentText || !category) {
    throw Errors.validation("Title, body, and category are required");
  }

  const validCategories = ["FEES", "EXAM", "HOLIDAY", "GENERAL"];
  if (!validCategories.includes(category)) {
    throw Errors.validation("Category must be FEES, EXAM, HOLIDAY, or GENERAL");
  }

  const [newBulletin] = await db
    .insert(bulletins)
    .values({
      tenantId: user.tenantId,
      classId: classId || null,
      authorId: user.userId,
      title,
      body: contentText,
      category,
    })
    .returning();

  const response: ApiResponse = {
    success: true,
    data: newBulletin,
  };
  return c.json(response, 201);
});

// 3. POST /api/v1/bulletins/:id/read - Mark bulletin as read
bulletinsRoutes.post("/:id/read", async (c) => {
  const user = c.get("user") as JWTPayload;
  const bulletinId = c.req.param("id");

  const [bulletin] = await db
    .select()
    .from(bulletins)
    .where(
      and(
        eq(bulletins.id, bulletinId),
        eq(bulletins.tenantId, user.tenantId)
      )
    )
    .limit(1);

  if (!bulletin) {
    throw Errors.notFound("Bulletin");
  }

  await db
    .insert(bulletinReads)
    .values({
      tenantId: user.tenantId,
      bulletinId,
      userId: user.userId,
    })
    .onConflictDoNothing()
    .returning();

  const response: ApiResponse = {
    success: true,
    data: { read: true, id: bulletinId },
  };
  return c.json(response, 200);
});

// 4. GET /api/v1/bulletins/:id/receipts - Fetch seen stats for a bulletin
bulletinsRoutes.get("/:id/receipts", async (c) => {
  const user = c.get("user") as JWTPayload;
  const bulletinId = c.req.param("id");

  const [bulletin] = await db
    .select()
    .from(bulletins)
    .where(
      and(
        eq(bulletins.id, bulletinId),
        eq(bulletins.tenantId, user.tenantId)
      )
    )
    .limit(1);

  if (!bulletin) {
    throw Errors.notFound("Bulletin");
  }

  // Only teachers/admins can view read receipt lists
  if (user.role !== UserRole.TEACHER && user.role !== UserRole.SCHOOL_ADMIN) {
    throw Errors.forbidden("Only teachers and school admins can view read receipts");
  }

  const reads = await db
    .select({
      userId: bulletinReads.userId,
      readAt: bulletinReads.readAt,
      phone: users.phone,
      role: users.role,
    })
    .from(bulletinReads)
    .innerJoin(users, eq(bulletinReads.userId, users.id))
    .where(
      and(
        eq(bulletinReads.bulletinId, bulletinId),
        eq(bulletinReads.tenantId, user.tenantId)
      )
    );

  const response: ApiResponse = {
    success: true,
    data: {
      bulletinId,
      seenCount: reads.length,
      seenBy: reads,
    },
  };
  return c.json(response, 200);
});

export { bulletinsRoutes };
