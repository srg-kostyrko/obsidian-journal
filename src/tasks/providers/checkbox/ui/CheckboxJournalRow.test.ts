import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { EditJournalTasksFlow } from "../flows/edit-journal-tasks.flow";

import CheckboxJournalRow from "./CheckboxJournalRow.vue";

async function mount(tasks: unknown = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals: { Daily: fixedJournal("Daily", { type: "day" }, { tasks } as never) } },
  });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  harness.render(CheckboxJournalRow, { props: { journalName: "Daily" } });
  return { harness, flows, repository: harness.resolve(JournalsRepository) };
}

describe("CheckboxJournalRow", () => {
  it("names the provider", async () => {
    await mount();
    expect(screen.getByText(m.tasks_settings_provider_checkbox())).toBeTruthy();
  });

  it("summarizes a journal with no rule of its own as inheriting", async () => {
    await mount();
    expect(screen.getByTestId("checkbox-journal-summary").textContent).toContain(m.tasks_journal_summary_inherit());
  });

  it("summarizes a journal with a narrowing rule", async () => {
    await mount({
      checkbox: { compose: "narrow", mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["work"] }] },
    });
    const summary = screen.getByTestId("checkbox-journal-summary").textContent;
    expect(summary).not.toContain(m.tasks_journal_summary_inherit());
    expect(summary).toContain("work");
  });

  // A summary read once at mount would go stale the moment the modal saved.
  it("refreshes the summary when the journal's rule changes", async () => {
    const { repository } = await mount();
    repository.update("Daily", {
      tasks: {
        checkbox: { compose: "narrow", mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#task"] }] },
      },
    } as never);
    await nextTick();
    expect(screen.getByTestId("checkbox-journal-summary").textContent).toContain("#task");
  });

  it("opens the journal's task modal from the edit button", async () => {
    const { flows } = await mount();
    await userEvent.click(screen.getByTestId("checkbox-journal-edit"));
    expect(flows.invoke).toHaveBeenCalledWith(EditJournalTasksFlow, { journalName: "Daily" });
  });
});
