import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { listParentChildrenHandler } from "./children.js";
import { listParentChildClassesHandler } from "./child-classes.js";
import { parentFeedHandler } from "./feed.js";
import { childAttendanceHandler } from "./child-attendance.js";

const parentRoutes = new Hono();

parentRoutes.use("*", authMiddleware);
parentRoutes.use("*", requireRole(UserRole.PARENT));

// Phase 3: children and classes
parentRoutes.get("/children", listParentChildrenHandler);
parentRoutes.get("/children/:id/classes", listParentChildClassesHandler);

// Phase 4: feed and attendance
parentRoutes.get("/feed", parentFeedHandler);
parentRoutes.get("/children/:id/attendance", childAttendanceHandler);

export { parentRoutes };
