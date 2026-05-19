import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload, StudentResponse } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { updateStudent } from "../../services/students.js";

const updateStudentSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    rollNumber: z.string().trim().min(1).max(40).nullable().optional(),
    phone: z.string().trim().min(10).max(15).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export async function updateStudentHandler(c: Context) {
  const parsed = updateStudentSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const studentId = c.req.param("id")!;
  const updated = await updateStudent(user.tenantId, studentId, parsed.data);

  const response: ApiResponse<StudentResponse> = {
    success: true,
    data: updated,
  };

  return c.json(response, 200);
}
