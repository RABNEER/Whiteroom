import { db } from "../lib/db.js";
import { classes, schedules } from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import { and, eq, isNull } from "drizzle-orm";

async function requireTenantClass(tenantId: string, classId: string) {
  const [classRow] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(
      and(
        eq(classes.id, classId),
        eq(classes.tenantId, tenantId),
        isNull(classes.deletedAt)
      )
    )
    .limit(1);

  if (!classRow) {
    throw Errors.notFound("Class");
  }
}

export async function createSchedules(
  tenantId: string,
  input: {
    classId: string;
    daysOfWeek: string[];
    startTime: string;
    endTime: string;
  }
) {
  await requireTenantClass(tenantId, input.classId);

  return db
    .insert(schedules)
    .values(
      input.daysOfWeek.map((dayOfWeek) => ({
        tenantId,
        classId: input.classId,
        dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
      }))
    )
    .returning();
}

export async function listSchedules(tenantId: string, classId?: string) {
  if (classId) {
    await requireTenantClass(tenantId, classId);
  }

  return db
    .select()
    .from(schedules)
    .where(
      classId
        ? and(eq(schedules.tenantId, tenantId), eq(schedules.classId, classId))
        : eq(schedules.tenantId, tenantId)
    );
}

export async function getSchedule(tenantId: string, scheduleId: string) {
  const [schedule] = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.id, scheduleId), eq(schedules.tenantId, tenantId)))
    .limit(1);

  if (!schedule) {
    throw Errors.notFound("Schedule");
  }

  return schedule;
}

export async function updateSchedule(
  tenantId: string,
  scheduleId: string,
  input: {
    classId?: string;
    dayOfWeek?: string;
    startTime?: string;
    endTime?: string;
  }
) {
  await getSchedule(tenantId, scheduleId);

  if (input.classId) {
    await requireTenantClass(tenantId, input.classId);
  }

  const [updated] = await db
    .update(schedules)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(schedules.id, scheduleId), eq(schedules.tenantId, tenantId)))
    .returning();

  return updated!;
}

export async function deleteSchedule(tenantId: string, scheduleId: string) {
  await getSchedule(tenantId, scheduleId);

  await db
    .delete(schedules)
    .where(and(eq(schedules.id, scheduleId), eq(schedules.tenantId, tenantId)));

  return { deleted: true };
}
