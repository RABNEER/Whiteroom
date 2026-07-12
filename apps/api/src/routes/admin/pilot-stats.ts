import type { Context } from "hono";
import { db } from "../../lib/db.js";
import {
  students,
  users,
  attendanceSessions,
  announcements,
  messages,
  classroomFiles,
  auditLogs,
} from "@whiteroom/db";
import { count, desc } from "@whiteroom/db";
import { env } from "../../lib/env.js";

export async function pilotStatsHandler(c: Context) {
  try {
    const [
      studentCount,
      userCount,
      attendanceCount,
      announcementCount,
      messageCount,
      fileCount,
    ] = await Promise.all([
      db.select({ count: count() }).from(students),
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(attendanceSessions),
      db.select({ count: count() }).from(announcements),
      db.select({ count: count() }).from(messages),
      db.select({ count: count() }).from(classroomFiles),
    ]);

    const recentLogs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resource: auditLogs.resource,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(15);

    return c.json({
      success: true,
      data: {
        environment: env.NODE_ENV,
        uptimeSeconds: Math.floor(process.uptime()),
        storagePath: env.LOCAL_STORAGE_PATH || "G:\\My Drive\\Whiteroom",
        metrics: {
          students: studentCount[0]?.count ?? 0,
          totalUsers: userCount[0]?.count ?? 0,
          attendanceSessions: attendanceCount[0]?.count ?? 0,
          announcements: announcementCount[0]?.count ?? 0,
          chatMessages: messageCount[0]?.count ?? 0,
          studyMaterials: fileCount[0]?.count ?? 0,
        },
        recentActivity: recentLogs,
      },
    });
  } catch (err) {
    console.error("❌ [Pilot Stats] Error fetching dashboard stats:", err);
    return c.json({ success: false, error: "Failed to load pilot telemetry" }, 500);
  }
}
