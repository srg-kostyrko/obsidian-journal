import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { decorationsSlice } from "@/decorations/settings/slice";
import { initLocale, m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { decorationsModule } from "../../module";
import { decorationsSettingsCoreModule } from "../module";

import CalendarDecorationsBlock from "./CalendarDecorationsBlock.vue";
import JournalDecorationsSection from "./JournalDecorationsSection.vue";

beforeAll(() => initLocale("en"));

async function expand(): Promise<void> {
  await userEvent.click(screen.getByText(m.decoration_section_title_calendar()));
}

describe("CalendarDecorationsBlock", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule],
      data: { journals: {}, shelves: {}, decorations: { decorations: [], maxMarksPerSlot: 3 } },
    });
  });

  it("offers the mark limit once the section is expanded", async () => {
    harness.render(CalendarDecorationsBlock);

    await expand();

    expect(screen.getByText(m.decoration_mark_limit_label())).toBeTruthy();
  });

  it("writes a chosen limit to the slice", async () => {
    harness.render(CalendarDecorationsBlock);
    await expand();

    const row = screen.getByText(m.decoration_mark_limit_label()).closest(".setting-item");
    if (!(row instanceof HTMLElement)) throw new Error("mark limit row not found");
    const dropdown = row.querySelector("select");
    if (!(dropdown instanceof HTMLSelectElement)) throw new Error("mark limit dropdown not found");
    await userEvent.selectOptions(dropdown, "5");

    expect(harness.settings.getSlice(decorationsSlice).state.maxMarksPerSlot).toBe(5);
  });

  it("stores 0 for unlimited", async () => {
    harness.render(CalendarDecorationsBlock);
    await expand();

    const row = screen.getByText(m.decoration_mark_limit_label()).closest(".setting-item");
    if (!(row instanceof HTMLElement)) throw new Error("mark limit row not found");
    const dropdown = row.querySelector("select");
    if (!(dropdown instanceof HTMLSelectElement)) throw new Error("mark limit dropdown not found");
    await userEvent.selectOptions(dropdown, "0");

    expect(harness.settings.getSlice(decorationsSlice).state.maxMarksPerSlot).toBe(0);
  });

  // The obvious shortcut is to put the row straight into DecorationsSection. That passes every
  // other assertion here while leaking a global setting onto every journal and shelf page.
  it("does not offer the mark limit on a journal's decorations section", async () => {
    harness.render(JournalDecorationsSection, { props: { journalName: "daily" } });

    expect(screen.queryByText(m.decoration_mark_limit_label())).toBeNull();
  });
});
