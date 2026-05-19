import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { enrollStudents } from "../../../services/classes.js";

const enrollSchema = z
  .object({
    studentId: z.string().min(1).optional(),
    studentIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((value) => value.studentId || value.studentIds, {
    message: "studentId or studentIds is required",
  });

export async function addStudentsToClassHandler(c: Context) {
  const parsed = enrollSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;
  const studentIds = parsed.data.studentIds ?? [parsed.data.studentId!];
  const result = await enrollStudents(user.tenantId, classId, studentIds);

  const response: ApiResponse<typeof result> = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
