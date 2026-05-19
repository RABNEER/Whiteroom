import { Context, Next } from "hono";
import { Errors } from "@whiteroom/shared";

/**
 * Auth middleware — placeholder for Phase 2.
 * Verifies JWT from Authorization header, attaches user claims to context.
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw Errors.unauthorized();
  }

  // TODO (Phase 2): Verify JWT, extract claims, set c.set("user", claims)
  throw Errors.unauthorized("Auth not yet implemented");
}
