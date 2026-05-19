import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";

import { applyModifiers, unapplyModifiers } from "./modifiers";

import type { Modifier } from "./types";

describe("applyModifiers / unapplyModifiers", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("apply", () => {
    it("applies a +1d shift", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-01"));
      const result = applyModifiers(date, [{ kind: "shift", sign: 1, amount: 1, unit: "d" }]);
      expect(result.toAnchor()).toBe("2022-01-02");
    });

    it("applies arithmetic before boundary in v2 order", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-01"));
      const mods: Modifier[] = [
        { kind: "shift", sign: 1, amount: 1, unit: "w" },
        { kind: "boundary", direction: "start", unit: "month" },
      ];
      const result = applyModifiers(date, mods);
      expect(result.toAnchor()).toBe("2022-01-01"); // +1w → 2022-01-08, then startOf month → 2022-01-01
    });
  });

  describe("unapply", () => {
    it("inverts a +1d shift", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-02"));
      const result = unapplyModifiers(date, [{ kind: "shift", sign: 1, amount: 1, unit: "d" }]);
      expect(result.toAnchor()).toBe("2022-01-01");
    });

    it("is identity on boundary modifiers", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-03"));
      const result = unapplyModifiers(date, [{ kind: "boundary", direction: "start", unit: "week" }]);
      expect(result.toAnchor()).toBe("2022-01-03");
    });

    it.each([
      [{ kind: "shift", sign: 1, amount: 3, unit: "d" } as const, "2022-01-01"],
      [{ kind: "shift", sign: -1, amount: 2, unit: "w" } as const, "2022-01-01"],
      [{ kind: "shift", sign: 1, amount: 1, unit: "m" } as const, "2022-01-01"],
      [{ kind: "shift", sign: 1, amount: 1, unit: "q" } as const, "2022-01-01"],
      [{ kind: "shift", sign: 1, amount: 1, unit: "y" } as const, "2022-01-01"],
    ])("round-trips %j", (modifier, source) => {
      const start = CalendarDate.fromAnchor(anchor(source));
      const after = applyModifiers(start, [modifier]);
      const back = unapplyModifiers(after, [modifier]);
      expect(back.toAnchor()).toBe(source);
    });
  });
});
