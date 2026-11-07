import { describe, expect, it } from "vitest";

import { colorToString } from "./color";

describe("colorToString", () => {
  it("returns 'transparent' for transparent type", () => {
    expect(colorToString({ type: "transparent" })).toBe("transparent");
  });

  it("returns var(--<name>) for theme type", () => {
    expect(colorToString({ type: "theme", name: "text-accent" })).toBe("var(--text-accent)");
  });

  // Obsidian 1.14 stopped defining --text-highlight-bg, so a bare var() painted nothing there.
  it("falls back to Obsidian's highlight color for the text highlight", () => {
    expect(colorToString({ type: "theme", name: "text-highlight-bg" })).toBe(
      "var(--text-highlight-bg, var(--highlight-background-yellow))",
    );
  });

  it("returns the raw color string for custom type", () => {
    expect(colorToString({ type: "custom", color: "#ff00aa" })).toBe("#ff00aa");
  });
});
