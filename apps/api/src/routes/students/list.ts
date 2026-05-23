import type { Context } from "hono";
import type { ApiResponse, JWTPayload, StudentResponse } from "@whiteroom/shared";
import { listStudents } from "../../services/students.js";
import { parsePagination } from "../../lib/pagination.js";

export async function listStudentsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  const { page, limit } = parsePagination(c, 50);

  const result = await listStudents(user.tenantId, { page, limit });

  const response: ApiResponse<{ data: StudentResponse[]; meta: { total: number; page: number; limit: number; pages: number } }> = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
