import { describe, it, expect } from "vitest";
import { chunkText } from "../ingestion.js";

describe("chunkText", () => {
  it("should split text into chunks based on chunk size and overlap", () => {
    const text = "A".repeat(2000);
    const chunks = chunkText(text, 1000, 150);
    
    // First chunk should be 1000
    expect(chunks[0].length).toBe(1000);
    // Second chunk: starts at 1000 - 150 = 850
    // Remaining text: 2000 - 850 = 1150 (takes 1000)
    expect(chunks[1].length).toBe(1000);
    // Third chunk: starts at 850 + 1000 - 150 = 1700
    // Remaining text: 2000 - 1700 = 300
    expect(chunks[2].length).toBe(300);
    expect(chunks.length).toBe(3);
  });

  it("should handle text smaller than chunk size", () => {
    const text = "A".repeat(500);
    const chunks = chunkText(text, 1000, 150);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].length).toBe(500);
  });

  it("should handle empty text", () => {
    const chunks = chunkText("", 1000, 150);
    expect(chunks).toEqual([]);
  });
});
