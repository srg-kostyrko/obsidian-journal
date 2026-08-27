import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";
import { viewsCoreModule } from "@/views/module";

import { dayNotesSlice } from "../slice";

import DayNotesSettingsBlock from "./DayNotesSettingsBlock.vue";

async function mountSettings() {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: { journals: {}, shelves: {}, views: {}, dayNotes: {} },
  });
  harness.render(DayNotesSettingsBlock);
  await userEvent.click(screen.getByText(m.day_notes_settings_title()));
  return harness;
}

function inputFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest(".setting-item");
  if (!(row instanceof HTMLElement)) throw new Error(`No row named ${name}`);
  return within(row).getByRole("textbox");
}

describe("DayNotesSettingsBlock", () => {
  it("shows only the two vault-wide creation-date settings", async () => {
    await mountSettings();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByText(m.day_notes_settings_property_description())).toBeTruthy();
    expect(screen.getByText(m.day_notes_settings_format_description())).toBeTruthy();
  });

  it("writes the property and format through dayNotesSlice", async () => {
    const harness = await mountSettings();
    const property = inputFor(m.day_notes_settings_property_label());
    const format = inputFor(m.day_notes_settings_format_label());

    await userEvent.clear(property);
    await userEvent.type(property, "date-created");
    await userEvent.clear(format);
    await userEvent.type(format, "DD/MM/YYYY");

    expect(harness.settings.getSlice(dayNotesSlice).state).toEqual({
      property: "date-created",
      format: "DD/MM/YYYY",
    });
  });
});
