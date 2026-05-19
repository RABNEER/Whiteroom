import { getBoss } from "../lib/pgboss.js";
import {
  enqueueAttendanceRemindersForNextWeek,
  registerAttendanceReminderWorker,
} from "./attendance-reminder.job.js";
import { registerAbsentNotificationWorker } from "./absent-notification.job.js";
import { registerSubscriptionExpiryWorker } from "./subscription-expiry.job.js";

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
    boss.createQueue("absent-follow-up"),
    boss.createQueue("subscription-expiry"),
  ]);

  await Promise.all([
    registerAttendanceReminderWorker(),
    registerAbsentNotificationWorker(),
    registerSubscriptionExpiryWorker(),
  ]);

  await enqueueAttendanceRemindersForNextWeek();
}
