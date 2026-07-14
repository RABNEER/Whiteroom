import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { createScheduleHandler } from "./create.js";
import { listSchedulesHandler } from "./list.js";
import { updateScheduleHandler } from "./update.js";
import { deleteScheduleHandler } from "./delete.js";

const scheduleRoutes = new Hono();

scheduleRoutes.use("*", authMiddleware);

scheduleRoutes.get("/", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN, UserRole.PARENT), listSchedulesHandler);
scheduleRoutes.post("/", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), createScheduleHandler);
scheduleRoutes.patch("/:id", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), updateScheduleHandler);
scheduleRoutes.delete("/:id", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), deleteScheduleHandler);

export { scheduleRoutes };
