import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { calendarDisplaySlice } from "@/calendar";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { initLocale, m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { calendarAppearanceCoreModule } from "../module";

import AppearanceWeekendSummary from "./AppearanceWeekendSummary.vue";

beforeAll(() => initLocale("en"));

describe("AppearanceWeekendSummary", () => {
  let harness: TestHarness;
  let nav: { back: Mock; push: Mock; replace: Mock };
  const mount = () => harness.render(AppearanceWeekendSummary, { props: { nav } });

  beforeEach(async () => {
    nav = { back: vi.fn(), push: vi.fn(), replace: vi.fn() };
    harness = await testContainer({ modules: [calendarAppearanceCoreModule, calendarSettingsCoreModule] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the locale's weekend Monday first", () => {
    mount();

    expect(
      screen.getByText(m.calendar_appearance_weekend_summary({ mode: "some", days: "Saturday and Sunday" })),
    ).toBeTruthy();
  });

  it("says there is no weekend for a custom empty list", () => {
    const slice = harness.settings.getSlice(calendarDisplaySlice);
    slice.state = { ...slice.state, weekend: { type: "custom", days: [] } };
    mount();

    expect(screen.getByText(m.calendar_appearance_weekend_summary({ mode: "none", days: "" }))).toBeTruthy();
  });

  it("follows a custom weekend", () => {
    const slice = harness.settings.getSlice(calendarDisplaySlice);
    slice.state = { ...slice.state, weekend: { type: "custom", days: [5, 6] } };
    mount();

    expect(
      screen.getByText(m.calendar_appearance_weekend_summary({ mode: "some", days: "Friday and Saturday" })),
    ).toBeTruthy();
  });

  it("returns to the settings dashboard through the frame", async () => {
    mount();

    await userEvent.click(screen.getByRole("button", { name: m.calendar_appearance_weekend_open_settings() }));

    expect(nav.back).toHaveBeenCalledOnce();
  });
});
