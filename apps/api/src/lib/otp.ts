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
  // Strip non-numeric characters except leading +
  let phone = raw.replace(/[\s\-.()\u00A0]/g, "");

  // Handle leading 0 (common Indian format: 09876543210)
  if (phone.startsWith("0") && phone.length === 11) {
    phone = "+91" + phone.slice(1);
  }
  // Handle bare 10-digit number
  else if (/^\d{10}$/.test(phone)) {
    phone = "+91" + phone;
  }
  // Handle 91XXXXXXXXXX without plus
  else if (phone.startsWith("91") && phone.length === 12) {
    phone = "+" + phone;
  }
  // Handle already formatted +91XXXXXXXXXX
  else if (phone.startsWith("+91") && phone.length === 13) {
    // Already correct
  }

  return phone;
}

/**
 * Validate that a phone number is in +91XXXXXXXXXX format.
 */
export function isValidIndianPhone(phone: string): boolean {
  return /^\+91\d{10}$/.test(phone);
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
