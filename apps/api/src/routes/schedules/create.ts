import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload, ScheduleResponse } from "@whiteroom/shared";
import { DayOfWeek, Errors } from "@whiteroom/shared";
import { createSchedules } from "../../services/schedules.js";

const dayValues = Object.values(DayOfWeek) as [string, ...string[]];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const createScheduleSchema = z
  .object({
    classId: z.string().min(1),
    dayOfWeek: z.enum(dayValues).optional(),
    daysOfWeek: z.array(z.enum(dayValues)).min(1).optional(),
    startTime: z.string().regex(timePattern),
    endTime: z.string().regex(timePattern),
  })
  .refine((value) => value.dayOfWeek || value.daysOfWeek, {
    message: "dayOfWeek or daysOfWeek is required",
  });

export async function createScheduleHandler(c: Context) {
  const parsed = createScheduleSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const daysOfWeek = parsed.data.daysOfWeek ?? [parsed.data.dayOfWeek!];
  const rows = await createSchedules(user.tenantId, {
    classId: parsed.data.classId,
    daysOfWeek: [...new Set(daysOfWeek)],
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
  });

  const response: ApiResponse<ScheduleResponse[]> = {
    success: true,
    data: rows,
  };

  return c.json(response, 201);
}
