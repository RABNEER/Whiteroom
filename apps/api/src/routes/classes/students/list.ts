import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listClassStudents } from "../../../services/classes.js";
import { parsePagination } from "../../../lib/pagination.js";

export async function listClassStudentsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;

  const { page, limit } = parsePagination(c, 20);

  const result = await listClassStudents(user.tenantId, classId, { page, limit });

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
