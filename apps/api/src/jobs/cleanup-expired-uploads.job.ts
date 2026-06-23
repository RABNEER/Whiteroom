import { db } from "../lib/db.js";
import { fileUploadSessions, fileUploadChunks, lt, ne, eq } from "@whiteroom/db";
import { getBoss } from "../lib/pgboss.js";
import { deleteChunk } from "../lib/cdn.js";

/**
 * Worker to clean up expired chunk upload sessions and their temp storage files.
 */
export async function registerCleanupExpiredUploadsWorker() {
  const boss = getBoss();

  await boss.work("cleanup-expired-uploads", async () => {
    const now = new Date();

    // 1. Find all expired, non-completed sessions
    const expiredSessions = await db
      .select()
      .from(fileUploadSessions)
      .where(
        and(
          lt(fileUploadSessions.expiresAt, now),
          ne(fileUploadSessions.status, "completed")
        )
      );

    if (expiredSessions.length === 0) return;

    console.log(`🧹 [Upload-Cleanup] Found ${expiredSessions.length} expired upload sessions.`);

    for (const session of expiredSessions) {
      try {
        // 2. Fetch all chunks
        const chunks = await db
          .select()
          .from(fileUploadChunks)
          .where(eq(fileUploadChunks.sessionId, session.id));

        // 3. Delete each chunk file from storage
        for (const chunk of chunks) {
          await deleteChunk(chunk.storagePath).catch((err) => {
            console.error(`🧹 [Upload-Cleanup] Failed to delete chunk file ${chunk.storagePath}:`, err);
          });
        }

        // 4. Delete session from database (cascade deletes chunks metadata)
        await db
          .delete(fileUploadSessions)
          .where(eq(fileUploadSessions.id, session.id));

        console.log(`🧹 [Upload-Cleanup] Successfully purged session ${session.id} (${session.fileName})`);
      } catch (err) {
        console.error(`🧹 [Upload-Cleanup] Failed to clean up session ${session.id}:`, err);
      }
    }
  });
}

import { and } from "@whiteroom/db";

/**
 * Schedule the cleanup job to run every hour using pg-boss cron.
 */
export async function scheduleCleanupExpiredUploads() {
  const boss = getBoss();
  await boss.schedule("cleanup-expired-uploads", "0 * * * *");
}
