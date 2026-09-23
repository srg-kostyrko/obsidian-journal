import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { ModalContextKey } from "@/infrastructure/host/modals/internal/modal-context";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";

import EditJournalTasksModal from "./EditJournalTasksModal.vue";

async function mount(tasks: unknown = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals: { Daily: fixedJournal("Daily", { type: "day" }, { tasks } as never) } },
  });
  const submit = vi.fn();
  harness.render(EditJournalTasksModal, {
    props: { journalName: "Daily" },
    global: { provide: { [ModalContextKey as symbol]: { submit, cancel: vi.fn() } } },
  });
  return { harness, repository: harness.resolve(JournalsRepository), submit };
}

describe("EditJournalTasksModal", () => {
  it("offers the three compose modes", async () => {
    await mount();
    expect(screen.getByTestId("compose-inherit")).toBeTruthy();
    expect(screen.getByTestId("compose-narrow")).toBeTruthy();
    expect(screen.getByTestId("compose-replace")).toBeTruthy();
  });

  it("hides the rule editor while the journal inherits", async () => {
    await mount();
    expect(screen.queryByTestId("rule-add-condition")).toBeNull();
  });

  it("reveals the rule editor once the journal narrows", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("compose-narrow"));
    expect(screen.getByTestId("rule-add-condition")).toBeTruthy();
  });

  it("writes nothing to the journal until Save", async () => {
    const { repository } = await mount();
    await userEvent.click(screen.getByTestId("compose-narrow"));
    expect(repository.get("Daily").getOrUndefined()?.tasks.checkbox).toBeUndefined();
  });

  it("writes the journal's rule on Save", async () => {
    const { repository } = await mount();

    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.click(screen.getByText(m.common_action_submit()));

    const stored = repository.get("Daily").getOrUndefined()?.tasks.checkbox;
    expect(stored).toMatchObject({ compose: "narrow" });
    expect(stored?.conditions).toHaveLength(1);
  });

  // Inherit means "this journal has no rule of its own", which is an absent key, not a stored
  // rule whose compose happens to say inherit.
  it("clears the journal's rule when switched back to inherit", async () => {
    const { repository } = await mount({ checkbox: { compose: "narrow", mode: "and", conditions: [] } });

    await userEvent.click(screen.getByTestId("compose-inherit"));
    await userEvent.click(screen.getByText(m.common_action_submit()));

    expect(repository.get("Daily").getOrUndefined()?.tasks.checkbox).toBeUndefined();
  });

  // The journal's tasks schema declares only `checkbox`, so a second provider's own entry can't
  // be modeled through the fixture — v.object strips any other key on that read path. It is
  // reachable the way a real one would ever get there: written live through
  // JournalsRepository.update(), which merges without re-validating. That is also what makes it
  // a genuine concurrent edit — save() must re-read the config or this write, landing while the
  // modal is still open, is silently lost.
  it("keeps a concurrent edit to a sibling provider's rule when saving", async () => {
    const { repository } = await mount();

    repository.update("Daily", { tasks: { noteProperty: "before" } as never });
    expect(repository.get("Daily").getOrUndefined()?.tasks).toMatchObject({ noteProperty: "before" });

    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));

    repository.update("Daily", { tasks: { noteProperty: "after" } as never });

    await userEvent.click(screen.getByText(m.common_action_submit()));

    const tasks = repository.get("Daily").getOrUndefined()?.tasks;
    expect(tasks).toMatchObject({ noteProperty: "after" });
    expect(tasks?.checkbox).toMatchObject({ compose: "narrow" });
    expect(tasks?.checkbox?.conditions).toHaveLength(1);
  });
});
