import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { WeekPresetApplierToken } from "@/calendar";
import { Calendar } from "@/calendar/calendar";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { m } from "@/i18n";
import { AsyncResult } from "@/infrastructure/result";
import { journalsCoreModule } from "@/journals/module";
import { journalsSettingsCoreModule } from "@/journals/settings/module";
import { ReloadHintService, type SettingsService } from "@/settings";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { calendarDisplaySlice } from "../display-slice";
import { calendarSlice } from "../slice";

import CalendarWeekBlock from "./CalendarWeekBlock.vue";
import { weekPresetPickerModal } from "./modals";

import type { CalendarSliceState } from "../slice";

async function setupContainer(initial?: CalendarSliceState): Promise<{
  harness: TestHarness;
  applier: { apply: ReturnType<typeof vi.fn> };
}> {
  let settings!: SettingsService;
  // Mirrors WeekPresetService.apply: the real applier writes the slice synchronously before
  // it awaits the re-anchor, so reload-hint tests stay sensitive to call order against a
  // stub that does the same.
  const applier = {
    apply: vi.fn((next: CalendarSliceState) => {
      settings.getSlice(calendarSlice).state = next;
      return AsyncResult.ok();
    }),
  };
  const harness = await testContainer({
    modules: [journalsCoreModule, journalsSettingsCoreModule, calendarSettingsCoreModule],
    data: { calendar: initial ?? { mode: "locale" }, calendarDisplay: {} },
    overrides: [overrideWith(WeekPresetApplierToken, applier)],
  });
  settings = harness.settings;
  return { harness, applier };
}

async function openSection(): Promise<void> {
  await userEvent.click(screen.getByText(m.common_label_calendar()));
}

// The section holds several toggles, so each one is reached through the row that names it.
function toggleInRow(name: string): HTMLElement {
  const row = screen.getByText(name).closest(".setting-item");
  if (!row) throw new Error(`no setting row named ${name}`);
  return within(row as HTMLElement).getByRole("checkbox");
}

const weekendState = (harness: TestHarness) => harness.settings.getSlice(calendarDisplaySlice).state.weekend;

