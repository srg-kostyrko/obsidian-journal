import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../module";

import JournalTasksBlock from "./JournalTasksBlock.vue";

async function mount() {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals: { Daily: fixedJournal("Daily", { type: "day" }, { tasks: {} }) } },
  });
  harness.render(JournalTasksBlock, { props: { journalName: "Daily" } });
  return harness;
}

describe("JournalTasksBlock", () => {
  // Every other section on a journal page is a collapsible, and so is the dashboard's own Tasks
  // block; this one rendered a bare heading row and sat permanently open.
  it("starts collapsed, like every other section on the page", async () => {
    await mount();
    expect(screen.getByText(m.tasks_settings_title())).toBeTruthy();
    expect(screen.queryByTestId("checkbox-journal-edit")).toBeNull();
  });

  it("lists each provider's row once expanded", async () => {
    await mount();
    await userEvent.click(screen.getByText(m.tasks_settings_title()));
    expect(screen.getByTestId("checkbox-journal-edit")).toBeTruthy();
  });
});
