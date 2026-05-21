import type { Context } from "hono";
import type { ApiResponse, ClassResponse, JWTPayload } from "@whiteroom/shared";
import { listClasses } from "../../services/classes.js";

export async function listClassesHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  // FIX: No pagination on list endpoints — will OOM at 1000+ students
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));

  const result = await listClasses(user.tenantId, { page, limit });

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
