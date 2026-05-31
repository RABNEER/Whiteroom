import type { Context } from "hono";
import type { ApiResponse } from "@whiteroom/shared";
import { listAdminUsers } from "../../services/admin.js";

export async function adminUsersHandler(c: Context) {
  const users = await listAdminUsers();

  const response: ApiResponse = {
    success: true,
    data: users,
  };

  return c.json(response, 200);
}
