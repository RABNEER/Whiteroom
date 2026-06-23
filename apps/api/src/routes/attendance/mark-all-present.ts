import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { markAllPresent } from "../../services/attendance.js";

const markAllPresentSchema = z.object({
  idempotencyKey: z.string().uuid().optional(),
  idempotency_key: z.string().uuid().optional(),
});

/**
 * POST /api/v1/attendance/sessions/:id/mark-all-present
 * 
 * One-tap attendance marking - marks all enrolled students as present
 * and sends instant FCM notifications to all parents.
 */
export async function markAllPresentHandler(c: Context) {
  const parsed = markAllPresentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const sessionId = c.req.param("id")!;
  const idempotencyKey =
    parsed.data.idempotencyKey ?? 
    parsed.data.idempotency_key ?? 
    crypto.randomUUID(); // Auto-generate if not provided

  const result = await markAllPresent(
    user.tenantId,
    sessionId,
    idempotencyKey
  );

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}

// Made with Bob
