import type { Context } from "hono";
import type { ApiResponse, JWTPayload, StudentResponse } from "@whiteroom/shared";
import { listParentChildren } from "../../services/students.js";

export async function listParentChildrenHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const children = await listParentChildren(user.tenantId, user.userId);

  const response: ApiResponse<StudentResponse[]> = {
    success: true,
    data: children,
  };

  return c.json(response, 200);
}
