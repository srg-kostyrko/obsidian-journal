import { describe, expect, it } from "vitest";

import { defaultCondition, defaultStyle } from "./defaults";
import { resolveCell } from "./resolve-cell";

// Assertions go through resolveCell rather than reading the style object, because "renders
// something" is the behavior. Reading defaultStyle().color would have passed against the
// transparent defaults this replaces.
describe("defaultStyle", () => {
  it("resolves a new background to a visible color", () => {
    expect(resolveCell([defaultStyle("background")]).background).toBe("var(--interactive-accent)");
  });

  it("resolves a new text color to something other than the inherited one", () => {
    expect(resolveCell([defaultStyle("color")]).textColor).toBe("var(--text-accent)");
  });

  it("resolves a new border to a visible stroke on every side", () => {
    const { border } = resolveCell([defaultStyle("border")]);
    expect(border).toEqual({
      top: "1px solid var(--text-accent)",
      right: "1px solid var(--text-accent)",
      bottom: "1px solid var(--text-accent)",
      left: "1px solid var(--text-accent)",
    });
  });

  it("resolves a new shape to a visible mark", () => {
    const { marks } = resolveCell([defaultStyle("shape")]);
    expect(marks.center_bottom.at(0)?.color).toEqual({ type: "theme", name: "text-accent" });
  });

  it("resolves a new corner to a visible triangle", () => {
    const { corners } = resolveCell([defaultStyle("corner")]);
    expect(corners.at(0)?.color).toEqual({ type: "theme", name: "text-accent" });
  });

  it("gives a new icon a glyph to render", () => {
    expect(defaultStyle("icon").icon).not.toBe("");
  });

  it("resolves a new icon to a visible color", () => {
    const { marks } = resolveCell([defaultStyle("icon")]);
    expect(marks.center_top.at(0)?.color).toEqual({ type: "theme", name: "text-accent" });
  });

  it("defaults a shape style to a circle at the bottom", () => {
    const style = defaultStyle("shape");
    expect(style.shape).toBe("circle");
    expect(style.placement_y).toBe("bottom");
  });
});

describe("defaultCondition", () => {
  it("points a new offset condition at the interval's first day", () => {
    expect(defaultCondition("offset")).toEqual({ type: "offset", offset: 1 });
  });

  it("defaults a note-size condition to words greater than zero", () => {
    expect(defaultCondition("note-size")).toEqual({ type: "note-size", unit: "words", condition: "gt", value: 0 });
  });

  it("defaults has-notelet to matching any type", () => {
    expect(defaultCondition("has-notelet")).toEqual({ type: "has-notelet", typeIds: [] });
  });
});
