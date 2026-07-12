import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { createClassHandler } from "./create.js";
import { listClassesHandler } from "./list.js";
import { getClassHandler } from "./get-one.js";
import { updateClassHandler } from "./update.js";
import { deleteClassHandler } from "./delete.js";
import { addStudentsToClassHandler } from "./students/add.js";
import { listClassStudentsHandler } from "./students/list.js";
import { removeStudentFromClassHandler } from "./students/remove.js";
import { toggleMonitorHandler } from "./students/toggle-monitor.js";

const classRoutes = new Hono();

classRoutes.use("*", authMiddleware);
classRoutes.use("*", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN));

const classMutationLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyFn: (c) => c.get("user")?.userId || c.req.header("x-forwarded-for") || "unknown",
  errorCode: "CLASS_MUTATION_LIMITED",
});

classRoutes.post("/", classMutationLimiter, createClassHandler);
classRoutes.get("/", listClassesHandler);
classRoutes.get("/:id", getClassHandler);
classRoutes.patch("/:id", classMutationLimiter, updateClassHandler);
classRoutes.delete("/:id", classMutationLimiter, deleteClassHandler);
classRoutes.post("/:id/students", classMutationLimiter, addStudentsToClassHandler);
classRoutes.get("/:id/students", listClassStudentsHandler);
classRoutes.patch("/:id/students/:sid", classMutationLimiter, toggleMonitorHandler);
classRoutes.delete("/:id/students/:sid", classMutationLimiter, removeStudentFromClassHandler);

export { classRoutes };
