import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { createSessionHandler } from "./create-session.js";
import { listSessionsHandler } from "./list-sessions.js";
import { getSessionHandler } from "./get-session.js";
import { markBatchHandler } from "./mark-batch.js";
import { markAllPresentHandler } from "./mark-all-present.js";
import { studentHistoryHandler } from "./student-history.js";

const attendanceRoutes = new Hono();

attendanceRoutes.use("*", authMiddleware);

const attendanceMutationLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 30,
  errorCode: "ATTENDANCE_MUTATION_LIMITED",
});

// Teacher and Admin: manage sessions and mark attendance
attendanceRoutes.post("/sessions", attendanceMutationLimiter, requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), createSessionHandler);
attendanceRoutes.get("/sessions", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), listSessionsHandler);
attendanceRoutes.get("/sessions/:id", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), getSessionHandler);
attendanceRoutes.post("/sessions/:id/mark", attendanceMutationLimiter, requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), markBatchHandler);
attendanceRoutes.post("/sessions/:id/mark-all-present", attendanceMutationLimiter, requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), markAllPresentHandler);

// Teachers/Admins can view any student in their tenant. Parents use /parent/children/:id/attendance,
// which verifies child ownership before returning records.
attendanceRoutes.get(
  "/students/:id/history",
  requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN),
  studentHistoryHandler
);

export { attendanceRoutes };
