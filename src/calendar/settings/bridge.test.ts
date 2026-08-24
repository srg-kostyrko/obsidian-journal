import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { nextTick } from "vue";

import type { Calendar } from "@/calendar";
import { testCalendar } from "@/calendar/testing";
import { testContainer } from "@/testing";

import { CalendarSettingsBridge } from "./bridge";
import { calendarSettingsCoreModule } from "./module";
import { calendarSlice } from "./slice";

describe("CalendarSettingsBridge", () => {
  let applySpy: MockInstance<Calendar["applyWeekConfig"]>;

  beforeEach(() => {
    applySpy = vi.spyOn(testCalendar(), "applyWeekConfig");
    applySpy.mockClear();
  });

  afterEach(() => {
    applySpy.mockRestore();
  });

  it('pushes "locale" on first construction when slice defaults to locale', async () => {
    await testContainer({ modules: [calendarSettingsCoreModule] });
    expect(applySpy).toHaveBeenCalledWith("locale", { propagateToGlobal: false });
  });

  it("pushes the custom week when the slice changes to custom", async () => {
    const harness = await testContainer({ modules: [calendarSettingsCoreModule] });
    applySpy.mockClear();
    harness.settings.getSlice(calendarSlice).state = { mode: "custom", dow: 0, doy: 6, global: false };
    await nextTick();
    expect(applySpy).toHaveBeenCalledWith({ dow: 0, doy: 6 }, { propagateToGlobal: false });
  });

  it("propagates the global flag when slice global is true", async () => {
    const harness = await testContainer({ modules: [calendarSettingsCoreModule] });
    applySpy.mockClear();
    harness.settings.getSlice(calendarSlice).state = { mode: "custom", dow: 1, doy: 4, global: true };
    await nextTick();
    expect(applySpy).toHaveBeenCalledWith({ dow: 1, doy: 4 }, { propagateToGlobal: true });
  });

  it('pushes "locale" again when slice reverts to locale', async () => {
    const harness = await testContainer({
      modules: [calendarSettingsCoreModule],
      data: { calendar: { mode: "custom", dow: 1, doy: 4, global: false } },
    });
    applySpy.mockClear();
    harness.settings.getSlice(calendarSlice).state = { mode: "locale" };
    await nextTick();
    expect(applySpy).toHaveBeenCalledWith("locale", { propagateToGlobal: false });
  });

  it("does not crash when constructed before SettingsService.initialize", async () => {
    let callsAtConstruction = -1;
    await testContainer({
      modules: [calendarSettingsCoreModule],
      // `overrides` runs before `settings.initialize()`, not just before `autoLoad` — that's
      // the window this test needs to force construction ahead of initialize.
      overrides: [
        (container) => {
          container.resolve(CalendarSettingsBridge);
          callsAtConstruction = applySpy.mock.calls.length;
        },
      ],
    });
    expect(callsAtConstruction).toBe(0);
    expect(applySpy).toHaveBeenCalledWith("locale", { propagateToGlobal: false });
  });
});
