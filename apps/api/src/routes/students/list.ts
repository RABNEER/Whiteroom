import type { Context } from "hono";
import type { ApiResponse, JWTPayload, StudentResponse } from "@whiteroom/shared";
import { listStudents } from "../../services/students.js";

export async function listStudentsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const rows = await listStudents(user.tenantId);

  const response: ApiResponse<StudentResponse[]> = {
    success: true,
    data: rows,
  };

  return c.json(response, 200);
}
