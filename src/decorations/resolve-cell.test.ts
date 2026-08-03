import { describe, expect, it } from "vitest";

import { declaredProperties, formatPadding, mergePadding, resolveCell, type ResolvedCell } from "./resolve-cell";
import { buildStyle } from "./testing";
import { colorToString } from "./ui/color";

import type { JournalDecorationStyle } from "./config";

describe("resolveCell", () => {
  describe("background", () => {
    it("inherits when no background style is present", () => {
      expect(resolveCell([]).background).toBe("inherit");
    });

    it("takes the last background declaration", () => {
      const earlier = buildStyle("background", { color: { type: "custom", color: "#aaaaaa" } });
      const later = buildStyle("background", { color: { type: "custom", color: "#bbbbbb" } });
      expect(resolveCell([earlier, later]).background).toBe("#bbbbbb");
    });

    it("clears an earlier background when a later one is transparent", () => {
      const opaque = buildStyle("background", { color: { type: "custom", color: "#aaaaaa" } });
      const cleared = buildStyle("background", { color: { type: "transparent" } });
      expect(resolveCell([opaque, cleared]).background).toBe("transparent");
    });
  });

  describe("text color", () => {
    it("inherits when no color style is present", () => {
      expect(resolveCell([]).textColor).toBe("inherit");
    });

    it("takes the last color declaration", () => {
      const earlier = buildStyle("color", { color: { type: "custom", color: "#a1a1a1" } });
      const later = buildStyle("color", { color: { type: "custom", color: "#b2b2b2" } });
      expect(resolveCell([earlier, later]).textColor).toBe("#b2b2b2");
    });
  });

  describe("border", () => {
    it("leaves every side unset when no border style is present", () => {
      expect(resolveCell([]).border).toEqual({ top: "none", right: "none", bottom: "none", left: "none" });
    });

    it("declares all four sides from a uniform border", () => {
      const border = buildStyle("border", {
        border: "uniform",
        left: { show: true, width: 2, style: "solid", color: { type: "custom" as const, color: "#000000" } },
      });
      expect(resolveCell([border]).border).toEqual({
        top: "2px solid #000000",
        right: "2px solid #000000",
        bottom: "2px solid #000000",
        left: "2px solid #000000",
      });
    });

    it("declares only the shown sides in per-side mode", () => {
      const border = buildStyle("border", {
        border: "different",
        left: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#ff0000" } },
        right: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
        top: { show: true, width: 3, style: "dashed", color: { type: "custom", color: "#00ff00" } },
        bottom: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
      });
      expect(resolveCell([border]).border).toEqual({
        top: "3px dashed #00ff00",
        right: "none",
        bottom: "none",
        left: "1px solid #ff0000",
      });
    });

    it("replaces a side with a later shown declaration of that side", () => {
      const earlier = buildStyle("border", {
        border: "different",
        top: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#ff0000" } },
      });
      const later = buildStyle("border", {
        border: "different",
        top: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#00ff00" } },
      });
      expect(resolveCell([earlier, later]).border.top).toBe("2px solid #00ff00");
    });

    it("keeps a side when a later declaration hides that side", () => {
      const earlier = buildStyle("border", {
        border: "different",
        top: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#ff0000" } },
      });
      const abstaining = buildStyle("border", {
        border: "different",
        top: { show: false, width: 5, style: "solid", color: { type: "custom", color: "#00ff00" } },
      });
      expect(resolveCell([earlier, abstaining]).border.top).toBe("1px solid #ff0000");
    });
  });

  describe("corners", () => {
    it("keeps only the last corner at a placement", () => {
      const earlier = buildStyle("corner", { placement: "top-left", color: { type: "custom", color: "#aa0000" } });
      const later = buildStyle("corner", { placement: "top-left", color: { type: "custom", color: "#00aa00" } });
      expect(resolveCell([earlier, later]).corners).toEqual([later]);
    });

    it("keeps corners that sit at different placements", () => {
      const topLeft = buildStyle("corner", { placement: "top-left" });
      const bottomRight = buildStyle("corner", { placement: "bottom-right" });
      expect(resolveCell([topLeft, bottomRight]).corners).toEqual([topLeft, bottomRight]);
    });
  });

  describe("marks", () => {
    it("groups a shape into the slot named by its placement", () => {
      const shape = buildStyle("shape", { placement_x: "left", placement_y: "top" });
      expect(resolveCell([shape]).marks.left_top).toEqual([shape]);
    });

    it("groups an icon into the slot named by its placement", () => {
      const icon = buildStyle("icon", { placement_x: "right", placement_y: "bottom" });
      expect(resolveCell([icon]).marks.right_bottom).toEqual([icon]);
    });

    it("leaves a slot no mark names empty", () => {
      const shape = buildStyle("shape", { placement_x: "left", placement_y: "top" });
      expect(resolveCell([shape]).marks.center_middle).toEqual([]);
    });

    it("keeps every mark sharing a slot in cascade order", () => {
      const earlier = buildStyle("shape", { placement_x: "center", placement_y: "bottom", size: 0.3 });
      const later = buildStyle("shape", { placement_x: "center", placement_y: "bottom", size: 0.5 });
      expect(resolveCell([earlier, later]).marks.center_bottom).toEqual([earlier, later]);
    });
  });

  describe("padding", () => {
    it("reserves a shape's size on its placement side", () => {
      const shape = buildStyle("shape", { size: 0.6, placement_y: "top", placement_x: "center" });
      expect(formatPadding(resolveCell([shape]).padding)).toMatch(/max\(0\.7em, 2px\)/);
    });

    it("reserves a uniform border's left width on all four sides", () => {
      const wide = { show: true, width: 99, style: "solid", color: { type: "custom" as const, color: "#000000" } };
      const border = buildStyle("border", {
        border: "uniform",
        left: { show: true, width: 4, style: "solid", color: { type: "custom", color: "#000000" } },
        right: wide,
        top: wide,
        bottom: wide,
      });
      const padding = formatPadding(resolveCell([border]).padding);
      expect(padding.split("max(0.1em, 6px)").length - 1).toBe(4);
    });
  });
});

