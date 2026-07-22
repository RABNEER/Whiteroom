import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { adminTenantsHandler } from "./tenants.js";
import { adminMetricsHandler } from "./metrics.js";
import { adminUsersHandler } from "./users.js";
import { promoteAllHandler, listPromotionsHandler } from "./promote.js";
import { pilotStatsHandler } from "./pilot-stats.js";
import {
  getSecurityLogsHandler,
  sendBreachNotificationHandler,
  exportCertInReportHandler,
} from "./security.js";

const adminRoutes = new Hono();

adminRoutes.use("*", authMiddleware);

adminRoutes.get("/tenants", requireRole(UserRole.SUPER_ADMIN), adminTenantsHandler);
adminRoutes.get("/metrics", requireRole(UserRole.SUPER_ADMIN), adminMetricsHandler);
adminRoutes.get("/users", requireRole(UserRole.SUPER_ADMIN), adminUsersHandler);
adminRoutes.get("/pilot-stats", pilotStatsHandler);

adminRoutes.post("/promote-all", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), promoteAllHandler);
adminRoutes.get("/promotion-history", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), listPromotionsHandler);

// Security & Compliance (DPDP Act 2023 & CERT-In)
adminRoutes.get("/security/logs", requireRole(UserRole.SUPER_ADMIN), getSecurityLogsHandler);
adminRoutes.post("/security/breach-notify", requireRole(UserRole.SUPER_ADMIN), sendBreachNotificationHandler);
adminRoutes.get("/security/certin-export", requireRole(UserRole.SUPER_ADMIN), exportCertInReportHandler);

export { adminRoutes };
