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

  describe("shift", () => {
    beforeEach(() => vi.useFakeTimers());

    it("adds hours", () => {
      vi.setSystemTime(new Date("2026-05-20T10:00:00"));
      expect(Clock.now().shift(2, "h").format("HH:mm")).toBe("12:00");
    });

    it("subtracts hours via negative amount", () => {
      vi.setSystemTime(new Date("2026-05-20T10:00:00"));
      expect(Clock.now().shift(-3, "h").format("HH:mm")).toBe("07:00");
    });

    it("adds days", () => {
      vi.setSystemTime(new Date("2026-05-20T10:30:00"));
      expect(Clock.now().shift(1, "d").format("YYYY-MM-DD HH:mm")).toBe("2026-05-21 10:30");
    });

    it("adds weeks", () => {
      vi.setSystemTime(new Date("2026-05-20T10:30:00"));
      expect(Clock.now().shift(1, "w").format("YYYY-MM-DD")).toBe("2026-05-27");
    });

    it("adds months", () => {
      vi.setSystemTime(new Date("2026-05-20T10:30:00"));
      expect(Clock.now().shift(1, "m").format("YYYY-MM-DD")).toBe("2026-06-20");
    });

    it("adds quarters", () => {
      vi.setSystemTime(new Date("2026-05-20T10:30:00"));
      expect(Clock.now().shift(1, "q").format("YYYY-MM-DD")).toBe("2026-08-20");
    });

    it("adds years", () => {
      vi.setSystemTime(new Date("2026-05-20T10:30:00"));
      expect(Clock.now().shift(1, "y").format("YYYY-MM-DD")).toBe("2027-05-20");
    });
  });

  describe("startOf", () => {
    beforeEach(() => vi.useFakeTimers());

    it("rounds down to hour", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      expect(Clock.now().startOf("hour").format("HH:mm:ss")).toBe("10:00:00");
    });

    it("rounds down to start of day", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      expect(Clock.now().startOf("day").format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-20 00:00:00");
    });

    it("rounds down to start of week", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      expect(Clock.now().startOf("week").format("YYYY-MM-DD")).toBe("2026-05-18");
    });

    it("rounds down to start of month", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      expect(Clock.now().startOf("month").format("YYYY-MM-DD")).toBe("2026-05-01");
    });

    it("rounds down to start of quarter", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      expect(Clock.now().startOf("quarter").format("YYYY-MM-DD")).toBe("2026-04-01");
    });

    it("rounds down to start of year", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      expect(Clock.now().startOf("year").format("YYYY-MM-DD")).toBe("2026-01-01");
    });
  });

  describe("endOf", () => {
    beforeEach(() => vi.useFakeTimers());

    it("rounds up to end of hour", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      expect(Clock.now().endOf("hour").format("HH:mm:ss")).toBe("10:59:59");
    });

    it("rounds up to end of day", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      expect(Clock.now().endOf("day").format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-20 23:59:59");
    });
  });

  describe("shifts and boundaries stack", () => {
    beforeEach(() => vi.useFakeTimers());

    it("applies shift then boundary in caller order", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      expect(Clock.now().shift(1, "d").startOf("day").format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-21 00:00:00");
    });
  });
});
