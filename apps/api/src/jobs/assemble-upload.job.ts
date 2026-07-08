import { db } from "../lib/db.js";
import { fileUploadSessions, fileUploadChunks, classroomFiles, eq, asc } from "@whiteroom/db";
import { getBoss } from "../lib/pgboss.js";
import { assembleChunks } from "../lib/cdn.js";

export async function registerAssembleUploadWorker() {
  const boss = getBoss();

  await boss.work<{ sessionId: string }>("assemble-file-upload", async ([job]) => {
    const { sessionId } = job.data;

    console.log(`📦 [Assemble-Upload] Starting assembly for session ${sessionId}`);

    // 1. Fetch session
    const [session] = await db
      .select()
      .from(fileUploadSessions)
      .where(eq(fileUploadSessions.id, sessionId))
      .limit(1);

    if (!session) {
      console.error(`📦 [Assemble-Upload] Session ${sessionId} not found`);
      return;
    }

    if (session.status !== "assembling") {
      console.warn(`📦 [Assemble-Upload] Session ${sessionId} is in status ${session.status}, skipping`);
      return;
    }

    try {
      // 2. Fetch chunks ordered by index ascending
      const chunks = await db
        .select()
        .from(fileUploadChunks)
        .where(eq(fileUploadChunks.sessionId, sessionId))
        .orderBy(asc(fileUploadChunks.chunkIndex));

      if (chunks.length === 0) {
        throw new Error(`No chunks found for session ${sessionId}`);
      }

      // Verify contiguous chunk index coverage
      for (let i = 0; i < chunks.length; i++) {
        if (chunks[i].chunkIndex !== i) {
          throw new Error(`Missing chunk at index ${i}`);
        }
      }

      const chunkPaths = chunks.map((c) => c.storagePath);

      // 3. Call CDN assembler
      const { url, size } = await assembleChunks(
        session.tenantId,
        session.id,
        session.fileName,
        session.mimeType,
        chunkPaths
      );

      // 4. Determine file category type
      let fileType = "other";
      if (session.mimeType.startsWith("image/")) fileType = "image";
      else if (session.mimeType.startsWith("video/")) fileType = "video";
      else if (session.mimeType === "application/pdf") fileType = "pdf";

      // 5. Insert final classroom file record
      await db.transaction(async (tx) => {
        await tx.insert(classroomFiles).values({
          tenantId: session.tenantId,
          classId: session.classId,
          uploaderId: session.uploaderId,
          name: session.fileName,
          url,
          type: fileType,
          size,
          checksum: session.checksum,
          originalSize: session.fileSize,
          category: session.category,
        });

        // Update session status to completed
        await tx
          .update(fileUploadSessions)
          .set({ status: "completed" })
          .where(eq(fileUploadSessions.id, sessionId));

        // Delete temporary chunks from DB (metadata)
        await tx
          .delete(fileUploadChunks)
          .where(eq(fileUploadChunks.sessionId, sessionId));
      });

      console.log(`📦 [Assemble-Upload] Successfully assembled and uploaded ${session.fileName} (${size} bytes)`);
    } catch (err) {
      console.error(`📦 [Assemble-Upload] Failed to assemble session ${sessionId}:`, err);
      
      // Update session status to failed
      await db
        .update(fileUploadSessions)
        .set({ status: "failed" })
        .where(eq(fileUploadSessions.id, sessionId));
      
      throw err; // Let pg-boss know the job failed
    }
  });
}
