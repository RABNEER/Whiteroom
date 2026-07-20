import { Hono } from "hono";
import { generateInviteHandler } from "./generate.js";
import { resolveInviteHandler } from "./resolve.js";
import { joinInviteHandler } from "./join.js";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { UserRole } from "@whiteroom/shared";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";

const inviteRoutes = new Hono();

const inviteResolveLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // max 30 resolves per 15 mins
});

// Protected — teacher only
inviteRoutes.post("/", authMiddleware, requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN), generateInviteHandler);

// Protected — any logged-in user can join an invite
inviteRoutes.post("/join", authMiddleware, joinInviteHandler);

// Public — anyone can resolve an invite
inviteRoutes.get("/:code", inviteResolveLimiter, resolveInviteHandler);

export { inviteRoutes };
