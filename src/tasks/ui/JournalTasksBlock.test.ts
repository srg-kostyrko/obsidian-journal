import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { m } from "@/i18n";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../module";

import JournalTasksBlock from "./JournalTasksBlock.vue";

async function mount() {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals: { Daily: fixedJournal("Daily", { type: "day" }, { tasks: { providers: {} } } as never) } },
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

  // The redesign made this section a collapsible, which reads as a regression from the
  // always-open pre-branch version unless the journal's compose value stays legible while shut —
  // the way TemplatesSection carries its template count in the trigger.
  describe("compose flair", () => {
    it("shows Inherit for a journal with no checkbox rule of its own", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, tasksCoreModule],
        data: { journals: { Daily: fixedJournal("Daily", { type: "day" }, { tasks: { providers: {} } } as never) } },
      });
      harness.render(JournalTasksBlock, { props: { journalName: "Daily" } });

      expect(screen.getByText(m.tasks_journal_compose_inherit())).toBeTruthy();
    });

    it("reflects the journal's compose mode, and changes when the store does", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, tasksCoreModule],
        data: {
          journals: {
            Daily: fixedJournal("Daily", { type: "day" }, {
              tasks: { providers: { checkbox: { compose: "narrow", mode: "and", conditions: [] } } },
            } as never),
          },
        },
      });
      harness.render(JournalTasksBlock, { props: { journalName: "Daily" } });
      expect(screen.getByText(m.tasks_journal_compose_narrow())).toBeTruthy();

      harness.resolve(JournalsRepository).update("Daily", {
        tasks: { providers: { checkbox: { compose: "replace", mode: "and", conditions: [] } } },
      } as never);
      await nextTick();

      expect(screen.getByText(m.tasks_journal_compose_replace())).toBeTruthy();
    });
  });
});
