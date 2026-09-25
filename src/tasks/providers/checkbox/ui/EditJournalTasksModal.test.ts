import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { m } from "@/i18n";
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
  const { submit } = harness.renderModal(EditJournalTasksModal, { props: { journalName: "Daily" } });
  return { harness, repository: harness.resolve(JournalsRepository), submit };
}

describe("EditJournalTasksModal", () => {
  it("offers the three compose modes", async () => {
    await mount();
    expect(screen.getByTestId("compose-inherit")).toBeTruthy();
    expect(screen.getByTestId("compose-narrow")).toBeTruthy();
    expect(screen.getByTestId("compose-replace")).toBeTruthy();
  });

  it("defaults to inherit for a journal that has never been configured", async () => {
    await mount();
    expect(screen.getByTestId("compose-inherit").classList.contains("mod-cta")).toBe(true);
  });

  it("seeds the compose mode and rule editor from an existing journal rule", async () => {
    await mount({
      checkbox: { compose: "replace", mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["work"] }] },
    });
    expect(screen.getByTestId("compose-replace").classList.contains("mod-cta")).toBe(true);
    expect(screen.getByDisplayValue("work")).toBeTruthy();
  });

  it("renders the compose option labels from the message catalogue, not the raw identifier", async () => {
    await mount();
    expect(screen.queryByText("narrow")).toBeNull();
    expect(screen.queryByText("replace")).toBeNull();
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
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    const stored = repository.get("Daily").getOrUndefined()?.tasks.checkbox;
    expect(stored).toMatchObject({ compose: "narrow" });
    expect(stored?.conditions).toHaveLength(1);
  });

  // Save here re-reads the journal's current config before writing (see save()'s comment above),
  // a different path from EditCheckboxProviderModal's straight slice write — so the same
  // click-Save-with-no-intervening-blur edge case needs its own proof on this modal: clicking
  // Save blurs the focused input first, and the value it just committed must survive that re-read.
  it("persists a value typed just before Save, with no intervening blur", async () => {
    const { repository } = await mount();

    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    const stored = repository.get("Daily").getOrUndefined()?.tasks.checkbox;
    expect(stored?.conditions.at(0)).toMatchObject({ type: "tag", tags: ["#task"] });
  });

  // Same reproduction as EditCheckboxProviderModal's: a per-keystroke commit is indistinguishable
  // from a completed edit, so a second comma-separated value was unreachable through this row
  // regardless of which modal hosts it.
  it("stores both values when a second one is typed after a comma, on Save", async () => {
    const { repository } = await mount();

    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "#work, #home");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    const stored = repository.get("Daily").getOrUndefined()?.tasks.checkbox;
    expect(stored?.conditions.at(0)).toMatchObject({ type: "tag", tags: ["#work", "#home"] });
  });

  // Same reasoning as EditCheckboxProviderModal's matching test: the editor's narrower
  // CheckboxEditableCondition surface must not be the thing that deletes a stored status
  // condition the first time this modal saves, even with nothing edited.
  it("preserves a stored status condition across a no-op Save", async () => {
    const { repository } = await mount({
      checkbox: {
        compose: "narrow",
        mode: "and",
        conditions: [
          { type: "status", condition: "is", statuses: ["done"] },
          { type: "tag", condition: "has", tags: ["#task"] },
        ],
      },
    });

    await userEvent.click(screen.getByText(m.common_action_submit()));

    const stored = repository.get("Daily").getOrUndefined()?.tasks.checkbox;
    expect(stored?.conditions).toHaveLength(2);
    expect(stored?.conditions).toContainEqual({ type: "status", condition: "is", statuses: ["done"] });
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
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");

    repository.update("Daily", { tasks: { noteProperty: "after" } as never });

    await userEvent.click(screen.getByText(m.common_action_submit()));

    const tasks = repository.get("Daily").getOrUndefined()?.tasks;
    expect(tasks).toMatchObject({ noteProperty: "after" });
    expect(tasks?.checkbox).toMatchObject({ compose: "narrow" });
    expect(tasks?.checkbox?.conditions).toHaveLength(1);
  });

  // save() must hand the store a copy of the draft's conditions, not the array itself — otherwise
  // the store would hold the very array the rule editor keeps mutating, and a later external write
  // to that array would silently leak into the still-open modal's rendered inputs.
  it("hands the store its own copy of the conditions, not the draft's array", async () => {
    const { repository } = await mount({ checkbox: { compose: "narrow", mode: "and", conditions: [] } });

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    const stored = repository.get("Daily").getOrUndefined()?.tasks.checkbox;
    stored?.conditions.push({ type: "tag", condition: "has", tags: ["outside"] });

    expect(screen.queryByDisplayValue("outside")).toBeNull();
  });

  // The draft's top-level conditions array being fresh is not enough — each condition's own
  // `tags`/`headings` array must be isolated too, or a write that reaches the store's array in
  // place (not through RuleConditionRow's replace-the-array setter) shows up in the still-open
  // modal before Save ever runs. JournalsRepository.get() returns the live reactive entity, so
  // pushing onto its array directly is exactly that kind of write.
  it("isolates a condition's nested tags array from the store's live array", async () => {
    const { repository } = await mount({
      checkbox: { compose: "narrow", mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#work"] }] },
    });

    const condition = repository.get("Daily").getOrUndefined()?.tasks.checkbox?.conditions[0];
    if (condition?.type !== "tag") throw new Error("no seeded tag condition");
    expect(screen.getByDisplayValue("#work")).toBeTruthy();

    condition.tags.push("#leaked");
    await nextTick();

    expect(screen.queryByDisplayValue("#work, #leaked")).toBeNull();
    expect(screen.getByDisplayValue("#work")).toBeTruthy();
  });
});

