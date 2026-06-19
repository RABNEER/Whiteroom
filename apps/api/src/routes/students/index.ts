import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { createStudentHandler } from "./create.js";
import { listStudentsHandler } from "./list.js";
import { getStudentHandler } from "./get-one.js";
import { updateStudentHandler } from "./update.js";

const studentRoutes = new Hono();

studentRoutes.use("*", authMiddleware);
studentRoutes.use("*", requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN));

studentRoutes.post("/", createStudentHandler);
studentRoutes.get("/", listStudentsHandler);
studentRoutes.get("/:id", getStudentHandler);
studentRoutes.patch("/:id", updateStudentHandler);

export { studentRoutes };
