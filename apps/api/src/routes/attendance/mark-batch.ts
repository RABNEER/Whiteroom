import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { markAttendanceBatch } from "../../services/attendance.js";

const markBatchSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(["present", "absent", "late"]),
      })
    )
    .min(1)
    .max(500),
  idempotencyKey: z.string().uuid().optional(),
  idempotency_key: z.string().uuid().optional(),
});

export async function markBatchHandler(c: Context) {
  const parsed = markBatchSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const sessionId = c.req.param("id")!;
  const idempotencyKey =
    parsed.data.idempotencyKey ?? parsed.data.idempotency_key;

  if (!idempotencyKey) {
    throw Errors.validation("idempotencyKey is required");
  }

  const result = await markAttendanceBatch(
    user.tenantId,
    sessionId,
    parsed.data.records,
    idempotencyKey
  );

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response);
}
