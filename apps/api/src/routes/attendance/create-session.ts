import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { createAttendanceSession } from "../../services/attendance.js";

const createSessionSchema = z.object({
  classId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

export async function createSessionHandler(c: Context) {
  const parsed = createSessionSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const session = await createAttendanceSession(user.tenantId, parsed.data);

  const response: ApiResponse = {
    success: true,
    data: session,
  };

  return c.json(response, 201);
}
