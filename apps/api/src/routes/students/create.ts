import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload, StudentResponse } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { createStudent } from "../../services/students.js";

const createStudentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  rollNumber: z.string().trim().min(1).max(40).optional(),
  phone: z.string().trim().min(10).max(15).optional(),
});

export async function createStudentHandler(c: Context) {
  const parsed = createStudentSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const created = await createStudent(user.tenantId, user.plan, parsed.data);

  const response: ApiResponse<StudentResponse> = {
    success: true,
    data: created,
  };

  return c.json(response, 201);
}
