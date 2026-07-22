import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { contentModerationMiddleware } from "../../middleware/moderation.js";
import { createAnnouncementHandler } from "./create.js";
import { listAnnouncementsHandler } from "./list.js";
import { getAnnouncementHandler } from "./get-one.js";
import { updateAnnouncementHandler } from "./update.js";
import { deleteAnnouncementHandler } from "./delete.js";
import { markReadHandler } from "./mark-read.js";

const announcementRoutes = new Hono();

announcementRoutes.use("*", authMiddleware);

// Teacher and Admin: create, update, delete
announcementRoutes.post(
  "/",
  requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN),
  contentModerationMiddleware,
  createAnnouncementHandler
);
announcementRoutes.patch(
  "/:id",
  requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN),
  contentModerationMiddleware,
  updateAnnouncementHandler
);
announcementRoutes.delete(
  "/:id",
  requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN),
  deleteAnnouncementHandler
);

// Teacher, Admin and Parent: list, get one
announcementRoutes.get(
  "/",
  requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PARENT),
  listAnnouncementsHandler
);
announcementRoutes.get(
  "/:id",
  requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.PARENT),
  getAnnouncementHandler
);

// Parent only: mark as read
announcementRoutes.post(
  "/:id/read",
  requireRole(UserRole.PARENT),
  markReadHandler
);

export { announcementRoutes };
