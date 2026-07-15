import { describe, expect, it } from "vitest";

import { defaultStyle } from "./defaults";

// A freshly added style should render something out of the box, matching v2's visible defaults,
// rather than being invisible until the user configures it.
describe("defaultStyle", () => {
  it("defaults a color style to a visible theme color", () => {
    const style = defaultStyle("color");
    expect(style.color).toEqual({ type: "theme", name: "text-normal" });
  });

  it("shows the left side of a new border by default", () => {
    const style = defaultStyle("border");
    expect(style.left.show).toBe(true);
    expect(style.right.show).toBe(false);
    expect(style.top.show).toBe(false);
    expect(style.bottom.show).toBe(false);
  });

  it("defaults a shape style to a circle at the bottom", () => {
    const style = defaultStyle("shape");
    expect(style.shape).toBe("circle");
    expect(style.placement_y).toBe("bottom");
  });

  it("defaults an icon style to the top placement", () => {
    const style = defaultStyle("icon");
    expect(style.placement_y).toBe("top");
  });
});
