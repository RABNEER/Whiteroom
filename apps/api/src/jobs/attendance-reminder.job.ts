import { db } from "../lib/db.js";
import { schedules, teacherProfiles } from "@whiteroom/db";
import { sendPushToUser } from "../lib/fcm.js";
import { getBoss } from "../lib/pgboss.js";
import { eq } from "@whiteroom/db";

const dayNames = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

type ReminderJob = {
  tenantId: string;
  classId: string;
  startTime: string;
};

export async function registerAttendanceReminderWorker() {
  const boss = getBoss();

  await boss.work<ReminderJob>("attendance-reminder", async ([job]) => {
    const data = job.data;
    const teachers = await db
      .select({ userId: teacherProfiles.userId })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.tenantId, data.tenantId));

    await Promise.all(
      teachers.map((teacher) =>
        sendPushToUser(data.tenantId, teacher.userId, {
          title: "Mark attendance",
          body: `Class starts at ${data.startTime}.`,
          type: "reminder",
        })
      )
    );
  });
}

export async function enqueueAttendanceRemindersForNextWeek() {
  const boss = getBoss();
  const rows = await db.select().from(schedules);
  const now = new Date();

  for (const schedule of rows) {
    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + offset);

      if (dayNames[candidate.getDay()] !== schedule.dayOfWeek) {
        continue;
      }

      const [hours, minutes] = schedule.startTime.split(":").map(Number);
      candidate.setHours(hours ?? 0, minutes ?? 0, 0, 0);
      candidate.setMinutes(candidate.getMinutes() - 15);

      if (candidate <= now) {
        continue;
      }

      await boss.send(
        "attendance-reminder",
        {
          tenantId: schedule.tenantId,
          classId: schedule.classId,
          startTime: schedule.startTime,
        },
        { startAfter: candidate }
      );
    }
  }
}
