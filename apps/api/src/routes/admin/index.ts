import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { adminTenantsHandler } from "./tenants.js";
import { adminMetricsHandler } from "./metrics.js";
import { adminUsersHandler } from "./users.js";
import { promoteAllHandler, listPromotionsHandler } from "./promote.js";

const adminRoutes = new Hono();

adminRoutes.use("*", authMiddleware);

adminRoutes.get("/tenants", requireRole(UserRole.SUPER_ADMIN), adminTenantsHandler);
adminRoutes.get("/metrics", requireRole(UserRole.SUPER_ADMIN), adminMetricsHandler);
adminRoutes.get("/users", requireRole(UserRole.SUPER_ADMIN), adminUsersHandler);

adminRoutes.post("/promote-all", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), promoteAllHandler);
adminRoutes.get("/promotion-history", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), listPromotionsHandler);

export { adminRoutes };
