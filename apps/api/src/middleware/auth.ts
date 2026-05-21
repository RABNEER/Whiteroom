import { Context, Next } from "hono";
import { Errors } from "@whiteroom/shared";
import type { JWTPayload, UserRole } from "@whiteroom/shared";
import { verifyAccessToken } from "../lib/jwt.js";
import { db } from "../lib/db.js";
import { sql } from "@whiteroom/db";

/**
 * Auth middleware — verifies JWT from Authorization header,
 * attaches decoded user claims to Hono context.
 *
 * Usage: app.use("/api/v1/*", authMiddleware)
 * Access claims via: c.get("user") as JWTPayload
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw Errors.unauthorized();
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const claims = await verifyAccessToken(token);
    c.set("user", claims);

    // FIX: No Postgres RLS policies — data leakage if ORM bypassed
    if (claims.tenantId) {
      await db.execute(
        sql`SELECT set_config('app.tenant_id', ${claims.tenantId}, true)`
      );
    }

    await next();
  } catch (err: unknown) {
    // jose throws JWTExpired for expired tokens
    if (err instanceof Error && err.message.includes("expired")) {
      throw Errors.unauthorized("Token expired");
    }
    throw Errors.unauthorized("Invalid token");
  }
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
