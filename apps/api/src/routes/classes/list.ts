import type { Context } from "hono";
import type { ApiResponse, ClassResponse, JWTPayload } from "@whiteroom/shared";
import { listClasses } from "../../services/classes.js";
import { parsePagination } from "../../lib/pagination.js";

export async function listClassesHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const { page, limit } = parsePagination(c, 20);

  const result = await listClasses(user.tenantId, { page, limit });

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
