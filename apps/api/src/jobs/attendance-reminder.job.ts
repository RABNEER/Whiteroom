import { db } from "../lib/db.js";
import { schedules, teacherProfiles, attendanceSessions } from "@whiteroom/db";
import { sendPushToUser } from "../lib/fcm.js";
import { getBoss } from "../lib/pgboss.js";
import { eq, and } from "@whiteroom/db";

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
  classId: string;
  tenantId: string;
  className: string;
  date: string;
  type: "start" | "reminder";
  message: string;
};

type AutoCloseJob = {
  classId: string;
  tenantId: string;
  className: string;
  date: string;
  type: "auto-close";
};

// FIX: No T+0/T+5/T+60 attendance reminders
export async function registerAttendanceReminderWorker() {
  const boss = getBoss();

  await boss.work<ReminderJob>("attendance-reminder", async ([job]) => {
    const { classId, tenantId, date, message } = job.data;

    // Check if session already marked (done or live)
    const [session] = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.classId, classId),
          eq(attendanceSessions.date, date)
        )
      )
      .limit(1);

    if (session && (session.status === "done" || session.status === "live")) {
      // Already marked or started manually, skip notification silently
      return;
    }

    // Send FCM to teachers
    const teachers = await db
      .select({ userId: teacherProfiles.userId })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.tenantId, tenantId));

    await Promise.all(
      teachers.map((teacher) =>
        sendPushToUser(tenantId, teacher.userId, {
          title: "Attendance Alert",
          body: message,
          type: "reminder",
        })
      )
    );
  });

  await boss.work<AutoCloseJob>("attendance-auto-close", async ([job]) => {
    const { classId, tenantId, date } = job.data;

    const [session] = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.classId, classId),
          eq(attendanceSessions.date, date)
        )
      )
      .limit(1);

    if (session) {
      if (session.status === "live") {
        // Auto close the live session
        await db
          .update(attendanceSessions)
          .set({ status: "done", completedAt: new Date() })
          .where(eq(attendanceSessions.id, session.id));
        console.log(`[Auto-Close] Session ${session.id} for class ${classId} on ${date} closed.`);
      }
    } else {
      // If session not created → create it with status 'not_taken'
      await db.insert(attendanceSessions).values({
        tenantId,
        classId,
        date,
        status: "not_taken",
        totalPresent: 0,
        totalAbsent: 0,
        totalStudents: 0,
      });
      console.log(`[Auto-Close] Session for class ${classId} on ${date} created as not_taken.`);
    }
  });
}

// FIX: No T+0/T+5/T+60 attendance reminders
export async function scheduleJobsForSchedule(schedule: {
  id: string;
  tenantId: string;
  classId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}) {
  const boss = getBoss();
  const { classes } = await import("@whiteroom/db");
  const [classRow] = await db
    .select({ name: classes.name })
    .from(classes)
    .where(eq(classes.id, schedule.classId))
    .limit(1);

  const className = classRow?.name ?? "Class";
  const now = new Date();

  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);

    if (dayNames[candidate.getDay()] !== schedule.dayOfWeek) {
      continue;
    }

    const [hours, minutes] = schedule.startTime.split(":").map(Number);
    const classStartTime = new Date(candidate);
    classStartTime.setHours(hours ?? 0, minutes ?? 0, 0, 0);

    if (classStartTime <= now) {
      continue;
    }

    const dateStr = candidate.toISOString().split("T")[0]!;

    // Job 1: T+0 — class started, mark attendance
    await boss.send(
      "attendance-reminder",
      {
        classId: schedule.classId,
        tenantId: schedule.tenantId,
        className,
        date: dateStr,
        type: "start",
        message: `${className} has started. Mark attendance now.`,
      },
      {
        startAfter: classStartTime,
        singletonKey: `reminder-start:${schedule.classId}:${dateStr}`,
      }
    );

    // Job 2: T+5 — reminder if not marked
    const t5Time = new Date(classStartTime.getTime() + 5 * 60 * 1000);
    await boss.send(
      "attendance-reminder",
      {
        classId: schedule.classId,
        tenantId: schedule.tenantId,
        className,
        date: dateStr,
        type: "reminder",
        message: `Reminder: ${className} attendance not yet marked.`,
      },
      {
        startAfter: t5Time,
        singletonKey: `reminder-t5:${schedule.classId}:${dateStr}`,
      }
    );

    // Job 3: T+60 — auto close session
    const t60Time = new Date(classStartTime.getTime() + 60 * 60 * 1000);
    await boss.send(
      "attendance-auto-close",
      {
        classId: schedule.classId,
        tenantId: schedule.tenantId,
        className,
        date: dateStr,
        type: "auto-close",
      },
      {
        startAfter: t60Time,
        singletonKey: `auto-close:${schedule.classId}:${dateStr}`,
      }
    );
  }
}

// FIX: No T+0/T+5/T+60 attendance reminders
export async function enqueueAttendanceRemindersForNextWeek() {
  const rows = await db.select().from(schedules);
  for (const schedule of rows) {
    try {
      await scheduleJobsForSchedule(schedule);
    } catch (err) {
      console.error(`Failed to schedule reminders for schedule ${schedule.id}:`, err);
    }
  }
}
