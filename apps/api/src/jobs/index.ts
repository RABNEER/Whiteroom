import { getBoss } from "../lib/pgboss.js";
import {
  enqueueAttendanceRemindersForNextWeek,
  registerAttendanceReminderWorker,
} from "./attendance-reminder.job.js";
import { registerAbsentNotificationWorker } from "./absent-notification.job.js";
import { registerSubscriptionExpiryWorker } from "./subscription-expiry.job.js";
import {
  registerRegistrationTokenCleanupWorker,
  scheduleRegistrationTokenCleanup,
} from "./registration-token-cleanup.job.js";
import { registerAssembleUploadWorker } from "./assemble-upload.job.js";
import {
  registerCleanupExpiredUploadsWorker,
  scheduleCleanupExpiredUploads,
} from "./cleanup-expired-uploads.job.js";

let started = false;

export async function startJobs() {
  if (started) {
    return;
  }
  started = true;

  const boss = getBoss();
  await boss.start();

  await Promise.all([
    boss.createQueue("attendance-reminder"),
    boss.createQueue("attendance-auto-close"),
    boss.createQueue("absent-follow-up"),
    boss.createQueue("subscription-expiry"),
    boss.createQueue("registration-token-cleanup"),
    boss.createQueue("assemble-file-upload"),
    boss.createQueue("cleanup-expired-uploads"),
  ]);

  await Promise.all([
    registerAttendanceReminderWorker(),
    registerAbsentNotificationWorker(),
    registerSubscriptionExpiryWorker(),
    registerRegistrationTokenCleanupWorker(),
    registerAssembleUploadWorker(),
    registerCleanupExpiredUploadsWorker(),
  ]);

  await scheduleRegistrationTokenCleanup().catch((err) => {
    console.error("[jobs] Failed to schedule token cleanup:", err);
  });

  await scheduleCleanupExpiredUploads().catch((err) => {
    console.error("[jobs] Failed to schedule expired uploads cleanup:", err);
  });

  await enqueueAttendanceRemindersForNextWeek();
}
