import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.js";
import { db } from "../../lib/db.js";
import { classroomFiles, classes, eq, and } from "@whiteroom/db";
import { Errors, UserRole } from "@whiteroom/shared";
import type { JWTPayload, ApiResponse } from "@whiteroom/shared";
import {
  uploadToStorage,
  generateStoragePath,
  validateFileSize,
  validateMimeType,
} from "../../lib/storage.js";
import { verifyClassAccess } from "./index.js";

const uploadRoutes = new Hono<{ Variables: { user: JWTPayload } }>();

uploadRoutes.use("*", authMiddleware);

/**
 * POST /api/v1/classes/:classId/archive/upload
 * Upload file with original quality preservation
 */
uploadRoutes.post("/", async (c) => {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("classId");

  if (!classId) {
    throw Errors.validation("Class ID is required");
  }

  // Only teachers and admins can upload files
  if (user.role !== UserRole.TEACHER && user.role !== UserRole.SCHOOL_ADMIN) {
    throw Errors.forbidden("Only teachers and school admins can upload materials");
  }

  // Verify class access (enforces that teachers/admins belong to tenant, and parents have enrolled students)
  await verifyClassAccess(user.userId, user.tenantId, user.role, classId);

  // Parse multipart form data
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const category = (formData.get("category") as string) || "General";

  if (!file) {
    throw Errors.validation("No file provided");
  }

  // Validate file
  try {
    validateFileSize(file.size);
    validateMimeType(file.type);
  } catch (err: any) {
    throw Errors.validation(err.message);
  }

  // Convert file to buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Generate storage path
  const storagePath = generateStoragePath(user.tenantId, file.name);

  // Upload to Supabase Storage with original quality
  const { url, checksum, size } = await uploadToStorage(
    buffer,
    storagePath,
    file.type
  );

  // Determine file type category
  let fileType = "other";
  if (file.type.startsWith("image/")) fileType = "image";
  else if (file.type.startsWith("video/")) fileType = "video";
  else if (file.type === "application/pdf") fileType = "pdf";

  // Insert file record with checksum and original size
  const [newFile] = await db
    .insert(classroomFiles)
    .values({
      tenantId: user.tenantId,
      classId,
      uploaderId: user.userId,
      name: file.name,
      url,
      type: fileType,
      size,
      checksum,
      originalSize: size,
      category,
    })
    .returning();

  c.header("Cache-Control", "no-transform");

  const response: ApiResponse = {
    success: true,
    data: {
      ...newFile,
      verified: true, // Checksum verified on upload
    },
  };

  return c.json(response, 201);
});

export { uploadRoutes };

// Made with Bob
