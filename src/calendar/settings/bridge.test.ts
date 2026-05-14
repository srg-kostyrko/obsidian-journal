import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type { Container } from "@/infrastructure/di";
import { createSettingsService } from "@/settings/testing";

import { Calendar } from "../calendar";

import { CalendarSettingsBridge } from "./bridge";
import { calendarSlice } from "./slice";

import type { CalendarSliceState } from "./slice";

describe("CalendarSettingsBridge", () => {
  let container: Container;
  let calendar: Calendar;
  let applySpy: MockInstance<Calendar["applyWeekConfig"]>;

  function build(raw?: { calendar?: CalendarSliceState }) {
    const settings = createSettingsService({
      slices: [calendarSlice],
      raw: raw === undefined ? undefined : { version: 3, ...raw },
    });
    container = settings.container;
    calendar = new Calendar();
    container.register(Calendar).useValue(calendar);
    applySpy = vi.spyOn(calendar, "applyWeekConfig");
    container.register(CalendarSettingsBridge).useClass(CalendarSettingsBridge);
    return { settings: settings.service };
  }

  beforeEach(() => {
    applySpy?.mockReset();
  });

  afterEach(() => {
    void container?.dispose().catch(() => null);
  });

  it('pushes "locale" on first construction when slice defaults to locale', async () => {
    const { settings } = build();
    await settings.initialize();
    container.resolve(CalendarSettingsBridge);
    expect(applySpy).toHaveBeenCalledWith("locale", { propagateToGlobal: false });
  });

  it("pushes the custom week when the slice changes to custom", async () => {
    const { settings } = build();
    await settings.initialize();
    container.resolve(CalendarSettingsBridge);
    applySpy.mockClear();
    settings.getSlice(calendarSlice).state = { mode: "custom", dow: 0, doy: 6, global: false };
    await Promise.resolve();
    expect(applySpy).toHaveBeenCalledWith({ dow: 0, doy: 6 }, { propagateToGlobal: false });
  });

  it("propagates the global flag when slice global is true", async () => {
    const { settings } = build();
    await settings.initialize();
    container.resolve(CalendarSettingsBridge);
    applySpy.mockClear();
    settings.getSlice(calendarSlice).state = { mode: "custom", dow: 1, doy: 4, global: true };
    await Promise.resolve();
    expect(applySpy).toHaveBeenCalledWith({ dow: 1, doy: 4 }, { propagateToGlobal: true });
  });

  it('pushes "locale" again when slice reverts to locale', async () => {
    const { settings } = build({ calendar: { mode: "custom", dow: 1, doy: 4, global: false } });
    await settings.initialize();
    container.resolve(CalendarSettingsBridge);
    applySpy.mockClear();
    settings.getSlice(calendarSlice).state = { mode: "locale" };
    await Promise.resolve();
    expect(applySpy).toHaveBeenCalledWith("locale", { propagateToGlobal: false });
  });
});
