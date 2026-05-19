import { Hono } from "hono";
import { getTenantMeHandler } from "./get-me.js";
import { updateTenantMeHandler } from "./update-me.js";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { UserRole } from "@whiteroom/shared";

const tenantRoutes = new Hono();

// All tenant routes require authentication
tenantRoutes.use("*", authMiddleware);

// Any authenticated user can view their tenant
tenantRoutes.get("/me", getTenantMeHandler);

// Only teachers can update the tenant
tenantRoutes.patch("/me", requireRole(UserRole.TEACHER), updateTenantMeHandler);

export { tenantRoutes };