// Same guard as EditCheckboxProviderModal's, applied to the journal-scoped rule editor — an
// empty condition here is just as capable of silently widening a narrow/replace rule to match
// every checkbox item.
describe("empty-condition validation", () => {
  it("disables Save while a narrowed condition has no values, and Save never reaches the journal", async () => {
    const { repository } = await mount();

    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const saveButton: HTMLButtonElement = screen.getByText(m.common_action_submit());
    expect(saveButton.disabled).toBe(true);

    await userEvent.click(saveButton);

    expect(repository.get("Daily").getOrUndefined()?.tasks.checkbox).toBeUndefined();
  });

  // The value only reaches the condition model at a commit boundary (blur or Enter), not on
  // every keystroke — see RuleConditionRow.vue — so Save reflects the typed value once the row
  // is left, not mid-type.
  it("enables Save once the empty condition is given a value and the row is left", async () => {
    await mount();

    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const saveButton: HTMLButtonElement = screen.getByText(m.common_action_submit());
    expect(saveButton.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await userEvent.tab();

    expect(saveButton.disabled).toBe(false);
  });

  it("keeps the missing-value error quiet until the row's input is left, then shows it", async () => {
    await mount();

    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));

    expect(screen.queryByText(m.tasks_condition_values_required())).toBeNull();

    await userEvent.click(screen.getByLabelText(m.tasks_settings_condition_tag()));
    await userEvent.tab();

    expect(screen.getByText(m.tasks_condition_values_required())).toBeTruthy();
  });

  // Switching back to inherit while a narrow/replace draft holds an unfinished condition must
  // not strand the modal — there is no rule editor to fix once inherit is chosen, so Save has
  // nothing left to validate.
  it("re-enables Save when switching back to inherit with an unfinished condition still in the draft", async () => {
    await mount();

    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const saveButton: HTMLButtonElement = screen.getByText(m.common_action_submit());
    expect(saveButton.disabled).toBe(true);

    await userEvent.click(screen.getByTestId("compose-inherit"));

    expect(saveButton.disabled).toBe(false);
  });
});
