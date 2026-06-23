import { Hono } from "hono";
import { db } from "../../lib/db.js";
import {
  classroomFiles,
  eq,
  and,
  classes,
  classEnrollments,
  students,
} from "@whiteroom/db";
import { authMiddleware } from "../../middleware/auth.js";
import { Errors, UserRole } from "@whiteroom/shared";
import type { JWTPayload, ApiResponse } from "@whiteroom/shared";
import { uploadRoutes } from "./upload.js";

// Explicitly define Hono variables to avoid 'never' generic type conflicts
const archiveRoutes = new Hono<{ Variables: { user: JWTPayload } }>();

// Mount upload sub-router
archiveRoutes.route("/upload", uploadRoutes);

// All archive routes require authentication
archiveRoutes.use("*", authMiddleware);

/**
 * Verify if the logged-in user can access files for this class.
 * School Admins & Teachers have access to classes in their tenant.
 * Parents have access if they have a student enrolled in the class.
 */
async function verifyClassAccess(
  userId: string,
  tenantId: string,
  role: string,
  classId: string
) {
  if (role === UserRole.SCHOOL_ADMIN || role === UserRole.TEACHER) {
    const [row] = await db
      .select()
      .from(classes)
      .where(
        and(
          eq(classes.id, classId),
          eq(classes.tenantId, tenantId)
        )
      )
      .limit(1);
    if (!row) {
      throw Errors.forbidden("Class not found in tenant");
    }
    return;
  }

  if (role === UserRole.PARENT) {
    const parentEnrollments = await db
      .select()
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .where(
        and(
          eq(classEnrollments.classId, classId),
          eq(students.parentId, userId),
          eq(students.tenantId, tenantId)
        )
      )
      .limit(1);

    if (parentEnrollments.length === 0) {
      throw Errors.forbidden("Unauthorized: Parent does not have a student enrolled in this class");
    }
    return;
  }

  throw Errors.forbidden("Unauthorized access to class archive");
}

// 1. GET /api/v1/classes/:classId/archive - List files and categories
archiveRoutes.get("/", async (c) => {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("classId");

  if (!classId) {
    throw Errors.validation("Class ID is required");
  }

  await verifyClassAccess(user.userId, user.tenantId, user.role, classId);

  const files = await db
    .select()
    .from(classroomFiles)
    .where(
      and(
        eq(classroomFiles.classId, classId),
        eq(classroomFiles.tenantId, user.tenantId)
      )
    )
    .orderBy(classroomFiles.createdAt);

  const response: ApiResponse = {
    success: true,
    data: files,
  };
  return c.json(response, 200);
});

// 2. POST /api/v1/classes/:classId/archive - Upload study file
archiveRoutes.post("/", async (c) => {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("classId");

  if (!classId) {
    throw Errors.validation("Class ID is required");
  }

  // Only teachers and admins can upload files
  if (user.role !== UserRole.TEACHER && user.role !== UserRole.SCHOOL_ADMIN) {
    throw Errors.forbidden("Only teachers and school admins can upload materials");
  }

  await verifyClassAccess(user.userId, user.tenantId, user.role, classId);

  const body = await c.req.json().catch(() => ({}));
  const { name, url, type, size, category } = body;

  if (!name || !url || !type || typeof size !== "number") {
    throw Errors.validation("Missing name, url, type or valid size in payload");
  }

  const valuesObj: any = {
    tenantId: user.tenantId,
    classId,
    uploaderId: user.userId,
    name,
    url,
    type,
    size,
    category: category || "General",
  };

  const [newFile] = await db
    .insert(classroomFiles)
    .values(valuesObj)
    .returning();

  const response: ApiResponse = {
    success: true,
    data: newFile,
  };
  return c.json(response, 201);
});

// 3. DELETE /api/v1/classes/:classId/archive/:fileId - Delete file
archiveRoutes.delete("/:fileId", async (c) => {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("classId");
  const fileId = c.req.param("fileId");

  if (!classId) {
    throw Errors.validation("Class ID is required");
  }

  // Only teachers and admins can delete files
  if (user.role !== UserRole.TEACHER && user.role !== UserRole.SCHOOL_ADMIN) {
    throw Errors.forbidden("Only teachers and school admins can delete materials");
  }

  await verifyClassAccess(user.userId, user.tenantId, user.role, classId);

  const [deletedFile] = await db
    .delete(classroomFiles)
    .where(
      and(
        eq(classroomFiles.id, fileId),
        eq(classroomFiles.classId, classId),
        eq(classroomFiles.tenantId, user.tenantId)
      )
    )
    .returning();

  if (!deletedFile) {
    throw Errors.notFound("File");
  }

  const response: ApiResponse = {
    success: true,
    data: { id: fileId },
  };
  return c.json(response, 200);
});

export { archiveRoutes };
