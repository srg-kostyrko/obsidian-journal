import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { initLocale, m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { calendarAppearanceCoreModule } from "../module";
import { appearanceSlice } from "../slice";

import AppearanceBlock from "./AppearanceBlock.vue";

async function openSection(): Promise<void> {
  await userEvent.click(screen.getByText(m.calendar_appearance_section_title()));
}

beforeAll(() => initLocale("en"));

describe("AppearanceBlock", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({ modules: [calendarAppearanceCoreModule] });
  });

  it("starts collapsed and hides the highlight color rows", async () => {
    harness.render(AppearanceBlock);

    expect(screen.queryByText(m.calendar_appearance_today_text())).toBeNull();
  });

  it("reveals the highlight color rows once expanded", async () => {
    harness.render(AppearanceBlock);

    await openSection();

    expect(screen.getByText(m.calendar_appearance_today_text())).toBeTruthy();
  });

  it("writes a today text color change through the picker to the slice", async () => {
    harness.render(AppearanceBlock);
    await openSection();

    const pickers = screen.getAllByRole("combobox");
    await userEvent.selectOptions(pickers[0], "transparent");

    expect(harness.settings.getSlice(appearanceSlice).state.today.color).toEqual({ type: "transparent" });
  });

  it("writes the selected-date ring through the picker", async () => {
    harness.render(AppearanceBlock);
    await openSection();

    const row = screen.getByText(m.calendar_appearance_selected_ring()).closest(".setting-item");
    if (!(row instanceof HTMLElement)) throw new Error("selected ring row not found");
    const kind = row.querySelector("select");
    if (!(kind instanceof HTMLSelectElement)) throw new Error("selected ring picker not found");
    await userEvent.selectOptions(kind, "transparent");

    expect(harness.settings.getSlice(appearanceSlice).state.selectedRing).toEqual({ type: "transparent" });
  });
});
