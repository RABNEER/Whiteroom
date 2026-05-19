import { randomBytes } from "node:crypto";

/**
 * Generate a URL-safe, collision-resistant ID.
 * 21 chars ≈ same collision resistance as UUIDv4 but shorter.
 */
export function createId(): string {
  return randomBytes(16).toString("hex").slice(0, 21);
}