describe("CalendarWeekBlock", () => {
  it("starts collapsed and hides the inner settings", async () => {
    const { harness } = await setupContainer();
    harness.render(CalendarWeekBlock);
    expect(screen.queryByText(m.calendar_week_config_change())).toBeNull();
  });

  it("renders the Change button once expanded", async () => {
    const { harness } = await setupContainer();
    harness.render(CalendarWeekBlock);
    await openSection();
    expect(screen.getByText(m.calendar_week_config_change())).toBeTruthy();
  });

  it("hides the global toggle when mode is locale", async () => {
    const { harness } = await setupContainer({ mode: "locale" });
    harness.render(CalendarWeekBlock);
    await openSection();
    expect(screen.queryByText(m.calendar_apply_globally_title())).toBeNull();
  });

  it("shows the global toggle when mode is custom", async () => {
    const { harness } = await setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    harness.render(CalendarWeekBlock);
    await openSection();
    expect(screen.getByText(m.calendar_apply_globally_title())).toBeTruthy();
  });

  it("opens the modal when Change is clicked", async () => {
    const { harness } = await setupContainer();
    harness.render(CalendarWeekBlock);
    await openSection();
    await userEvent.click(screen.getByText(m.calendar_week_config_change()));
    const opened = harness.modals.lastOpen<{ current: CalendarSliceState }, CalendarSliceState>();
    expect(opened.definition).toBe(weekPresetPickerModal);
    expect(opened.props).toEqual({ current: { mode: "locale" } });
  });

  it("shows the active preset name in the description", async () => {
    const { harness } = await setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    harness.render(CalendarWeekBlock);
    await openSection();
    expect(screen.getByText(m.calendar_preset_name({ preset: "iso-8601" }))).toBeTruthy();
  });

  it("shows a dynamic summary when the current week settings do not match a named preset", async () => {
    const { harness } = await setupContainer({ mode: "custom", dow: 3, doy: 7, global: false });
    harness.render(CalendarWeekBlock);
    await openSection();
    expect(screen.getByText(m.calendar_preset_name({ preset: "custom" }), { selector: ".preset-name" })).toBeTruthy();
    expect(screen.getByText(/Wednesday/)).toBeTruthy();
    expect(screen.getByText(/Jan 3\b/)).toBeTruthy();
  });

  it("flips slice.state.global when the apply-globally toggle is clicked", async () => {
    const { harness } = await setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    harness.render(CalendarWeekBlock);
    await openSection();
    await userEvent.click(toggleInRow(m.calendar_apply_globally_title()));
    const state = harness.settings.getSlice(calendarSlice).state;
    expect(state).toEqual({ mode: "custom", dow: 1, doy: 4, global: true });
  });

  it("writes timelineNavigation to the display slice when its toggle is flipped", async () => {
    const { harness } = await setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    harness.render(CalendarWeekBlock);
    await openSection();

    await userEvent.click(toggleInRow(m.calendar_timeline_navigation_label()));

    expect(harness.settings.getSlice(calendarDisplaySlice).state.timelineNavigation).toBe(true);
  });

  it("requests a reload when the apply-globally toggle is flipped", async () => {
    const { harness } = await setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    harness.render(CalendarWeekBlock);
    await openSection();
    await userEvent.click(toggleInRow(m.calendar_apply_globally_title()));
    expect(harness.resolve(ReloadHintService).pending.value).toBe(true);
  });

  it("does not request a reload for a preset change that never touches the global patch", async () => {
    const { harness, applier } = await setupContainer();
    harness.render(CalendarWeekBlock);
    await openSection();
    await userEvent.click(screen.getByText(m.calendar_week_config_change()));
    harness.modals
      .lastOpen<{ current: CalendarSliceState }, CalendarSliceState>()
      .submit({ mode: "custom", dow: 0, doy: 6, global: false });
    // The tap callback that requests the reload hint and hands off to the applier settles
    // asynchronously across several promise hops; wait for the applier call as the signal
    // that it has run before reading the (otherwise-default) reload-hint flag.
    await vi.waitFor(() => expect(applier.apply).toHaveBeenCalled());
    expect(harness.resolve(ReloadHintService).pending.value).toBe(false);
  });

  it("requests a reload when the picked preset turns the global patch on", async () => {
    const { harness, applier } = await setupContainer();
    harness.render(CalendarWeekBlock);
    await openSection();
    await userEvent.click(screen.getByText(m.calendar_week_config_change()));
    harness.modals
      .lastOpen<{ current: CalendarSliceState }, CalendarSliceState>()
      .submit({ mode: "custom", dow: 0, doy: 6, global: true });
    await vi.waitFor(() => expect(applier.apply).toHaveBeenCalled());
    expect(harness.resolve(ReloadHintService).pending.value).toBe(true);
  });

  it("hands the picked preset to the applier", async () => {
    const { harness, applier } = await setupContainer();
    harness.render(CalendarWeekBlock);
    await openSection();

    await userEvent.click(screen.getByText(m.calendar_week_config_change()));
    harness.modals
      .lastOpen<{ current: CalendarSliceState }, CalendarSliceState>()
      .submit({ mode: "custom", dow: 0, doy: 6, global: false });

    await vi.waitFor(() =>
      expect(applier.apply).toHaveBeenCalledWith({ mode: "custom", dow: 0, doy: 6, global: false }),
    );
  });

  describe("weekend days", () => {
    it("names the locale weekend through the conjunction in week order", async () => {
      const { harness } = await setupContainer();
      harness.render(CalendarWeekBlock);
      await openSection();
      expect(screen.getByText(m.calendar_weekend_label())).toBeTruthy();
      expect(screen.getByText("Saturday and Sunday")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Friday" })).toBeNull();
    });

    it("seeds the custom days with the resolved locale weekend", async () => {
      const { harness } = await setupContainer();
      harness.render(CalendarWeekBlock);
      await openSection();
      await userEvent.selectOptions(screen.getByDisplayValue(m.calendar_weekend_locale()), "custom");
      expect(weekendState(harness)).toEqual({ type: "custom", days: [0, 6] });
    });

    it("offers seven day toggles in week order and writes the picked days", async () => {
      const { harness } = await setupContainer();
      harness.render(CalendarWeekBlock);
      await openSection();
      await userEvent.selectOptions(screen.getByDisplayValue(m.calendar_weekend_locale()), "custom");
      const group = screen.getByRole("group", { name: m.calendar_weekend_label() });
      expect(
        within(group)
          .getAllByRole("button")
          .map((b) => b.textContent?.trim()),
      ).toEqual(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
      await userEvent.click(within(group).getByRole("button", { name: "Friday" }));
      await userEvent.click(within(group).getByRole("button", { name: "Sunday" }));
      expect(weekendState(harness)).toEqual({ type: "custom", days: [5, 6] });
    });

    it("writes an empty weekend and says so when every day is off", async () => {
      const { harness } = await setupContainer();
      harness.render(CalendarWeekBlock);
      await openSection();
      await userEvent.selectOptions(screen.getByDisplayValue(m.calendar_weekend_locale()), "custom");
      const group = screen.getByRole("group", { name: m.calendar_weekend_label() });
      await userEvent.click(within(group).getByRole("button", { name: "Sunday" }));
      await userEvent.click(within(group).getByRole("button", { name: "Saturday" }));
      expect(weekendState(harness)).toEqual({ type: "custom", days: [] });
      expect(screen.getByText("No weekend")).toBeTruthy();
    });

    it("reorders the day toggles when the week grid changes while open", async () => {
      const { harness } = await setupContainer();
      harness.render(CalendarWeekBlock);
      await openSection();
      await userEvent.selectOptions(screen.getByDisplayValue(m.calendar_weekend_locale()), "custom");
      const names = () =>
        within(screen.getByRole("group", { name: m.calendar_weekend_label() }))
          .getAllByRole("button")
          .map((b) => b.textContent?.trim());
      expect(names()[0]).toBe("Sunday");
      harness.resolve(Calendar).applyWeekConfig({ dow: 1, doy: 4 }, { propagateToGlobal: false });
      await nextTick();
      expect(names()[0]).toBe("Monday");
      harness.resolve(Calendar).applyWeekConfig("locale", { propagateToGlobal: false });
    });

    it("returns to the locale weekend", async () => {
      const { harness } = await setupContainer();
      harness.render(CalendarWeekBlock);
      await openSection();
      await userEvent.selectOptions(screen.getByDisplayValue(m.calendar_weekend_locale()), "custom");
      await userEvent.selectOptions(screen.getByDisplayValue(m.calendar_weekend_custom()), "locale");
      expect(weekendState(harness)).toEqual({ type: "locale" });
    });

    it("leaves the weekend alone when a week preset is applied", async () => {
      const { harness } = await setupContainer();
      harness.settings.getSlice(calendarDisplaySlice).state = {
        ...harness.settings.getSlice(calendarDisplaySlice).state,
        weekend: { type: "custom", days: [5] },
      };
      harness.render(CalendarWeekBlock);
      await openSection();
      await userEvent.click(screen.getByText(m.calendar_week_config_change()));
      harness.modals
        .lastOpen<{ current: CalendarSliceState }, CalendarSliceState>()
        .submit({ mode: "custom", dow: 1, doy: 4, global: false });
      await vi.waitFor(() => expect(harness.settings.getSlice(calendarSlice).state.mode).toBe("custom"));
      expect(weekendState(harness)).toEqual({ type: "custom", days: [5] });
    });
  });
});
