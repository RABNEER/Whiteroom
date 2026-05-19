import type { Context } from "hono";
import type { ApiResponse, ClassResponse, JWTPayload } from "@whiteroom/shared";
import { getClassWithStudentCount } from "../../services/classes.js";

export async function getClassHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;
  const row = await getClassWithStudentCount(user.tenantId, classId);

  const response: ApiResponse<ClassResponse> = {
    success: true,
    data: row,
  };

  return c.json(response, 200);
}
