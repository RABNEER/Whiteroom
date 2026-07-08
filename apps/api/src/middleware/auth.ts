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

  const [user] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, claims.userId))
    .limit(1);

  if (!user || user.deletedAt) {
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