describe("mergePadding", () => {
  it("takes the per-side maximum reservation across cells", () => {
    const bottomShape = buildStyle("shape", { size: 0.4, placement_y: "bottom", placement_x: "center" });
    const topShape = buildStyle("shape", { size: 0.6, placement_y: "top", placement_x: "center" });
    const padding = formatPadding(mergePadding([resolveCell([bottomShape]).padding, resolveCell([topShape]).padding]));
    expect(padding).toMatch(/max\(0\.7em, 2px\)/);
    expect(padding).toMatch(/max\(0\.5em, 2px\)/);
  });

  it("reserves the base extents when no cell is decorated", () => {
    expect(formatPadding(mergePadding([]))).toBe(formatPadding(resolveCell([]).padding));
  });
});

describe("declaredProperties", () => {
  const ALL_PROPERTIES = [
    "background",
    "textColor",
    "border.top",
    "border.right",
    "border.bottom",
    "border.left",
    "corner.top-left",
    "corner.top-right",
    "corner.bottom-left",
    "corner.bottom-right",
  ] as const;

  // Reading a resolved cell property by its ExclusiveProperty name, so the two
  // implementations can be compared without either knowing about the other.
  function read(cell: ResolvedCell, property: (typeof ALL_PROPERTIES)[number]): string {
    if (property === "background") return cell.background;
    if (property === "textColor") return cell.textColor;
    if (property.startsWith("border.")) {
      const side = property.slice("border.".length) as "top" | "right" | "bottom" | "left";
      return cell.border[side];
    }
    const placement = property.slice("corner.".length);
    const corner = cell.corners.find((c) => c.placement === placement);
    return corner ? colorToString(corner.color) : "none";
  }

  const cases: { name: string; style: JournalDecorationStyle }[] = [
    { name: "a background style", style: buildStyle("background", { color: { type: "custom", color: "#123456" } }) },
    { name: "a color style", style: buildStyle("color", { color: { type: "custom", color: "#654321" } }) },
    {
      name: "a uniform border",
      style: buildStyle("border", {
        border: "uniform",
        left: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#abcdef" } },
      }),
    },
    {
      name: "a per-side border with one shown side",
      style: buildStyle("border", {
        border: "different",
        top: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#abcdef" } },
        left: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
        right: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
        bottom: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
      }),
    },
    {
      name: "a per-side border with every side hidden",
      style: buildStyle("border", {
        border: "different",
        top: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
        left: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
        right: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
        bottom: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
      }),
    },
    {
      name: "a uniform border that is hidden",
      style: buildStyle("border", {
        border: "uniform",
        left: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
      }),
    },
    {
      name: "a corner",
      style: buildStyle("corner", { placement: "top-right", color: { type: "custom", color: "#0abcde" } }),
    },
    { name: "a shape", style: buildStyle("shape", { color: { type: "custom", color: "#111111" } }) },
    { name: "an icon", style: buildStyle("icon", { color: { type: "custom", color: "#222222" } }) },
  ];

  for (const { name, style } of cases) {
    it(`reports exactly the properties ${name} changes when resolved`, () => {
      const before = resolveCell([]);
      const after = resolveCell([style]);
      const changed = ALL_PROPERTIES.filter((property) => read(after, property) !== read(before, property));

      expect([...declaredProperties(style)].toSorted()).toEqual([...changed].toSorted());
    });
  }
});
