import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { initLocale, m } from "@/i18n";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { tasksCoreModule } from "@/tasks/module";
import { testContainer, type TestHarness } from "@/testing";

import JournalTaskFilterRow from "./JournalTaskFilterRow.vue";

import type { TaskRule } from "../conditions";

async function mount(): Promise<TestHarness> {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals: { Daily: fixedJournal("Daily", { type: "day" }) } },
  });
  harness.render(JournalTaskFilterRow, { props: { journalName: "Daily" } });
  return harness;
}

describe("JournalTaskFilterRow", () => {
  beforeAll(() => initLocale("en"));

  it("says the journal has no listing filter of its own when none is stored", async () => {
    await mount();
    expect(screen.getByText(m.tasks_journal_filter_none())).toBeTruthy();
  });

  it("describes a stored filter rather than showing an empty control", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, tasksCoreModule],
      data: {
        journals: {
          Daily: {
            ...fixedJournal("Daily", { type: "day" }),
            tasks: {
              providers: {},
              filter: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["## Tasks"] }] },
            },
          },
        },
      },
    });
    harness.render(JournalTaskFilterRow, { props: { journalName: "Daily" } });
    expect(screen.getByText(/## Tasks/)).toBeTruthy();
  });

  it("opens the filter editor when its button is pressed", async () => {
    const harness = await mount();
    await userEvent.click(screen.getByRole("button", { name: m.tasks_journal_filter_edit() }));
    expect(harness.modals.lastOpen()).toBeTruthy();
  });

  // The restructure in Task 5 put `providers` and `filter` in one object, and a naive write that
  // replaces `tasks` wholesale would silently drop the journal's checkbox identification rule —
  // this is the test that would still pass even if the edited filter were never written back, so
  // it must actually drive a Save and read the result back from the repository, not just assert
  // that the modal opened.
  it("writes the edited filter back to the journal, leaving its provider rules untouched", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, tasksCoreModule],
      data: {
        journals: {
          Daily: {
            ...fixedJournal("Daily", { type: "day" }),
            tasks: {
              providers: {
                checkbox: {
                  compose: "narrow",
                  mode: "and",
                  conditions: [{ type: "tag", condition: "has", tags: ["#task"] }],
                },
              },
              filter: { mode: "and", conditions: [] },
            },
          },
        },
      },
    });
    harness.render(JournalTaskFilterRow, { props: { journalName: "Daily" } });

    await userEvent.click(screen.getByRole("button", { name: m.tasks_journal_filter_edit() }));
    const edited: TaskRule = {
      mode: "and",
      conditions: [{ type: "status", condition: "is", statuses: ["open"] }],
    };
    harness.modals.lastOpen<{ filter: TaskRule }, TaskRule>().submit(edited);

    const repository = harness.resolve(JournalsRepository);
    await vi.waitFor(() => {
      const stored = repository.get("Daily");
      expect(stored.isSome() && stored.value.tasks.filter.conditions).toHaveLength(1);
    });

    const stored = repository.get("Daily");
    expect(stored.isSome() && stored.value.tasks.providers).toEqual({
      checkbox: { compose: "narrow", mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#task"] }] },
    });
    expect(stored.isSome() && stored.value.tasks.filter).toEqual(edited);
  });

  it("keeps a concurrent edit to the journal's providers when saving the filter", async () => {
    const harness = await mount();
    const repository = harness.resolve(JournalsRepository);

    await userEvent.click(screen.getByRole("button", { name: m.tasks_journal_filter_edit() }));

    repository.update("Daily", { tasks: { providers: { noteProperty: "after" } } as never });

    const edited: TaskRule = { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#task"] }] };
    harness.modals.lastOpen<{ filter: TaskRule }, TaskRule>().submit(edited);

    await vi.waitFor(() => {
      const stored = repository.get("Daily");
      expect(stored.isSome() && stored.value.tasks.filter.conditions).toHaveLength(1);
    });

    const providers = repository.get("Daily").getOrUndefined()?.tasks.providers;
    expect(providers).toMatchObject({ noteProperty: "after" });
  });
});
