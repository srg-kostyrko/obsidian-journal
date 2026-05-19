import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Clock } from "./clock";
import { installTestCalendar } from "./testing";

describe("Clock", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    vi.useRealTimers();
  });

  describe("now", () => {
    it("returns a Clock formatted at the frozen local wall time", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 2, 14, 15, 9, 0));

      expect(Clock.now().format("YYYY-MM-DD")).toBe("2025-03-14");
    });
  });

  describe("format", () => {
    it("formats time-of-day patterns", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 2, 14, 15, 9, 0));

      expect(Clock.now().format("HH:mm")).toBe("15:09");
    });

    it("formats arbitrary moment patterns combining date and time", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 2, 14, 15, 9, 0));

      expect(Clock.now().format("YYYY-MM-DD HH:mm")).toBe("2025-03-14 15:09");
    });
  });

  describe("msUntilNextLocalMidnight", () => {
    it("returns ms until next local midnight at midday", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 2, 14, 12, 0, 0, 0)); // 12:00 local
      // 12 hours = 12 * 3600 * 1000 = 43_200_000 ms
      expect(Clock.msUntilNextLocalMidnight()).toBe(12 * 60 * 60 * 1000);
    });

    it("returns one full day when called at midnight", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 2, 14, 0, 0, 0, 0));
      expect(Clock.msUntilNextLocalMidnight()).toBe(24 * 60 * 60 * 1000);
    });

    it("returns a small positive number just before midnight", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 2, 14, 23, 59, 59, 500));
      expect(Clock.msUntilNextLocalMidnight()).toBe(500);
    });
  });
});
