import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { createScheduleHandler } from "./create.js";
import { listSchedulesHandler } from "./list.js";
import { updateScheduleHandler } from "./update.js";
import { deleteScheduleHandler } from "./delete.js";

const scheduleRoutes = new Hono();

scheduleRoutes.use("*", authMiddleware);
scheduleRoutes.use("*", requireRole(UserRole.TEACHER));

scheduleRoutes.post("/", createScheduleHandler);
scheduleRoutes.get("/", listSchedulesHandler);
scheduleRoutes.patch("/:id", updateScheduleHandler);
scheduleRoutes.delete("/:id", deleteScheduleHandler);

export { scheduleRoutes };
