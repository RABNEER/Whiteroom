import { describe, it, expect } from "vitest";
import { isTeacherRole } from "../walt";

describe("Walt Service - isTeacherRole", () => {
  it("should return true for valid teacher and admin roles", () => {
    expect(isTeacherRole("teacher")).toBe(true);
    expect(isTeacherRole("school_admin")).toBe(true);
    expect(isTeacherRole("super_admin")).toBe(true);
    expect(isTeacherRole("SUPER_ADMIN")).toBe(true);
  });

  it("should return false for other roles", () => {
    expect(isTeacherRole("student")).toBe(false);
    expect(isTeacherRole("parent")).toBe(false);
    expect(isTeacherRole("user")).toBe(false);
    expect(isTeacherRole("")).toBe(false);
  });

  it("should return false for undefined or null roles", () => {
    expect(isTeacherRole(undefined)).toBe(false);
  });
});
