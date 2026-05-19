import type { Context } from "hono";
import type { ApiResponse, ClassResponse, JWTPayload } from "@whiteroom/shared";
import { listClasses } from "../../services/classes.js";

export async function listClassesHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const rows = await listClasses(user.tenantId);

  const response: ApiResponse<ClassResponse[]> = {
    success: true,
    data: rows,
  };

  return c.json(response, 200);
}
