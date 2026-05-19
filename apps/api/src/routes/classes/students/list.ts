import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listClassStudents } from "../../../services/classes.js";

export async function listClassStudentsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;
  const rows = await listClassStudents(user.tenantId, classId);

  const response: ApiResponse<typeof rows> = {
    success: true,
    data: rows,
  };

  return c.json(response, 200);
}
