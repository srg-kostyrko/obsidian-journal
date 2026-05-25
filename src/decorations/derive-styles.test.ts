import { describe, expect, it } from "vitest";

import { backgroundFrom, borderStylesFrom, cornersFrom, paddingFrom, placedFrom, textColorFrom } from "./derive-styles";
import { buildStyle } from "./testing";

describe("backgroundFrom", () => {
  it("returns 'inherit' when there is no background style", () => {
    expect(backgroundFrom([])).toBe("inherit");
  });

  it("returns the first background style's color (first-wins)", () => {
    const a = buildStyle("background", { color: { type: "custom", color: "#aaa" } });
    const b = buildStyle("background", { color: { type: "custom", color: "#bbb" } });
    expect(backgroundFrom([a, b])).toBe("#aaa");
  });
});

describe("textColorFrom", () => {
  it("returns 'inherit' when there is no color style", () => {
    expect(textColorFrom([])).toBe("inherit");
  });

  it("returns the first color style's color (first-wins)", () => {
    const a = buildStyle("color", { color: { type: "custom", color: "#a1a1a1" } });
    expect(textColorFrom([a])).toBe("#a1a1a1");
  });
});

describe("borderStylesFrom", () => {
  it("returns four 'none' sides when no border style is present", () => {
    expect(borderStylesFrom([])).toEqual({
      borderTop: "none",
      borderRight: "none",
      borderBottom: "none",
      borderLeft: "none",
    });
  });

  it("applies a uniform border to all four sides", () => {
    const border = buildStyle("border", {
      border: "uniform",
      left: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#000" } },
    });
    expect(borderStylesFrom([border])).toEqual({
      borderTop: "2px solid #000",
      borderRight: "2px solid #000",
      borderBottom: "2px solid #000",
      borderLeft: "2px solid #000",
    });
  });

  it("applies different-mode sides independently", () => {
    const border = buildStyle("border", {
      border: "different",
      left: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#f00" } },
      right: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
      top: { show: true, width: 3, style: "dashed", color: { type: "custom", color: "#0f0" } },
      bottom: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
    });
    const result = borderStylesFrom([border]);
    expect(result.borderLeft).toBe("1px solid #f00");
    expect(result.borderTop).toBe("3px dashed #0f0");
    expect(result.borderRight).toBe("none");
    expect(result.borderBottom).toBe("none");
  });
});

describe("paddingFrom", () => {
  it("uses left.width for all four sides when border is uniform (v2 bug fix)", () => {
    const border = buildStyle("border", {
      border: "uniform",
      left: { show: true, width: 4, style: "solid", color: { type: "custom", color: "#000" } },
      right: { show: true, width: 99, style: "solid", color: { type: "custom", color: "#000" } },
      top: { show: true, width: 99, style: "solid", color: { type: "custom", color: "#000" } },
      bottom: { show: true, width: 99, style: "solid", color: { type: "custom", color: "#000" } },
    });
    const padding = paddingFrom([border]);
    expect(padding.split("max(0.1em, 6px)").length - 1).toBe(4);
  });

  it("includes shape size on the placement_y side", () => {
    const shape = buildStyle("shape", { size: 0.6, placement_y: "top", placement_x: "center" });
    const padding = paddingFrom([shape]);
    expect(padding).toMatch(/max\(0\.7em, 2px\)/);
  });
});

describe("placedFrom", () => {
  it("groups shapes/icons into a 9-cell record keyed by placement_x_placement_y", () => {
    const shape = buildStyle("shape", { placement_x: "left", placement_y: "top" });
    const icon = buildStyle("icon", { placement_x: "right", placement_y: "bottom" });
    const placed = placedFrom([shape, icon]);
    expect(placed.left_top).toEqual([shape]);
    expect(placed.right_bottom).toEqual([icon]);
    expect(placed.center_middle).toEqual([]);
  });
});

describe("cornersFrom", () => {
  it("returns all corner decorations in input order", () => {
    const a = buildStyle("corner", { placement: "top-left" });
    const b = buildStyle("corner", { placement: "bottom-right" });
    expect(cornersFrom([a, b])).toEqual([a, b]);
  });
});
