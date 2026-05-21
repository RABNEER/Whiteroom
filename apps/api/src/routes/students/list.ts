import type { Context } from "hono";
import type { ApiResponse, JWTPayload, StudentResponse } from "@whiteroom/shared";
import { listStudents } from "../../services/students.js";

export async function listStudentsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  // Parse pagination params: ?page=1&limit=50 (max 100 per page)
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));

  const result = await listStudents(user.tenantId, { page, limit });

  const response: ApiResponse<{ data: StudentResponse[]; meta: { total: number; page: number; limit: number; pages: number } }> = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
