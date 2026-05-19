import type { Context } from "hono";
import type { ApiResponse, JWTPayload, StudentResponse } from "@whiteroom/shared";
import { getStudent } from "../../services/students.js";

export async function getStudentHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const studentId = c.req.param("id")!;
  const row = await getStudent(user.tenantId, studentId);

  const response: ApiResponse<StudentResponse> = {
    success: true,
    data: row,
  };

  return c.json(response, 200);
}
