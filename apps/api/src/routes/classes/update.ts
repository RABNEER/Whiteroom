import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, ClassResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { updateClass } from "../../services/classes.js";

const updateClassSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    subject: z.string().trim().min(1).max(80).nullable().optional(),
    teacherName: z.string().trim().min(1).max(120).nullable().optional(),
    chatMode: z.enum(["announcement", "open"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export async function updateClassHandler(c: Context) {
  const parsed = updateClassSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;
  const updated = await updateClass(user.tenantId, classId, parsed.data);

  const response: ApiResponse<ClassResponse> = {
    success: true,
    data: updated,
  };

  return c.json(response, 200);
}
