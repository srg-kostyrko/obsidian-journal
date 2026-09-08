import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { calendarSettingsModule, calendarSlice } from "@/calendar";
import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../../module";
import { fixedJournal } from "../../testing";
import { journalStartupCoreModule } from "../module";
import { startupSlice } from "../slice";
import { journalStartupUiModule } from "../ui-module";

import StartupBlock from "./StartupBlock.vue";

import type { StartupOverride } from "../slice";

// calendarSettingsModule is what registers the calendar slice the weekday chips read their order
// from — without it useWeekdays() throws UnregisteredSliceError.
const MODULES = [journalsCoreModule, journalStartupCoreModule, journalStartupUiModule, calendarSettingsModule];
const JOURNALS = {
  daily: fixedJournal("daily", { type: "day" }),
  weekly: fixedJournal("weekly", { type: "week" }),
};
const SATURDAY = 6;

function chipLabels(): string[] {
  return within(screen.getAllByRole("group")[0])
    .getAllByRole("button")
    .map((chip) => chip.textContent?.trim() ?? "");
}

function overridesOf(harness: TestHarness): readonly StartupOverride[] {
  return harness.settings.getSlice(startupSlice).state.overrides;
}

function seedOverrides(overrides: StartupOverride[]): Promise<TestHarness> {
  return testContainer({
    modules: MODULES,
    data: { journals: JOURNALS, startup: { journalName: "daily", overrides } },
  });
}

async function expand(): Promise<void> {
  await userEvent.click(screen.getByText(m.startup_dashboard_section_title()));
}

describe("StartupBlock", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: MODULES,
      data: { journals: JOURNALS, startup: { journalName: "" } },
    });
  });

  it("offers a 'Don't open' choice plus one option per journal", async () => {
    harness.render(StartupBlock);
    await expand();
    expect(screen.getByRole("option", { name: m.startup_dont_open_option() })).toBeTruthy();
    expect(screen.getByRole("option", { name: "daily" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "weekly" })).toBeTruthy();
  });

  it("writes the chosen journal to the slice", async () => {
    harness.render(StartupBlock);
    await expand();
    await userEvent.selectOptions(screen.getByRole("combobox"), "weekly");
    expect(harness.settings.getSlice(startupSlice).state.journalName).toBe("weekly");
  });

  describe("weekday overrides", () => {
    it("adds an override claiming no days yet", async () => {
      harness.render(StartupBlock);
      await expand();

      await userEvent.click(screen.getByRole("button", { name: m.startup_weekday_add() }));

      expect(overridesOf(harness)).toEqual([{ weekdays: [], journalName: "" }]);
    });

    it("claims a weekday for the override when its day is clicked", async () => {
      harness = await seedOverrides([{ weekdays: [], journalName: "weekly" }]);
      harness.render(StartupBlock);
      await expand();

      await userEvent.click(screen.getByRole("button", { name: "Sat" }));

      expect(overridesOf(harness)).toEqual([{ weekdays: [SATURDAY], journalName: "weekly" }]);
    });

    it("writes the journal chosen for an override", async () => {
      harness = await seedOverrides([{ weekdays: [SATURDAY], journalName: "" }]);
      harness.render(StartupBlock);
      await expand();

      await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "weekly");

      expect(overridesOf(harness)).toEqual([{ weekdays: [SATURDAY], journalName: "weekly" }]);
    });

    it("removes an override", async () => {
      harness = await seedOverrides([{ weekdays: [SATURDAY], journalName: "weekly" }]);
      harness.render(StartupBlock);
      await expand();

      await userEvent.click(screen.getByRole("button", { name: m.startup_weekday_remove() }));

      expect(overridesOf(harness)).toEqual([]);
    });

    it("reorders the weekday chips when the week preset moves the first day", async () => {
      harness = await testContainer({
        modules: MODULES,
        data: {
          journals: JOURNALS,
          startup: { journalName: "daily", overrides: [{ weekdays: [], journalName: "" }] },
          calendar: { mode: "custom", dow: 1, doy: 4, global: false },
        },
      });
      harness.render(StartupBlock);
      await expand();
      expect(chipLabels()).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

      harness.settings.getSlice(calendarSlice).state = { mode: "custom", dow: 0, doy: 6, global: false };
      await nextTick();

      expect(chipLabels()).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    });

    it("disables a weekday another override already claims", async () => {
      harness = await seedOverrides([
        { weekdays: [SATURDAY], journalName: "weekly" },
        { weekdays: [], journalName: "" },
      ]);
      harness.render(StartupBlock);
      await expand();

      const second = screen.getAllByRole("group")[1];
      expect(within(second).getByRole<HTMLButtonElement>("button", { name: "Sat" }).disabled).toBe(true);
      expect(within(second).getByRole<HTMLButtonElement>("button", { name: "Sun" }).disabled).toBe(false);
    });
  });
});
