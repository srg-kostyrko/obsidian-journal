import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { initLocale, m } from "@/i18n";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { tasksCoreModule } from "@/tasks/module";
import { testContainer, type TestHarness } from "@/testing";

import JournalMoveRow from "./JournalMoveRow.vue";

import type { JournalMoveConfig, MoveDefaults } from "../settings";

async function mount(move: Partial<JournalMoveConfig> = {}, defaults?: MoveDefaults): Promise<TestHarness> {
  const journal = fixedJournal("Daily", { type: "day" });
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: {
      journals: { Daily: { ...journal, tasks: { ...journal.tasks, move: { ...journal.tasks.move, ...move } } } },
      ...(defaults !== undefined && { tasksMove: defaults }),
    },
  });
  harness.render(JournalMoveRow, { props: { journalName: "Daily" } });
  return harness;
}

function summary(): string {
  return screen.getByTestId("move-summary").textContent;
}

describe("JournalMoveRow", () => {
  beforeAll(() => initLocale("en"));

  it("describes the shipped behavior for a journal that configured nothing", async () => {
    await mount();
    expect(summary()).toContain(m.tasks_move_summary({ action: "copy-stamp", count: 1 }));
    expect(summary()).toContain(m.tasks_move_summary_source({ source: "note" }));
  });

  // A journal that leaves mode on Default follows the global value, so the summary has to read it
  // from there rather than assume copy.
  it("describes the global default when the journal leaves mode unset", async () => {
    await mount({}, { mode: "move", stamp: true });
    expect(summary()).toContain(m.tasks_move_summary({ action: "move", count: 1 }));
  });

  it("the summary mentions automatic", async () => {
    await mount({ automatic: true });
    expect(summary()).toContain(m.tasks_move_summary_automatic());
  });

  it("the summary stays silent about automatic when it is off", async () => {
    await mount();
    expect(summary()).not.toContain(m.tasks_move_summary_automatic());
  });

  it("describes the journal's own settings over the global defaults", async () => {
    await mount({ mode: "copy", stamp: false, lookBack: 3, source: "both", targetHeading: "Tasks" });
    expect(summary()).toContain(m.tasks_move_summary({ action: "copy", count: 3 }));
    expect(summary()).toContain(m.tasks_move_summary_source({ source: "both" }));
    expect(summary()).toContain(m.tasks_move_summary_heading({ heading: "Tasks" }));
  });

  // Sentence spacing belongs to the locale: Japanese runs sentences together with no space.
  it("leaves the joining of its sentences to the locale", async () => {
    initLocale("ja");
    try {
      await mount({ targetHeading: "Tasks" });
      expect(summary()).not.toMatch(/。\s/u);
      expect(summary()).toBe(
        m.tasks_move_summary({ action: "copy-stamp", count: 1 }) +
          m.tasks_move_summary_source({ source: "note" }) +
          m.tasks_move_summary_heading({ heading: "Tasks" }),
      );
    } finally {
      initLocale("en");
    }
  });

  it("writes the edited settings back to the journal", async () => {
    const harness = await mount();
    await userEvent.click(screen.getByRole("button", { name: m.tasks_move_edit() }));

    const edited: JournalMoveConfig = {
      mode: "move",
      source: "notelets",
      targetHeading: "",
      lookBack: 2,
      automatic: false,
    };
    harness.modals.lastOpen<{ move: JournalMoveConfig }, JournalMoveConfig>().submit(edited);

    const repository = harness.resolve(JournalsRepository);
    await vi.waitFor(() => {
      expect(repository.get("Daily").getOrUndefined()?.tasks.move).toEqual(edited);
    });
  });

  it("a concurrent journal edit during the modal is not overwritten", async () => {
    const harness = await mount();
    const repository = harness.resolve(JournalsRepository);

    await userEvent.click(screen.getByRole("button", { name: m.tasks_move_edit() }));

    const before = repository.get("Daily").getOrUndefined()?.tasks;
    if (before === undefined) throw new Error("journal missing");
    const filter = {
      mode: "and" as const,
      conditions: [{ type: "tag" as const, condition: "has" as const, tags: ["#work"] }],
    };
    repository.update("Daily", { tasks: { ...before, filter } });

    harness.modals
      .lastOpen<{ move: JournalMoveConfig }, JournalMoveConfig>()
      .submit({ source: "note", targetHeading: "", lookBack: 2, automatic: false });

    await vi.waitFor(() => {
      expect(repository.get("Daily").getOrUndefined()?.tasks.move.lookBack).toBe(2);
    });
    expect(repository.get("Daily").getOrUndefined()?.tasks.filter).toEqual(filter);
  });
});
