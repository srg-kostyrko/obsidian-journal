import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { resolveButtonAppearance } from "./button-config";

describe("resolveButtonAppearance", () => {
  describe("pick-date", () => {
    it("uses crosshair + 'pick day' tooltip for single day level", () => {
      expect(resolveButtonAppearance({ type: "pick-date", mode: "navigate", levels: ["day"] })).toEqual({
        icon: "crosshair",
        tooltip: m.common_pick_a_date(),
      });
    });

    it("uses crosshair + 'pick multi' tooltip for multi-level pickers", () => {
      expect(resolveButtonAppearance({ type: "pick-date", mode: "navigate", levels: ["day", "week"] })).toEqual({
        icon: "crosshair",
        tooltip: m.view_toolbar_button_default_tooltip_pick_multi(),
      });
    });
  });

  describe("current single-level", () => {
    it("uses 'Today' label for current[day]", () => {
      const a = resolveButtonAppearance({ type: "current", mode: "create", levels: ["day"] });
      expect(a.label).toBe(m.common_label_today());
      expect(a.icon).toBeUndefined();
    });

    it("uses 'This week' label for current[week]", () => {
      expect(resolveButtonAppearance({ type: "current", mode: "create", levels: ["week"] }).label).toBe(
        m.relative_date_this({ period: "week" }),
      );
    });

    it("uses 'This month' label for current[month]", () => {
      expect(resolveButtonAppearance({ type: "current", mode: "create", levels: ["month"] }).label).toBe(
        m.relative_date_this({ period: "month" }),
      );
    });

    it("uses 'This quarter' label for current[quarter]", () => {
      expect(resolveButtonAppearance({ type: "current", mode: "create", levels: ["quarter"] }).label).toBe(
        m.relative_date_this({ period: "quarter" }),
      );
    });

    it("uses 'This year' label for current[year]", () => {
      expect(resolveButtonAppearance({ type: "current", mode: "create", levels: ["year"] }).label).toBe(
        m.relative_date_this({ period: "year" }),
      );
    });
  });

  describe("current multi-level", () => {
    it("uses 'Current' label + multi tooltip when levels.length > 1", () => {
      const a = resolveButtonAppearance({ type: "current", mode: "create", levels: ["day", "week"] });
      expect(a.label).toBe(m.view_toolbar_button_default_label_current());
      expect(a.tooltip).toBe(m.view_toolbar_button_default_tooltip_current_multi());
    });
  });

  describe("navigate-step prev", () => {
    it("uses chevron-left for week", () => {
      expect(resolveButtonAppearance({ type: "navigate-step", direction: "prev", unit: "week", amount: 1 }).icon).toBe(
        "chevron-left",
      );
    });

    it("uses chevron-left for month", () => {
      expect(resolveButtonAppearance({ type: "navigate-step", direction: "prev", unit: "month", amount: 1 }).icon).toBe(
        "chevron-left",
      );
    });

    it("uses chevrons-left for quarter", () => {
      expect(
        resolveButtonAppearance({ type: "navigate-step", direction: "prev", unit: "quarter", amount: 1 }).icon,
      ).toBe("chevrons-left");
    });

    it("uses chevrons-left for year", () => {
      expect(resolveButtonAppearance({ type: "navigate-step", direction: "prev", unit: "year", amount: 1 }).icon).toBe(
        "chevrons-left",
      );
    });
  });

  describe("navigate-step next", () => {
    it("uses chevron-right for week", () => {
      expect(resolveButtonAppearance({ type: "navigate-step", direction: "next", unit: "week", amount: 1 }).icon).toBe(
        "chevron-right",
      );
    });

    it("uses chevron-right for month", () => {
      expect(resolveButtonAppearance({ type: "navigate-step", direction: "next", unit: "month", amount: 1 }).icon).toBe(
        "chevron-right",
      );
    });

    it("uses chevrons-right for quarter", () => {
      expect(
        resolveButtonAppearance({ type: "navigate-step", direction: "next", unit: "quarter", amount: 1 }).icon,
      ).toBe("chevrons-right");
    });

    it("uses chevrons-right for year", () => {
      expect(resolveButtonAppearance({ type: "navigate-step", direction: "next", unit: "year", amount: 1 }).icon).toBe(
        "chevrons-right",
      );
    });

    it("includes the unit in the next tooltip", () => {
      const a = resolveButtonAppearance({ type: "navigate-step", direction: "next", unit: "year", amount: 1 });
      expect(a.tooltip).toBe(m.view_toolbar_button_default_tooltip_next_unit({ unit: "year" }));
    });
  });
});
