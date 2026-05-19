import type { Context } from "hono";
import type { ApiResponse } from "@whiteroom/shared";
import { listAdminTenants } from "../../services/admin.js";

export async function adminTenantsHandler(c: Context) {
  const rows = await listAdminTenants();

  const response: ApiResponse = {
    success: true,
    data: rows,
  };

  return c.json(response, 200);
}
