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
});
