import { describe, expect, it } from "vitest";
import { initials } from "./format";

describe("format utilities", () => {
  it("creates two-letter initials from institute names", () => {
    expect(initials("Sharma Coaching")).toBe("SC");
    expect(initials("Whiteroom")).toBe("W");
  });
});
