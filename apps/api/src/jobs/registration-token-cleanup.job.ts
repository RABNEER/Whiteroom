import { db } from "../lib/db.js";
import { registrationTokens } from "@whiteroom/db";
import { lt } from "@whiteroom/db";
import { getBoss } from "../lib/pgboss.js";

/**
 * Worker to process expired registration token deletion.
 */
export async function registerRegistrationTokenCleanupWorker() {
  const boss = getBoss();

  await boss.work("registration-token-cleanup", async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const deleted = await db
      .delete(registrationTokens)
      .where(lt(registrationTokens.expiresAt, oneHourAgo))
      .returning();

    if (deleted.length > 0) {
      console.log(`🧹 [Token-Cleanup] Purged ${deleted.length} expired registration tokens.`);
    }
  });
}

/**
 * Schedules the cleanup job to run every hour using cron.
 */
export async function scheduleRegistrationTokenCleanup() {
  const boss = getBoss();
  await boss.schedule("registration-token-cleanup", "0 * * * *");
}
