import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listParentChildClasses } from "../../services/students.js";

export async function listParentChildClassesHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const studentId = c.req.param("id")!;
  const rows = await listParentChildClasses(user.tenantId, user.userId, studentId);

  const response: ApiResponse<typeof rows> = {
    success: true,
    data: rows,
  };

  return c.json(response, 200);
}
