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
import { registerBillingCronWorker } from "./billing-cron.job.js";

let started = false;

export async function startJobs() {
  if (started) {
    return;
  }
  started = true;

  const boss = getBoss();
  await boss.start();

  const queues = [
    "attendance-reminder",
    "attendance-auto-close",
    "absent-follow-up",
    "subscription-expiry",
    "registration-token-cleanup",
    "assemble-file-upload",
    "cleanup-expired-uploads",
    "subscription-student-invoice",
  ];

  for (const queue of queues) {
    await boss.createQueue(queue);
  }

  await Promise.all([
    registerAttendanceReminderWorker(),
    registerAbsentNotificationWorker(),
    registerSubscriptionExpiryWorker(),
    registerRegistrationTokenCleanupWorker(),
    registerAssembleUploadWorker(),
    registerCleanupExpiredUploadsWorker(),
    registerBillingCronWorker(),
  ]);

  await scheduleRegistrationTokenCleanup().catch((err) => {
    console.error("[jobs] Failed to schedule token cleanup:", err);
  });

  await scheduleCleanupExpiredUploads().catch((err) => {
    console.error("[jobs] Failed to schedule expired uploads cleanup:", err);
  });

  await enqueueAttendanceRemindersForNextWeek();
}
