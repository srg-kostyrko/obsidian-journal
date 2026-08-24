import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope, type ShallowRef } from "vue";

import type { CalendarDate } from "@/calendar";

import { useToday } from "./use-today";

describe("useToday", () => {
  let scope: EffectScope;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 23, 30, 0));
    scope = effectScope();
  });
  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
  });

  const today = (): Readonly<ShallowRef<CalendarDate>> => scope.run(() => useToday())!;

  it("starts on the current local date", () => {
    expect(today().value.toAnchor()).toBe("2026-05-25");
  });

  it("moves to the next date at the local midnight boundary", async () => {
    const date = today();

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1000);

    expect(date.value.toAnchor()).toBe("2026-05-26");
  });

  it("keeps moving on the days after the first rollover", async () => {
    const date = today();

    await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);

    expect(date.value.toAnchor()).toBe("2026-05-27");
  });

  it("re-reads the date when the window regains focus", () => {
    // A suspended machine does not advance Chromium's timers, so the midnight timeout is still
    // pending hours into the next day when the user comes back to a woken laptop.
    const date = today();
    vi.setSystemTime(new Date(2026, 4, 26, 8, 0, 0));

    window.dispatchEvent(new Event("focus"));

    expect(date.value.toAnchor()).toBe("2026-05-26");
  });

  it("re-reads the date when the app returns to the foreground", () => {
    const date = today();
    vi.setSystemTime(new Date(2026, 4, 26, 8, 0, 0));

    window.document.dispatchEvent(new Event("visibilitychange"));

    expect(date.value.toAnchor()).toBe("2026-05-26");
  });
});
