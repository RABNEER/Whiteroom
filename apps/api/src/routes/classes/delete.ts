import type { Context } from "hono";
import type { ApiResponse, ClassResponse, JWTPayload } from "@whiteroom/shared";
import { softDeleteClass } from "../../services/classes.js";

export async function deleteClassHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;
  const deleted = await softDeleteClass(user.tenantId, classId);

  const response: ApiResponse<ClassResponse> = {
    success: true,
    data: deleted,
  };

  return c.json(response, 200);
}
