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
  ]);

  await Promise.all([
    registerAttendanceReminderWorker(),
    registerAbsentNotificationWorker(),
    registerSubscriptionExpiryWorker(),
    registerRegistrationTokenCleanupWorker(),
  ]);

  await scheduleRegistrationTokenCleanup().catch((err) => {
    console.error("[jobs] Failed to schedule token cleanup:", err);
  });

  await enqueueAttendanceRemindersForNextWeek();
}
