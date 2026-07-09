import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, ClassResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { createClass } from "../../services/classes.js";

const createClassSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(80).optional(),
  teacherName: z.string().trim().min(1).max(120).optional(),
});

export async function createClassHandler(c: Context) {
  const parsed = createClassSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const created = await createClass(user.tenantId, user.userId, user.plan, parsed.data);

  const response: ApiResponse<ClassResponse> = {
    success: true,
    data: created,
  };

  return c.json(response, 201);
}
