import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { createClassHandler } from "./create.js";
import { listClassesHandler } from "./list.js";
import { getClassHandler } from "./get-one.js";
import { updateClassHandler } from "./update.js";
import { deleteClassHandler } from "./delete.js";
import { addStudentsToClassHandler } from "./students/add.js";
import { listClassStudentsHandler } from "./students/list.js";
import { removeStudentFromClassHandler } from "./students/remove.js";

const classRoutes = new Hono();

classRoutes.use("*", authMiddleware);
classRoutes.use("*", requireRole(UserRole.TEACHER));

classRoutes.post("/", createClassHandler);
classRoutes.get("/", listClassesHandler);
classRoutes.get("/:id", getClassHandler);
classRoutes.patch("/:id", updateClassHandler);
classRoutes.delete("/:id", deleteClassHandler);
classRoutes.post("/:id/students", addStudentsToClassHandler);
classRoutes.get("/:id/students", listClassStudentsHandler);
classRoutes.delete("/:id/students/:sid", removeStudentFromClassHandler);

export { classRoutes };
