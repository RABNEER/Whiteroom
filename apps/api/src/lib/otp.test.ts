import { describe, expect, it } from "vitest";
import {
  generateInviteCode,
  generateOTP,
  hashSHA256,
  isValidIndianPhone,
  normalizePhone,
  slugify,
} from "./otp.js";

describe("otp utilities", () => {
  it("normalizes common Indian phone number formats", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("098765-43210")).toBe("+919876543210");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
    expect(normalizePhone("+919876543210")).toBe("+919876543210");
  });

  it("validates normalized Indian phone numbers", () => {
    expect(isValidIndianPhone("+919876543210")).toBe(true);
    expect(isValidIndianPhone("9876543210")).toBe(false);
    expect(isValidIndianPhone("+91876543210")).toBe(false);
  });

  it("hashes deterministically without exposing the input", () => {
    const input = "+919876543210";
    const hash = hashSHA256(input);

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashSHA256(input));
    expect(hash).not.toContain(input);
  });

  it("generates six digit OTPs and six character invite codes", () => {
    expect(generateOTP()).toMatch(/^\d{6}$/);
    expect(generateInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("slugifies institute names for URL-safe tenant slugs", () => {
    expect(slugify(" Sharma Coaching Centre! ")).toBe("sharma-coaching-centre");
  });
});
