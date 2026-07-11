import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { createStudentHandler } from "./create.js";
import { listStudentsHandler } from "./list.js";
import { getStudentHandler } from "./get-one.js";
import { updateStudentHandler } from "./update.js";

const studentRoutes = new Hono();

studentRoutes.use("*", authMiddleware);
studentRoutes.use("*", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN));

const studentMutationLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 30,
  errorCode: "STUDENT_MUTATION_LIMITED",
});

studentRoutes.post("/", studentMutationLimiter, createStudentHandler);
studentRoutes.get("/", listStudentsHandler);
studentRoutes.get("/:id", getStudentHandler);
studentRoutes.patch("/:id", studentMutationLimiter, updateStudentHandler);

export { studentRoutes };
