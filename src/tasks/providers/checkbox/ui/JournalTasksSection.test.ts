import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { JournalsEventsToken, JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";

import JournalTasksSection from "./JournalTasksSection.vue";

async function mount(tasks: unknown = undefined) {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: {
      journals: {
        Daily: fixedJournal("Daily", { type: "day" }, { tasks } as never),
        Weekly: fixedJournal("Weekly", { type: "week" }),
      },
    },
  });
  return {
    harness,
    repository: harness.resolve(JournalsRepository),
    screen: harness.render(JournalTasksSection, { props: { journalName: "Daily" } }),
  };
}

describe("JournalTasksSection", () => {
  it("defaults to inherit for a journal that has never been configured", async () => {
    const { screen } = await mount();
    expect(screen.getByTestId("compose").dataset.value).toBe("inherit");
  });

  it("stores a narrow rule with its condition on the journal config", async () => {
    const { screen, repository } = await mount();
    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const config = repository.get("Daily");
    expect(config.isSome() && config.value.tasks.checkbox).toMatchObject({ compose: "narrow" });
  });

  it("stores the added condition alongside the narrow compose mode", async () => {
    const { screen, repository } = await mount();
    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const config = repository.get("Daily");
    const checkbox = config.isSome() ? config.value.tasks.checkbox : undefined;
    expect(checkbox?.conditions).toMatchObject([{ type: "tag", condition: "has", tags: [] }]);
  });

  // TaskHostService only refreshes a journal's task index when JournalsRepository.update() fires
  // an "updated" event with "tasks" among the changed keys (src/tasks/task-host.ts). A RuleEditor
  // mutation that only ever lands on the value `repository.get()` returns — e.g. a live binding
  // straight into the stored object, mutated in place — would satisfy every value-only assertion
  // above while never producing that event, leaving the index silently stale. The rule starts
  // already narrow (rather than reaching narrow via the compose-narrow button, which calls
  // persist() directly) so this isolates the RuleEditor-driven mutation path specifically.
  it("fires the repository's updated event with tasks among the changed keys when RuleEditor mutates the rule", async () => {
    const { harness, screen } = await mount({ checkbox: { compose: "narrow", mode: "and", conditions: [] } });
    const events = harness.resolve(JournalsEventsToken);
    const updates: [string, object][] = [];
    events.on("updated", (journalName, changes) => updates.push([journalName, changes]));

    await userEvent.click(screen.getByTestId("rule-add-condition"));

    expect(updates.some(([name, changes]) => name === "Daily" && "tasks" in changes)).toBe(true);
  });

  // update() merges shallowly, so an array handed to it by reference becomes the stored value
  // itself — every later editor mutation would then land in settings without passing through
  // persist(), and a sync refresh that replaces the stored array would leave the editor holding an
  // orphan. Reaching through the store and pushing is how that aliasing shows: a copy makes the
  // push invisible to the editor, a live binding renders it.
  it("hands the store its own array, not the editor's", async () => {
    const { screen, repository } = await mount({ checkbox: { compose: "narrow", mode: "and", conditions: [] } });
    await userEvent.click(screen.getByTestId("rule-add-condition"));

    const stored = repository.get("Daily");
    const conditions = stored.isSome() ? stored.value.tasks.checkbox?.conditions : undefined;
    conditions?.push({ type: "tag", condition: "has", tags: ["outside"] });
    await nextTick();

    expect(screen.queryByDisplayValue("outside")).toBeNull();
  });

  it("leaves other journals untouched", async () => {
    const { screen, repository } = await mount();
    await userEvent.click(screen.getByTestId("compose-replace"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));

    const daily = repository.get("Daily");
    expect(daily.isSome() && daily.value.tasks.checkbox).toMatchObject({ compose: "replace" });

    const weekly = repository.get("Weekly");
    expect(weekly.isSome() && weekly.value.tasks.checkbox).toBeUndefined();
  });

  it("hides the rule editor while compose stays inherit", async () => {
    const { screen } = await mount();
    expect(screen.queryByTestId("rule-add-condition")).toBeNull();
  });

  it("shows a rule editor already seeded from an existing journal rule", async () => {
    const { screen } = await mount({
      checkbox: { compose: "replace", mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["work"] }] },
    });
    expect(screen.getByTestId("compose").dataset.value).toBe("replace");
    expect(screen.getByDisplayValue("work")).toBeTruthy();
  });

  it("clears the stored rule back to inherit", async () => {
    const { screen, repository } = await mount({
      checkbox: { compose: "narrow", mode: "and", conditions: [] },
    });
    await userEvent.click(screen.getByTestId("compose-inherit"));
    const config = repository.get("Daily");
    expect(config.isSome() && config.value.tasks.checkbox).toBeUndefined();
  });

  it("renders the compose option labels from the message catalogue, not the raw identifier", async () => {
    const { screen } = await mount();
    expect(screen.queryByText("narrow")).toBeNull();
    expect(screen.queryByText("replace")).toBeNull();
  });
});
