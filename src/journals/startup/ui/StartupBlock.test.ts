import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../../module";
import { fixedJournal } from "../../testing";
import { journalStartupCoreModule } from "../module";
import { startupSlice } from "../slice";
import { journalStartupUiModule } from "../ui-module";

import StartupBlock from "./StartupBlock.vue";

async function expand(): Promise<void> {
  await userEvent.click(screen.getByText(m.startup_dashboard_section_title()));
}

describe("StartupBlock", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalStartupCoreModule, journalStartupUiModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
        },
        startup: { journalName: "" },
      },
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
});
