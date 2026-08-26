import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, Clock } from "@/calendar";
import { anchor } from "@/calendar/testing";

import { applyModifiers, applyOffsets, unapplyModifiers, unapplyOffsets } from "./modifiers";

import type { Modifier } from "./types";

describe("applyModifiers / unapplyModifiers", () => {
  describe("apply", () => {
    it("applies a +1d shift", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-01"));
      const result = applyModifiers(date, [{ kind: "shift", sign: 1, amount: 1, unit: "d" }]);
      expect(result.toAnchor()).toBe("2022-01-02");
    });

    it("applies arithmetic shifts before boundary snapping", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-01"));
      const mods: Modifier[] = [
        { kind: "shift", sign: 1, amount: 1, unit: "w" },
        { kind: "boundary", direction: "start", unit: "month" },
      ];
      const result = applyModifiers(date, mods);
      expect(result.toAnchor()).toBe("2022-01-01"); // +1w → 2022-01-08, then startOf month → 2022-01-01
    });

    it("leaves a date untouched for an offset modifier", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-01"));
      const result = applyModifiers(date, [{ kind: "offset", sign: 1, amount: 3 }]);
      expect(result.toAnchor()).toBe("2022-01-01");
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

describe("applyModifiers on Clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies shifts then boundaries to a Clock", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const clock = Clock.now();
    const result = applyModifiers(clock, [
      { kind: "shift", sign: 1, amount: 1, unit: "d" },
      { kind: "boundary", direction: "start", unit: "day" },
    ]);
    expect(result.format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-21 00:00:00");
  });

  it("silently ignores unknown boundary units on Clock", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const clock = Clock.now();
    const result = applyModifiers(clock, [{ kind: "boundary", direction: "start", unit: "decade" }]);
    expect(result.format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-20 10:37:42");
  });
});

describe("applyOffsets / unapplyOffsets", () => {
  it("adds a positive offset", () => {
    expect(applyOffsets(4, [{ kind: "offset", sign: 1, amount: 3 }])).toBe(7);
  });

  it("subtracts a negative offset", () => {
    expect(applyOffsets(4, [{ kind: "offset", sign: -1, amount: 3 }])).toBe(1);
  });

  it("goes negative when the offset exceeds the value", () => {
    expect(applyOffsets(2, [{ kind: "offset", sign: -1, amount: 5 }])).toBe(-3);
  });

  it("sums several offsets", () => {
    const mods: Modifier[] = [
      { kind: "offset", sign: 1, amount: 3 },
      { kind: "offset", sign: -1, amount: 1 },
    ];
    expect(applyOffsets(4, mods)).toBe(6);
  });

  it("ignores date modifiers", () => {
    const mods: Modifier[] = [
      { kind: "shift", sign: 1, amount: 1, unit: "d" },
      { kind: "boundary", direction: "start", unit: "week" },
    ];
    expect(applyOffsets(4, mods)).toBe(4);
  });

  it("round-trips through unapplyOffsets", () => {
    const mods: Modifier[] = [{ kind: "offset", sign: 1, amount: 3 }];
    expect(unapplyOffsets(applyOffsets(4, mods), mods)).toBe(4);
  });
});
