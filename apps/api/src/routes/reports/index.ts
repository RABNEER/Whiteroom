import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { attendanceSummaryHandler } from "./attendance-summary.js";
import { classStatsHandler } from "./class-stats.js";

const reportRoutes = new Hono();

reportRoutes.use("*", authMiddleware);
reportRoutes.use("*", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN));

reportRoutes.get("/attendance/summary", attendanceSummaryHandler);
reportRoutes.get("/classes/:id/stats", classStatsHandler);

export { reportRoutes };
