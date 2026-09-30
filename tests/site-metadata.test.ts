import { describe, expect, it } from "vitest";
import { truncateDescription } from "@/lib/site-metadata";

describe("truncateDescription", () => {
  it("returns short text unchanged, collapsing whitespace", () => {
    expect(truncateDescription("  hello \n  world ")).toBe("hello world");
  });
  it("cuts on a word boundary with an ellipsis within max", () => {
    const out = truncateDescription("one two three four five six", 15);
    expect(out).toBe("one two three…");
    expect(out.length).toBeLessThanOrEqual(15);
  });
  it("hard-cuts a single long word", () => {
    expect(truncateDescription("abcdefghijklmnop", 6)).toBe("abcde…");
  });
  it("returns empty for blank input", () => {
    expect(truncateDescription("   ")).toBe("");
  });
});
