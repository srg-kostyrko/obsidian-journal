import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";

import { calendarDisplaySlice } from "@/calendar/settings/display-slice";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { initLocale, m } from "@/i18n";
import { calendarAppearanceCoreModule } from "@/notes-calendar/appearance/module";
import { appearanceSlice } from "@/notes-calendar/appearance/slice";
import { testContainer } from "@/testing";

import VaultNotesPreviewSettingsBlock from "./VaultNotesPreviewSettingsBlock.vue";

beforeAll(() => initLocale("en"));

async function mountSettings(enabled = false) {
  const harness = await testContainer({ modules: [calendarSettingsCoreModule, calendarAppearanceCoreModule] });
  const display = harness.settings.getSlice(calendarDisplaySlice);
  display.state = { ...display.state, vaultDayNotes: enabled };
  harness.render(VaultNotesPreviewSettingsBlock);
  await userEvent.click(screen.getByText(m.calendar_noteview_section_title()));
  return { harness, display };
}

describe("VaultNotesPreviewSettingsBlock", () => {
  it("shows the requested section copy", async () => {
    await mountSettings();

    expect(m.calendar_noteview_toggle_description()).toBe(
      "Shift+Primary click shows all notes created on the selected date across your vault, in a preview pane below the calendar.",
    );
    expect(screen.getByText(m.calendar_noteview_toggle_description())).toBeTruthy();
    expect(screen.getByText(m.calendar_noteview_include_journals_label())).toBeTruthy();
    expect(screen.getByText(m.calendar_noteview_include_journals_description())).toBeTruthy();
    expect(screen.getByText(m.calendar_appearance_selected_background())).toBeTruthy();
    expect(screen.getByText(m.calendar_appearance_selected_background_description())).toBeTruthy();
  });

  it("disables every dependent setting while the feature is off", async () => {
    await mountSettings();

    for (const dropdown of screen.getAllByRole("combobox")) expect(dropdown).toHaveProperty("disabled", true);
    expect(screen.getAllByRole("checkbox")[1]?.getAttribute("aria-disabled")).toBe("true");
  });

  it("enables dependent settings when the master toggle is switched on", async () => {
    const { display } = await mountSettings();

    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    expect(display.state.vaultDayNotes).toBe(true);
    expect(screen.getAllByRole("combobox")[0]).toHaveProperty("disabled", false);
  });

  it("persists sorting and journal visibility from the new section", async () => {
    const { display } = await mountSettings(true);

    const dropdowns = screen.getAllByRole("combobox");
    await userEvent.selectOptions(dropdowns[0], "name");
    await userEvent.selectOptions(dropdowns[1], "asc");
    await userEvent.click(screen.getAllByRole("checkbox")[1]);

    expect(display.state.vaultDayNotesSort).toBe("name-asc");
    expect(display.state.vaultDayNotesIncludeJournals).toBe(false);
  });

  it("writes the preview-date background through the moved color picker", async () => {
    const { harness } = await mountSettings(true);
    const background = screen.getAllByRole("combobox")[2];

    await userEvent.selectOptions(background, "transparent");

    expect(harness.settings.getSlice(appearanceSlice).state.selectedBackground).toEqual({ type: "transparent" });
  });
});
