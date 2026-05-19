import { Hono } from "hono";
import { generateInviteHandler } from "./generate.js";
import { resolveInviteHandler } from "./resolve.js";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { UserRole } from "@whiteroom/shared";

const inviteRoutes = new Hono();

// Protected — teacher only
inviteRoutes.post("/", authMiddleware, requireRole(UserRole.TEACHER), generateInviteHandler);

// Public — anyone can resolve an invite
inviteRoutes.get("/:code", resolveInviteHandler);

export { inviteRoutes };
