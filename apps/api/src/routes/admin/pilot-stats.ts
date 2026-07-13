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
  tenants,
} from "@whiteroom/db";
import { count, desc, eq } from "@whiteroom/db";
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

    // Fetch user counts by role
    const usersByRoleRaw = await db
      .select({
        role: users.role,
        count: count(),
      })
      .from(users)
      .groupBy(users.role);

    const rolesBreakdown = {
      super_admin: 0,
      school_admin: 0,
      teacher: 0,
      parent: 0,
    };
    for (const row of usersByRoleRaw) {
      if (row.role in rolesBreakdown) {
        rolesBreakdown[row.role as keyof typeof rolesBreakdown] = Number(row.count);
      }
    }

    // Fetch tenants with details
    const activeSchools = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        address: tenants.address,
        phone: tenants.phone,
        createdAt: tenants.createdAt,
      })
      .from(tenants);

    // Fetch recent audit logs joined with user details
    const recentLogs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resource: auditLogs.resource,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
        actorName: users.name,
        actorRole: users.role,
        actorPhone: users.phone,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(20);

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
          rolesBreakdown,
        },
        activeSchools,
        recentActivity: recentLogs.map((log) => ({
          ...log,
          actor: log.actorName || log.actorPhone || "System / Guest",
          role: log.actorRole || "system",
        })),
      },
    });
  } catch (err) {
    console.error("❌ [Pilot Stats] Error fetching dashboard stats:", err);
    return c.json({ success: false, error: "Failed to load pilot telemetry" }, 500);
  }
}

