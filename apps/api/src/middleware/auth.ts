import { Context, Next } from "hono";
import { Errors } from "@whiteroom/shared";
import type { JWTPayload, UserRole } from "@whiteroom/shared";
import { verifyAccessToken } from "../lib/jwt.js";
import { db } from "../lib/db.js";
import { users, eq } from "@whiteroom/db";

/**
 * Auth middleware — verifies JWT from Authorization header,
 * checks user has not been GDPR-scrubbed, attaches decoded user claims.
 *
 * Usage: app.use("/api/v1/*", authMiddleware)
 * Access claims via: c.get("user") as JWTPayload
 */
// In-memory cache for user active status to avoid hitting the DB on every single HTTP request
const userActiveCache = new Map<string, { isDeactivated: boolean; expiresAt: number }>();

export function invalidateUserAuthCache(userId?: string) {
  if (userId) {
    userActiveCache.delete(userId);
  } else {
    userActiveCache.clear();
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw Errors.unauthorized();
  }

  const token = authHeader.slice(7);

  let claims: JWTPayload;
  try {
    claims = await verifyAccessToken(token);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("expired")) {
      throw Errors.unauthorized("Token expired");
    }
    throw Errors.unauthorized("Invalid token");
  }

  const now = Date.now();
  const cached = userActiveCache.get(claims.userId);
  let isDeactivated = false;

  if (cached && cached.expiresAt > now) {
    isDeactivated = cached.isDeactivated;
  } else {
    const [user] = await db
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, claims.userId))
      .limit(1);

    isDeactivated = !user || !!user.deletedAt;
    userActiveCache.set(claims.userId, {
      isDeactivated,
      expiresAt: now + (isDeactivated ? 10_000 : 60_000),
    });

    if (userActiveCache.size > 10_000) {
      for (const [key, val] of userActiveCache) {
        if (val.expiresAt < now) {
          userActiveCache.delete(key);
        }
      }
    }
  }

  if (isDeactivated) {
    throw Errors.unauthorized("Account has been deactivated");
  }

  c.set("user", claims);
  await next();
}

/**
 * Role guard factory — returns middleware that checks the user's role.
 *
 * Usage: app.post("/admin-only", requireRole("teacher"), handler)
 */
export function requireRole(...roles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as JWTPayload;

    if (!user) {
      throw Errors.unauthorized();
    }

    if (!roles.includes(user.role as UserRole)) {
      throw Errors.forbidden(
        `This action requires one of these roles: ${roles.join(", ")}`
      );
    }

    await next();
  };
}

/**
 * Plan guard factory — returns middleware that checks the tenant's plan tier.
 *
 * Usage: app.post("/students", requirePlan("pro"), handler)
 */
export function requirePlan(...tiers: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user") as JWTPayload;

    if (!user) {
      throw Errors.unauthorized();
    }

    if (!tiers.includes(user.plan)) {
      throw Errors.forbidden(
        `This action requires one of these plans: ${tiers.join(", ")}`
      );
    }

    await next();
  };
}
