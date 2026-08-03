import { describe, expect, it } from "vitest";

import { attributeCell } from "./attribute-cell";
import { buildStyle } from "./testing";

import type { JournalDecorationStyle } from "./config";
import type { Contribution } from "./engine";

function contribution(style: JournalDecorationStyle, journalName: string, index = 0): Contribution {
  return { source: { owner: { kind: "journal", journalName }, index }, style };
}

describe("attributeCell", () => {
  it("names the last declaring contribution as the winner", () => {
    const earlier = contribution(buildStyle("background", { color: { type: "custom", color: "#aaaaaa" } }), "a");
    const later = contribution(buildStyle("background", { color: { type: "custom", color: "#bbbbbb" } }), "b");

    const { properties } = attributeCell([earlier, later]);

    expect(properties.find((p) => p.property === "background")?.winner).toBe(later);
  });

  it("reports the contributions a winner overrode in cascade order", () => {
    const first = contribution(buildStyle("background", { color: { type: "custom", color: "#111111" } }), "a");
    const second = contribution(buildStyle("background", { color: { type: "custom", color: "#222222" } }), "b");
    const third = contribution(buildStyle("background", { color: { type: "custom", color: "#333333" } }), "c");

    const { properties } = attributeCell([first, second, third]);

    expect(properties.find((p) => p.property === "background")?.overridden).toEqual([first, second]);
  });

  it("omits a property no contribution declared", () => {
    const only = contribution(buildStyle("background"), "a");

    const { properties } = attributeCell([only]);

    expect(properties.some((p) => p.property === "textColor")).toBe(false);
  });

  it("attributes each border side independently", () => {
    const top = contribution(
      buildStyle("border", {
        border: "different",
        top: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#ff0000" } },
      }),
      "a",
    );
    const left = contribution(
      buildStyle("border", {
        border: "different",
        left: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#00ff00" } },
      }),
      "b",
    );

    const { properties } = attributeCell([top, left]);

    expect(properties.find((p) => p.property === "border.top")?.winner).toBe(top);
  });

  it("leaves an abstaining border side unattributed", () => {
    const hidden = contribution(
      buildStyle("border", {
        border: "different",
        top: { show: false, width: 5, style: "solid", color: { type: "custom", color: "#ff0000" } },
      }),
      "a",
    );

    const { properties } = attributeCell([hidden]);

    expect(properties.some((p) => p.property === "border.top")).toBe(false);
  });

  it("attributes each corner placement independently", () => {
    const topLeft = contribution(buildStyle("corner", { placement: "top-left" }), "a");
    const bottomRight = contribution(buildStyle("corner", { placement: "bottom-right" }), "b");

    const { properties } = attributeCell([topLeft, bottomRight]);

    expect(properties.find((p) => p.property === "corner.bottom-right")?.winner).toBe(bottomRight);
  });

  it("collects marks into their slot in cascade order", () => {
    const earlier = contribution(buildStyle("shape", { placement_x: "center", placement_y: "bottom" }), "a");
    const later = contribution(buildStyle("icon", { placement_x: "center", placement_y: "bottom" }), "b");

    const { marks } = attributeCell([earlier, later]);

    expect(marks.center_bottom).toEqual([earlier, later]);
  });

  it("reports no overrides for marks sharing a slot", () => {
    const earlier = contribution(buildStyle("shape", { placement_x: "center", placement_y: "bottom" }), "a");
    const later = contribution(buildStyle("shape", { placement_x: "center", placement_y: "bottom" }), "b");

    const { properties } = attributeCell([earlier, later]);

    expect(properties).toEqual([]);
  });
});
