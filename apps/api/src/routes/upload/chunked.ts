import { Hono } from "hono";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { db } from "../../lib/db.js";
import { fileUploadSessions, fileUploadChunks, classroomFiles, classes, eq, and } from "@whiteroom/db";
import { Errors, UserRole } from "@whiteroom/shared";
import type { JWTPayload, ApiResponse } from "@whiteroom/shared";
import { uploadChunk } from "../../lib/cdn.js";
import { getBoss } from "../../lib/pgboss.js";
import { validateFileSize, validateMimeType } from "../../lib/storage.js";

const chunkedRoutes = new Hono<{ Variables: { user: JWTPayload } }>();

chunkedRoutes.use("*", authMiddleware);
chunkedRoutes.use("*", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN));

const uploadMutationLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 30,
  errorCode: "UPLOAD_MUTATION_LIMITED",
});

/**
 * POST /api/v1/upload/init
 * Initialize a chunked file upload session.
 */
chunkedRoutes.post("/init", uploadMutationLimiter, async (c) => {
  const user = c.get("user") as JWTPayload;
  const body = await c.req.json();

  const { classId, fileName, fileSize, mimeType, category = "General", checksum } = body;

  if (!classId || !fileName || !fileSize || !mimeType || !checksum) {
    throw Errors.validation("Missing required initialization parameters");
  }

  // Validate file size and type limits
  try {
    validateFileSize(fileSize);
    validateMimeType(mimeType);
  } catch (err: any) {
    throw Errors.validation(err.message);
  }

  // Verify class exists and belongs to the tenant
  const [classRow] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.tenantId, user.tenantId)))
    .limit(1);

  if (!classRow) {
    throw Errors.forbidden("Class not found in tenant");
  }

  // Calculate session expiry (24 hours from now)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Insert session record
  const [session] = await db
    .insert(fileUploadSessions)
    .values({
      tenantId: user.tenantId,
      classId,
      uploaderId: user.userId,
      fileName,
      fileSize,
      mimeType,
      category,
      checksum,
      status: "pending",
      expiresAt,
    })
    .returning();

  const response: ApiResponse = {
    success: true,
    data: {
      sessionId: session.id,
      chunkSize: 1024 * 1024, // 1MB chunks recommended
    },
  };

  return c.json(response, 201);
});

/**
 * POST /api/v1/upload/chunk
 * Upload a specific file chunk.
 */
chunkedRoutes.post("/chunk", uploadMutationLimiter, async (c) => {
  const user = c.get("user") as JWTPayload;

  const formData = await c.req.formData();
  const sessionId = formData.get("sessionId") as string;
  const chunkIndexStr = formData.get("chunkIndex") as string;
  const file = formData.get("file") as File | null;

  if (!sessionId || !chunkIndexStr || !file) {
    throw Errors.validation("Missing chunk parameters (sessionId, chunkIndex, file)");
  }

  const chunkIndex = Number(chunkIndexStr);
  if (isNaN(chunkIndex)) {
    throw Errors.validation("Invalid chunkIndex");
  }

  // Fetch session
  const [session] = await db
    .select()
    .from(fileUploadSessions)
    .where(
      and(
        eq(fileUploadSessions.id, sessionId),
        eq(fileUploadSessions.tenantId, user.tenantId)
      )
    )
    .limit(1);

  if (!session) {
    throw Errors.notFound("Upload session");
  }

  if (session.status !== "pending") {
    throw Errors.validation(`Session is not in pending state (status: ${session.status})`);
  }

  // Read file data into buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload chunk to temporary storage
  const storagePath = await uploadChunk(sessionId, chunkIndex, buffer);

  // Insert chunk record
  await db.transaction(async (tx) => {
    // Prevent duplicate chunk indices
    const [existing] = await tx
      .select()
      .from(fileUploadChunks)
      .where(
        and(
          eq(fileUploadChunks.sessionId, sessionId),
          eq(fileUploadChunks.chunkIndex, chunkIndex)
        )
      )
      .limit(1);

    if (existing) {
      // Overwrite/Update existing chunk in DB
      await tx
        .update(fileUploadChunks)
        .set({
          chunkSize: buffer.length,
          storagePath,
          createdAt: new Date(),
        })
        .where(eq(fileUploadChunks.id, existing.id));
    } else {
      await tx.insert(fileUploadChunks).values({
        tenantId: user.tenantId,
        sessionId,
        chunkIndex,
        chunkSize: buffer.length,
        storagePath,
      });
    }
  });

  const response: ApiResponse = {
    success: true,
    data: {
      chunkIndex,
      uploaded: true,
    },
  };

  return c.json(response, 200);
});

/**
 * POST /api/v1/upload/complete
 * Trigger session verification and background file assembly.
 */
chunkedRoutes.post("/complete", uploadMutationLimiter, async (c) => {
  const user = c.get("user") as JWTPayload;
  const body = await c.req.json();
  const { sessionId } = body;

  if (!sessionId) {
    throw Errors.validation("Session ID is required");
  }

  // Fetch session
  const [session] = await db
    .select()
    .from(fileUploadSessions)
    .where(
      and(
        eq(fileUploadSessions.id, sessionId),
        eq(fileUploadSessions.tenantId, user.tenantId)
      )
    )
    .limit(1);

  if (!session) {
    throw Errors.notFound("Upload session");
  }

  if (session.status !== "pending") {
    throw Errors.validation(`Session is already processing or completed (status: ${session.status})`);
  }

  // Get uploaded chunks
  const chunks = await db
    .select()
    .from(fileUploadChunks)
    .where(eq(fileUploadChunks.sessionId, sessionId));

  // Verify total size matches
  const totalUploadedSize = chunks.reduce((sum, chunk) => sum + chunk.chunkSize, 0);
  if (totalUploadedSize !== session.fileSize) {
    throw Errors.validation(
      `Uploaded chunks total size (${totalUploadedSize} bytes) does not match expected file size (${session.fileSize} bytes)`
    );
  }

  // Update session status to assembling
  await db
    .update(fileUploadSessions)
    .set({ status: "assembling" })
    .where(eq(fileUploadSessions.id, sessionId));

  // Queue background assembly task
  const boss = getBoss();
  await boss.send("assemble-file-upload", { sessionId });

  const response: ApiResponse = {
    success: true,
    data: {
      sessionId,
      status: "assembling",
    },
  };

  return c.json(response, 200);
});

/**
 * GET /api/v1/upload/status/:sessionId
 * Poll upload session status.
 */
chunkedRoutes.get("/status/:sessionId", async (c) => {
  const user = c.get("user") as JWTPayload;
  const sessionId = c.req.param("sessionId");

  if (!sessionId) {
    throw Errors.validation("Session ID is required");
  }

  const [session] = await db
    .select()
    .from(fileUploadSessions)
    .where(
      and(
        eq(fileUploadSessions.id, sessionId),
        eq(fileUploadSessions.tenantId, user.tenantId)
      )
    )
    .limit(1);

  if (!session) {
    throw Errors.notFound("Upload session");
  }

  let finalFile: any = null;
  if (session.status === "completed") {
    [finalFile] = await db
      .select()
      .from(classroomFiles)
      .where(
        and(
          eq(classroomFiles.classId, session.classId),
          eq(classroomFiles.checksum, session.checksum)
        )
      )
      .limit(1);
  }

  const response: ApiResponse = {
    success: true,
    data: {
      sessionId,
      status: session.status,
      file: finalFile,
    },
  };

  return c.json(response, 200);
});

export { chunkedRoutes };
