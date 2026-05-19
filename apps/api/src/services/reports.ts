import { db } from "../lib/db.js";
import {
  attendanceRecords,
  attendanceSessions,
  classes,
  reportsCache,
} from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import { and, eq, gte, isNull, lt } from "@whiteroom/db";

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw Errors.validation("Month must use YYYY-MM format");
  }

  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function getCachedReport<T>(tenantId: string, cacheKey: string) {
  const [cached] = await db
    .select()
    .from(reportsCache)
    .where(and(eq(reportsCache.tenantId, tenantId), eq(reportsCache.cacheKey, cacheKey)))
    .limit(1);

  if (cached && cached.expiresAt > new Date()) {
    return cached.value as T;
  }

  return null;
}

async function setCachedReport(tenantId: string, cacheKey: string, value: unknown) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db
    .insert(reportsCache)
    .values({ tenantId, cacheKey, value, expiresAt, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [reportsCache.tenantId, reportsCache.cacheKey],
      set: { value, expiresAt, updatedAt: new Date() },
    });
}

export async function getAttendanceSummary(tenantId: string, month: string) {
  const cacheKey = `attendance-summary:${month}`;
  const cached = await getCachedReport(tenantId, cacheKey);
  if (cached) {
    return cached;
  }

  const { startDate, endDate } = monthRange(month);
  const rows = await db
    .select({
      classId: attendanceSessions.classId,
      className: classes.name,
      status: attendanceRecords.status,
    })
    .from(attendanceSessions)
    .innerJoin(classes, eq(attendanceSessions.classId, classes.id))
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .where(
      and(
        eq(attendanceSessions.tenantId, tenantId),
        gte(attendanceSessions.date, startDate),
        lt(attendanceSessions.date, endDate),
        isNull(classes.deletedAt)
      )
    );

  const summary = {
    month,
    totalRecords: rows.filter((row) => row.status).length,
    present: rows.filter((row) => row.status === "present").length,
    absent: rows.filter((row) => row.status === "absent").length,
    late: rows.filter((row) => row.status === "late").length,
    byClass: Object.values(
      rows.reduce<Record<string, {
        classId: string;
        className: string;
        present: number;
        absent: number;
        late: number;
        total: number;
      }>>((acc, row) => {
        acc[row.classId] ??= {
          classId: row.classId,
          className: row.className,
          present: 0,
          absent: 0,
          late: 0,
          total: 0,
        };
        if (row.status === "present" || row.status === "absent" || row.status === "late") {
          acc[row.classId][row.status] += 1;
          acc[row.classId].total += 1;
        }
        return acc;
      }, {})
    ),
  };

  await setCachedReport(tenantId, cacheKey, summary);
  return summary;
}

export async function getClassStats(tenantId: string, classId: string) {
  const [classRow] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.tenantId, tenantId), isNull(classes.deletedAt)))
    .limit(1);

  if (!classRow) {
    throw Errors.notFound("Class");
  }

  const rows = await db
    .select({
      sessionId: attendanceSessions.id,
      date: attendanceSessions.date,
      totalPresent: attendanceSessions.totalPresent,
      totalAbsent: attendanceSessions.totalAbsent,
      totalStudents: attendanceSessions.totalStudents,
    })
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.tenantId, tenantId), eq(attendanceSessions.classId, classId)));

  const totalSessions = rows.length;
  const totalPresent = rows.reduce((sum, row) => sum + (row.totalPresent ?? 0), 0);
  const totalAbsent = rows.reduce((sum, row) => sum + (row.totalAbsent ?? 0), 0);
  const totalMarked = totalPresent + totalAbsent;

  return {
    classId,
    className: classRow.name,
    totalSessions,
    totalPresent,
    totalAbsent,
    attendanceRate: totalMarked === 0 ? 0 : Math.round((totalPresent / totalMarked) * 10000) / 100,
    sessions: rows,
  };
}
