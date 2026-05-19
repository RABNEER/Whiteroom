import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { createAnnouncementHandler } from "./create.js";
import { listAnnouncementsHandler } from "./list.js";
import { getAnnouncementHandler } from "./get-one.js";
import { updateAnnouncementHandler } from "./update.js";
import { deleteAnnouncementHandler } from "./delete.js";
import { markReadHandler } from "./mark-read.js";

const announcementRoutes = new Hono();

announcementRoutes.use("*", authMiddleware);

// Teacher-only: create, update, delete
announcementRoutes.post(
  "/",
  requireRole(UserRole.TEACHER),
  createAnnouncementHandler
);
announcementRoutes.patch(
  "/:id",
  requireRole(UserRole.TEACHER),
  updateAnnouncementHandler
);
announcementRoutes.delete(
  "/:id",
  requireRole(UserRole.TEACHER),
  deleteAnnouncementHandler
);

// Both teacher and parent: list, get one
announcementRoutes.get(
  "/",
  requireRole(UserRole.TEACHER, UserRole.PARENT),
  listAnnouncementsHandler
);
announcementRoutes.get(
  "/:id",
  requireRole(UserRole.TEACHER, UserRole.PARENT),
  getAnnouncementHandler
);

// Parent only: mark as read
announcementRoutes.post(
  "/:id/read",
  requireRole(UserRole.PARENT),
  markReadHandler
);

export { announcementRoutes };
