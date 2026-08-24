import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { env } from "../../lib/env.js";
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
import {
  sendBroadcastNotificationHandler,
  getBroadcastHistoryHandler,
} from "./broadcast.js";

import crypto from "node:crypto";

const adminRoutes = new Hono();

adminRoutes.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const configuredAdminKey = env.ADMIN_API_KEY;

  // 1. Direct local dashboard authentication with secure ADMIN_API_KEY (timing-safe comparison)
  if (token && configuredAdminKey) {
    const tokenBuf = Buffer.from(token);
    const keyBuf = Buffer.from(configuredAdminKey);
    if (tokenBuf.length === keyBuf.length && crypto.timingSafeEqual(tokenBuf, keyBuf)) {
      c.set("user" as any, {
        userId: "admin-master-key",
        phone: env.SUPER_ADMIN_PHONE || "+919999999999",
        role: UserRole.SUPER_ADMIN,
        tenantId: "global",
      });
      return next();
    }
  }

  // 2. Reject unauthenticated requests
  if (!token) {
    return c.json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Admin authorization required. Please provide a valid admin token.",
      },
    }, 401);
  }

  // 3. Fallback to standard JWT verification for logged-in sessions
  return authMiddleware(c, next);
});

adminRoutes.get("/tenants", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), adminTenantsHandler);
adminRoutes.get("/metrics", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), adminMetricsHandler);
adminRoutes.get("/users", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), adminUsersHandler);
adminRoutes.get("/pilot-stats", pilotStatsHandler);

adminRoutes.post("/promote-all", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), promoteAllHandler);
adminRoutes.get("/promotion-history", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), listPromotionsHandler);

// Consumer & Marketing Push Broadcasts
adminRoutes.post("/broadcast-notification", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), sendBroadcastNotificationHandler);
adminRoutes.get("/broadcast-notification/history", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), getBroadcastHistoryHandler);

// Security & Compliance (DPDP Act 2023 & CERT-In)
adminRoutes.get("/security/logs", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), getSecurityLogsHandler);
adminRoutes.post("/security/breach-notify", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), sendBreachNotificationHandler);
adminRoutes.get("/security/certin-export", requireRole(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), exportCertInReportHandler);

export { adminRoutes };
