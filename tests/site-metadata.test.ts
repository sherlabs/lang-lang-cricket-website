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

describe("club-driven metadata (spec §14: club values are arguments)", async () => {
  const { resolveClub } = await import("@/lib/club-merge");
  const { absoluteUrl, baseOpenGraph, pageSeo, titleWithSuffix } = await import("@/lib/site-metadata");
  const club = resolveClub(null);

  it("pageSeo appends the suffix; an empty page title falls back to the site default", () => {
    expect(pageSeo(club, "contact")).toEqual({
      title: "Contact | Lang Lang Cricket Club",
      description: "Get in touch with Lang Lang Cricket Club in Caldermeade, Victoria, for playing, sponsorship and general enquiries.",
    });
    expect(pageSeo(club, "home")).toEqual({ title: "Lang Lang Cricket Club", description: club.defaultDescription });
    expect(titleWithSuffix(club, "Edit your story")).toBe("Edit your story | Lang Lang Cricket Club");
  });

  it("baseOpenGraph carries the site name, locale and default share image", () => {
    expect(baseOpenGraph(club)).toEqual({
      type: "website",
      siteName: "Lang Lang Cricket Club",
      locale: "en_AU",
      images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Lang Lang Cricket Club clubrooms and oval at Caldermeade" }],
    });
  });

  it("absoluteUrl resolves against the given site URL", () => {
    expect(absoluteUrl("/x", "https://club.example/")).toBe("https://club.example/x");
    expect(absoluteUrl("https://cdn.example/a.jpg", "https://club.example")).toBe("https://cdn.example/a.jpg");
    expect(absoluteUrl("/x")).toBe("https://langlangcricketclub.com/x");
  });
});
