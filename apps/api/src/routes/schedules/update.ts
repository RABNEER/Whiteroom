import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload, ScheduleResponse } from "@whiteroom/shared";
import { DayOfWeek, Errors } from "@whiteroom/shared";
import { updateSchedule } from "../../services/schedules.js";

const dayValues = Object.values(DayOfWeek) as [string, ...string[]];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const updateScheduleSchema = z
  .object({
    classId: z.string().min(1).optional(),
    dayOfWeek: z.enum(dayValues).optional(),
    startTime: z.string().regex(timePattern).optional(),
    endTime: z.string().regex(timePattern).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export async function updateScheduleHandler(c: Context) {
  const parsed = updateScheduleSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const scheduleId = c.req.param("id")!;
  const updated = await updateSchedule(user.tenantId, scheduleId, parsed.data);

  const response: ApiResponse<ScheduleResponse> = {
    success: true,
    data: updated,
  };

  return c.json(response, 200);
}
