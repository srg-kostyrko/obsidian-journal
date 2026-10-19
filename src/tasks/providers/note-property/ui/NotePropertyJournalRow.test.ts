import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { SettingsService } from "@/settings";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { EditJournalTaskNotesFlow } from "../flows/edit-journal-task-notes.flow";
import { notePropertySlice } from "../slice";

import NotePropertyJournalRow from "./NotePropertyJournalRow.vue";

async function mount(providers: unknown = {}, enabled = true) {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: {
      tasksNoteProperty: { enabled },
      journals: { Daily: fixedJournal("Daily", { type: "day" }, { tasks: { providers } } as never) },
    },
  });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  harness.render(NotePropertyJournalRow, { props: { journalName: "Daily" } });
  return {
    flows,
    repository: harness.resolve(JournalsRepository),
    slice: harness.resolve(SettingsService).getSlice(notePropertySlice),
  };
}

function summary(): string {
  return screen.getByTestId("note-property-journal-summary").textContent;
}

describe("NotePropertyJournalRow", () => {
  it("names the setting Task notes", async () => {
    await mount();
    expect(screen.getByText(m.tasks_settings_provider_note_property())).toBeTruthy();
  });

  it("summarizes a journal with no rule as showing all task notes", async () => {
    await mount();
    expect(summary()).toBe(m.tasks_note_visibility_summary_all());
  });

  it("summarizes a None rule", async () => {
    await mount({ "note-property": { show: "none", mode: "and", conditions: [] } });
    expect(summary()).toBe(m.tasks_note_visibility_summary_none());
  });

  it("summarizes a Matching rule by its conditions", async () => {
    await mount({ "note-property": { show: "matching", mode: "and", conditions: [{ type: "tag", tags: ["#work"] }] } });
    expect(summary()).toBe(
      m.tasks_note_visibility_summary_matching({
        conditions: m.tasks_note_visibility_condition_tag({ tags: "#work" }),
      }),
    );
  });

  it("refreshes the summary when the journal's rule changes", async () => {
    const { repository } = await mount();
    const config = repository.get("Daily").getOrUndefined();
    if (config === undefined) throw new Error("no journal");
    repository.update("Daily", {
      tasks: { ...config.tasks, providers: { "note-property": { show: "none", mode: "and", conditions: [] } } },
    });
    await nextTick();
    expect(summary()).toBe(m.tasks_note_visibility_summary_none());
  });

  it("is absent while the provider is disabled and appears once it is enabled", async () => {
    const { slice } = await mount({}, false);
    expect(screen.queryByTestId("note-property-journal-summary")).toBeNull();
    slice.state.enabled = true;
    await nextTick();
    expect(summary()).toBe(m.tasks_note_visibility_summary_all());
  });

  it("opens the journal's task-notes modal from the edit button", async () => {
    const { flows } = await mount();
    await userEvent.click(screen.getByTestId("note-property-journal-edit"));
    expect(flows.invoke).toHaveBeenCalledWith(EditJournalTaskNotesFlow, { journalName: "Daily" });
  });
});
