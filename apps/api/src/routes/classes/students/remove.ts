import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { removeStudentFromClass } from "../../../services/classes.js";

export async function removeStudentFromClassHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;
  const studentId = c.req.param("sid")!;
  const result = await removeStudentFromClass(user.tenantId, classId, studentId);

  const response: ApiResponse<typeof result> = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
