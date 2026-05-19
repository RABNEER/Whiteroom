import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { adminTenantsHandler } from "./tenants.js";
import { adminMetricsHandler } from "./metrics.js";

const adminRoutes = new Hono();

adminRoutes.use("*", authMiddleware);
adminRoutes.use("*", requireRole(UserRole.SUPER_ADMIN));

adminRoutes.get("/tenants", adminTenantsHandler);
adminRoutes.get("/metrics", adminMetricsHandler);

export { adminRoutes };
