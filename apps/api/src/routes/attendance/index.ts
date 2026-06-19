import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { createSessionHandler } from "./create-session.js";
import { listSessionsHandler } from "./list-sessions.js";
import { getSessionHandler } from "./get-session.js";
import { markBatchHandler } from "./mark-batch.js";
import { studentHistoryHandler } from "./student-history.js";

const attendanceRoutes = new Hono();

attendanceRoutes.use("*", authMiddleware);

// Teacher and Admin: manage sessions and mark attendance
attendanceRoutes.post("/sessions", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN), createSessionHandler);
attendanceRoutes.get("/sessions", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN), listSessionsHandler);
attendanceRoutes.get("/sessions/:id", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN), getSessionHandler);
attendanceRoutes.post("/sessions/:id/mark", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN), markBatchHandler);

// Teachers/Admins can view any student in their tenant. Parents use /parent/children/:id/attendance,
// which verifies child ownership before returning records.
attendanceRoutes.get(
  "/students/:id/history",
  requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN),
  studentHistoryHandler
);

export { attendanceRoutes };
