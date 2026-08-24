import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Normalize an Indian phone number to +91XXXXXXXXXX format.
 *
 * Rules:
 * - Strip spaces, dashes, dots, parentheses
 * - If starts with 0, replace with +91
 * - If exactly 10 digits, prepend +91
 * - If starts with 91 (no plus), prepend +
 * - If already starts with +91, keep as-is
 */
export function normalizePhone(raw: string): string {
  if (!raw) return "";

  // If the raw string is an @lid JID or contains 'lid', it's an internal WhatsApp identifier, not a phone
  if (raw.includes("@lid") || raw.toLowerCase().includes("lid")) {
    return "";
  }

  // Strip any @c.us or device suffix like :1, :2
  let cleaned = raw.split("@")[0].split(":")[0];
  // Extract only digits
  const digits = cleaned.replace(/\D/g, "");

  // An Indian mobile number has 10 digits starting with [6-9]
  // e.g. 9876543210 (10), 09876543210 (11), 919876543210 (12)
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    // Real Indian mobile telecom series: starts with 6, 7, 8, or 9
    if (/^[6-9]\d{9}$/.test(last10)) {
      return "+91" + last10;
    }
  }

  return "";
}

/**
 * Validate that a phone number is in +91XXXXXXXXXX format with valid Indian telecom prefix.
 */
export function isValidIndianPhone(phone: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(phone);
}

/**
 * SHA-256 hash a string. Used for phone lookup and OTP storage.
 * No salt needed for OTP (short-lived). Phone hashing uses a
 * deterministic hash for lookup queries.
 */
export function hashSHA256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Generate a 6-digit numeric OTP.
 */
export function generateOTP(): string {
  return randomInt(100_000, 999_999).toString();
}

/**
 * Generate a 6-character alphanumeric invite code.
 */
export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 0, 1 to avoid confusion
  let code = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return code;
}

/**
 * Generate a URL-safe slug from a name.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
