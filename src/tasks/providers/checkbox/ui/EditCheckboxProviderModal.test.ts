import userEvent from "@testing-library/user-event";
import { fireEvent, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { SettingsService } from "@/settings";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { checkboxSlice } from "../slice";

import EditCheckboxProviderModal from "./EditCheckboxProviderModal.vue";

async function mount() {
  const harness = await testContainer({ modules: [tasksCoreModule] });
  const slice = harness.resolve(SettingsService).getSlice(checkboxSlice);
  const { submit, cancel } = harness.renderModal(EditCheckboxProviderModal);
  return { harness, slice, submit, cancel };
}

async function save(): Promise<void> {
  await userEvent.click(screen.getByText(m.common_action_submit()));
}

async function remap(symbol: string, status: string): Promise<void> {
  const row = screen.getByTestId(`status-map-row-${symbol}`);
  const select = row.querySelector("select");
  if (!select) throw new Error(`status map row ${symbol} has no select`);
  await userEvent.selectOptions(select, status);
}

describe("EditCheckboxProviderModal", () => {
  it("holds the status map and the rule editor in one modal", async () => {
    await mount();
    expect(screen.getByTestId("status-map-rows")).toBeTruthy();
    expect(screen.getByTestId("rule-add-condition")).toBeTruthy();
  });

  // The whole point of the modal: edits are staged, not written per keystroke. Removing "/"
  // also clears canonical["in-progress"] (StatusMapEditor's repairCanonical), and adding a
  // rule condition mutates rule.conditions, so these two interactions exercise pre-Save
  // isolation on all three staged fields — a live reference on any one of them turns this red.
  it("leaves the slice untouched until Save", async () => {
    const { slice } = await mount();
    const beforeStatusMap = structuredClone({ ...slice.state.statusMap });
    const beforeCanonical = structuredClone({ ...slice.state.canonical });
    const beforeConditionCount = slice.state.rule.conditions.length;

    await userEvent.click(screen.getByTestId("status-map-remove-/"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));

    expect(slice.state.statusMap).toEqual(beforeStatusMap);
    expect(slice.state.canonical).toEqual(beforeCanonical);
    expect(slice.state.rule.conditions).toHaveLength(beforeConditionCount);
  });

  it("writes the staged status map on Save", async () => {
    const { slice, submit } = await mount();

    await userEvent.click(screen.getByTestId("status-map-remove-/"));
    await userEvent.click(screen.getByText(m.common_action_submit()));

    expect(slice.state.statusMap).not.toHaveProperty("/");
    expect(submit).toHaveBeenCalled();
  });

  it("discards the staged edits on Cancel", async () => {
    const { slice, cancel } = await mount();

    await userEvent.click(screen.getByTestId("status-map-remove-/"));
    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(slice.state.statusMap).toHaveProperty("/");
    expect(cancel).toHaveBeenCalled();
  });

  it("writes a staged rule change on Save", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    expect(slice.state.rule.conditions).toHaveLength(1);
  });
});

// Ported from the deleted CheckboxProviderSection.test.ts, which mounted StatusMapEditor
// through the vault-wide section that this modal replaced. The interactions are unchanged;
// only the write ends with a Save click, since the editor here binds to the modal's draft.
describe("status map editor", () => {
  // Structure, not computed style: @testing-library/vue does not inject an SFC's scoped
  // <style>, so asserting flex-direction here would pass or fail for the wrong reason.
  it("wraps every status row in one container rather than dropping them into the row slot", async () => {
    await mount();
    const rows = screen.getByTestId("status-map-rows");
    expect(rows.querySelectorAll("[data-testid^='status-map-row-']")).toHaveLength(5);
  });

  it("shows a visible stand-in for the space marker", async () => {
    await mount();
    // trim: false — the default normalizer trims the query's own trailing space off the
    // haystack before comparing, so a testid ending in the space marker itself never matches.
    expect(screen.getByTestId("status-map-row- ", { trim: false }).textContent).toContain(
      m.tasks_settings_space_symbol(),
    );
  });

  it("marks every status's current symbol, not only the ones with a choice", async () => {
    await mount();
    for (const symbol of [" ", "x", "/", "-"]) {
      // trim: false — see the space-marker test above for why the space symbol's testid needs it.
      expect(screen.getByTestId(`written-back-${symbol}`, { trim: false }).dataset.current).toBe("true");
    }
    expect(screen.getByTestId("written-back-X").dataset.current).toBeUndefined();
  });

  it("renders status option labels from the message catalogue, not the raw identifier", async () => {
    await mount();
    expect(screen.getAllByText(m.tasks_status_in_progress()).length).toBeGreaterThan(0);
    expect(screen.queryByText("in-progress")).toBeNull();
  });

  // A marker is the single character between the brackets, so a longer string can never match a
  // real checkbox — but it still becomes a canonical candidate, and canonical is what a writer
  // emits back into the note.
  it("does not add a symbol longer than one character", async () => {
    await mount();
    await userEvent.type(screen.getByTestId("status-map-new-symbol"), "abc");
    await userEvent.click(screen.getByTestId("status-map-add"));
    expect(screen.queryByTestId("status-map-row-abc")).toBeNull();
  });

  it("does not add a blank or already-mapped symbol", async () => {
    await mount();
    const before = screen.getByTestId("status-map-rows").querySelectorAll("[data-testid^='status-map-row-']").length;

    await userEvent.click(screen.getByTestId("status-map-add"));
    expect(screen.getByTestId("status-map-rows").querySelectorAll("[data-testid^='status-map-row-']")).toHaveLength(
      before,
    );

    await userEvent.type(screen.getByTestId("status-map-new-symbol"), "/");
    await userEvent.click(screen.getByTestId("status-map-add"));
    expect(screen.getByTestId("status-map-rows").querySelectorAll("[data-testid^='status-map-row-']")).toHaveLength(
      before,
    );
  });

  it("writes a changed symbol mapping back to the slice on Save", async () => {
    const { slice } = await mount();

    await remap("/", "todo");
    await save();

    expect(slice.state.statusMap["/"]).toBe("todo");
  });

  it("writes the canonical symbol for a status back to the slice from its row, on Save", async () => {
    const { slice } = await mount();
    expect(slice.state.canonical.done).toBe("x");

    await userEvent.click(screen.getByTestId("written-back-X"));
    await save();

    expect(slice.state.canonical.done).toBe("X");
  });

  it("adds a new symbol mapping to the slice on Save", async () => {
    const { slice } = await mount();

    await userEvent.type(screen.getByTestId("status-map-new-symbol"), ">");
    await userEvent.click(screen.getByTestId("status-map-add"));
    await save();

    expect(slice.state.statusMap[">"]).toBe("todo");
  });

  // Code points, not UTF-16 units: an emoji marker is one character to the user and two to
  // `.length`, so a naive length check would reject exactly the markers themes reach for.
  it("adds a single astral-plane symbol on Save", async () => {
    const { slice } = await mount();

    await userEvent.type(screen.getByTestId("status-map-new-symbol"), "\u{1F525}");
    await userEvent.click(screen.getByTestId("status-map-add"));
    await save();

    expect(slice.state.statusMap["\u{1F525}"]).toBe("todo");
  });

  it("reassigns the write symbol when its canonical symbol is removed, on Save", async () => {
    const { slice } = await mount();
    // "x" and "X" both read as done; canonical.done ships as "x".
    expect(slice.state.canonical.done).toBe("x");

    await userEvent.click(screen.getByTestId("status-map-remove-x"));
    await save();

    expect(slice.state.canonical.done).toBe("X");
  });

  it("reassigns the write symbol when its canonical symbol is remapped to another status, on Save", async () => {
    const { slice } = await mount();
    expect(slice.state.canonical.done).toBe("x");

    await remap("x", "todo");
    await save();

    expect(slice.state.canonical.done).toBe("X");
  });

  it("drops the write symbol when remapping leaves its status with no symbol, on Save", async () => {
    const { slice } = await mount();
    expect(slice.state.canonical["in-progress"]).toBe("/");

    await remap("/", "todo");
    await save();

    expect(slice.state.canonical).not.toHaveProperty("in-progress");
  });
});

// Ported from the deleted CheckboxProviderSection.test.ts, which mounted RuleEditor through
// the vault-wide section that this modal replaced. The interactions are unchanged; only the
// write ends with a Save click, since the editor here binds to the modal's draft.
describe("rule editor", () => {
  it("adds a tag condition to the global rule, on Save", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await save();

    expect(slice.state.rule.conditions).toHaveLength(1);
    expect(slice.state.rule.conditions.at(0)).toMatchObject({ type: "tag", condition: "has" });
  });

  // The store has to hold the spelling metadataCache uses, whatever the user typed — identifies()
  // compares by exact equality, so a bare "task" would silently match nothing.
  it("stores a tag condition's value with the leading # metadataCache uses, on Save", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await save();

    expect(slice.state.rule.conditions.at(0)).toMatchObject({ type: "tag", tags: ["#task"] });
  });

  // userEvent.type is per-character. Typing left to right, appending one value after another,
  // has always reached this assertion even before the fix below — Vue 3.4's computed
  // short-circuit (a computed that recomputes to the same string as last time does not
  // re-render) happens to protect exactly this sequence, since appending "," or a space to an
  // already-valid list never changes conditionValues()'s joined output until the next real
  // character lands. The backspace case right below it is not protected the same way.
  it("stores both values when a second one is typed after a comma, on Save", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "#work, #home");
    await save();

    expect(slice.state.rule.conditions.at(0)).toMatchObject({ type: "tag", tags: ["#work", "#home"] });
  });

  // The actual reproduction: a per-keystroke commit re-derives the whole value list from the
  // field on every keystroke, including deletions. Backspacing "#home" down to a bare "#" makes
  // conditionValues() treat it as empty and drop it — taking the ", " before it along too, so
  // one Backspace (removing "h") silently erases three characters it was never asked to touch.
  // This one is not shielded by Vue's computed short-circuit: "#work, #h" differs from the
  // previously rendered "#work, #ho", so the corrupted value does reach the field.
  it("keeps the rest of a value and its separator when backspacing removes only its last character", async () => {
    await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const input = screen.getByLabelText<HTMLInputElement>(m.tasks_settings_condition_tag());
    await userEvent.type(input, "#work, #home");
    // Four backspaces removes exactly "home", leaving the "#" its tag started with — a
    // per-keystroke commit reads that bare "#" as empty and drops it, taking the ", " before it
    // along too, so the field ends up five characters short of what was actually deleted.
    await userEvent.type(input, "{Backspace}{Backspace}{Backspace}{Backspace}");

    expect(input.value).toBe("#work, #");
  });

  // A window losing OS focus blurs the focused field too — Chrome fires change and then blur on
  // it, with the field still document.activeElement, because the field did not lose focus, the
  // window did. A commit bound to those re-coerces text the user is part-way through typing while
  // they are looking at another window: "#work, #" comes back as "#work". The e2e leg that caught
  // this had a sibling worker's Obsidian taking focus mid-type. Dispatching the pair without
  // moving focus is exactly that shape.
  it("leaves a mid-edit value alone when the window loses focus rather than the field", async () => {
    await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const input = screen.getByLabelText<HTMLInputElement>(m.tasks_settings_condition_tag());
    await userEvent.type(input, "#work, #home");
    await userEvent.type(input, "{Backspace}{Backspace}{Backspace}{Backspace}");

    await fireEvent.change(input);
    await fireEvent.blur(input);

    expect(input.value).toBe("#work, #");

    // And the commit that was skipped is not lost with it: leaving the field for real still
    // coerces, which a guard hung on the change event alone would not — the browser fires change
    // once per edit, so the one swallowed above would have been the only one coming.
    await userEvent.tab();

    expect(input.value).toBe("#work");
  });

  // Same shape as the tag case above, for a heading condition — the row is shared, and a
  // heading's coercion (stripping markdown "#" markers rather than adding one) must not change
  // whether a second comma-separated value survives.
  it("stores both values for a heading condition, on Save", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const typeSelect = screen.getByDisplayValue(m.tasks_settings_condition_tag());
    await userEvent.selectOptions(typeSelect, m.tasks_settings_condition_heading());
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_heading()), "Work, Home");
    await save();

    expect(slice.state.rule.conditions.at(0)).toMatchObject({ type: "heading", headings: ["Work", "Home"] });
  });

  // The markdown "#" markers a heading is typed with have to come off before the value reaches
  // the store, same as a tag gains its "#" — coercion still runs, just at the commit boundary
  // rather than per keystroke.
  it("strips a heading's markdown # markers on Save", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const typeSelect = screen.getByDisplayValue(m.tasks_settings_condition_tag());
    await userEvent.selectOptions(typeSelect, m.tasks_settings_condition_heading());
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_heading()), "## Work");
    await save();

    expect(slice.state.rule.conditions.at(0)).toMatchObject({ type: "heading", headings: ["Work"] });
  });

  // Switching the condition type replaces the whole condition object (tags and headings cannot
  // coexist), so the field showing the old type's values must clear rather than keep displaying
  // text that no longer corresponds to anything in the model.
  it("clears the displayed text when the condition type is switched", async () => {
    await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await userEvent.tab();
    expect(screen.getByDisplayValue("#task")).toBeTruthy();

    const typeSelect = screen.getByDisplayValue(m.tasks_settings_condition_tag());
    await userEvent.selectOptions(typeSelect, m.tasks_settings_condition_heading());

    expect(screen.queryByDisplayValue("#task")).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>(m.tasks_settings_condition_heading()).value).toBe("");
  });

  // Clicking Save blurs the focused input first (a native button click moves focus before the
  // click handler runs), so a value typed just before Save, with no explicit Tab or click
  // elsewhere in between, must not be lost to the deferred commit.
  it("persists a value typed just before Save, with no intervening blur", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    expect(slice.state.rule.conditions.at(0)).toMatchObject({ type: "tag", tags: ["#task"] });
  });

  it("removes a condition from the global rule, on Save", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const [firstDelete] = screen.getAllByTestId("rule-remove-condition");
    if (!firstDelete) throw new Error("no delete button rendered");
    await userEvent.click(firstDelete);
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await save();

    expect(slice.state.rule.conditions).toHaveLength(1);
  });

  it("replaces a condition's fields when its type changes, rather than mixing tags and headings, on Save", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const typeSelect = screen.getByDisplayValue(m.tasks_settings_condition_tag());
    await userEvent.selectOptions(typeSelect, m.tasks_settings_condition_heading());
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_heading()), "Work");
    await save();

    expect(slice.state.rule.conditions.at(0)).toMatchObject({
      type: "heading",
      condition: "under",
      headings: ["Work"],
    });
    expect(slice.state.rule.conditions.at(0)).not.toHaveProperty("tags");
  });

  it("changes the rule's match mode, on Save", async () => {
    const { slice } = await mount();

    const modeSelect = screen.getByDisplayValue(m.tasks_settings_mode_and());
    await userEvent.selectOptions(modeSelect, m.tasks_settings_mode_or());
    await save();

    expect(slice.state.rule.mode).toBe("or");
  });

  // `closest(".setting-item")` finds ANY ancestor, so it would still pass if a second setting
  // row were reintroduced around the rule body — asserting the container holds exactly one is
  // what actually pins "the whole rule editor is one setting row, not several".
  it("renders the rule editor inside a single setting row, not one per part", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const row = screen.getByTestId("rule-condition-row");
    const settingItem = row.closest(".setting-item");
    expect(settingItem).not.toBeNull();
    expect(settingItem?.querySelectorAll(".setting-item")).toHaveLength(0);
  });
});

// identification.ts treats an empty tags/headings list as "no constraint", so a condition left
// with no value does not narrow the rule at all — under "or" mode it silently makes every
// checkbox item in the vault a task. checkboxRuleFormSchema (rule-form-schema.ts) exists to
// catch exactly this before it reaches the slice.
describe("empty-condition validation", () => {
  it("disables Save while a condition has no values, and Save never reaches the slice", async () => {
    const { slice } = await mount();
    const before = slice.state.rule.conditions.length;

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const saveButton: HTMLButtonElement = screen.getByText(m.common_action_submit());
    expect(saveButton.disabled).toBe(true);

    await userEvent.click(saveButton);

    expect(slice.state.rule.conditions).toHaveLength(before);
  });

  // The value only reaches the condition model at a commit boundary (blur or Enter), not on
  // every keystroke — see RuleConditionRow.vue — so Save reflects the typed value once the row
  // is left, not mid-type.
  it("enables Save once the empty condition is given a value and the row is left", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const saveButton: HTMLButtonElement = screen.getByText(m.common_action_submit());
    expect(saveButton.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "task");
    await userEvent.tab();

    expect(saveButton.disabled).toBe(false);
  });

  // Clicking "Add condition" creates an empty row by design — the normal first moment of
  // editing a fresh condition — so the error must not appear until the user has actually left
  // that row's input, or every "Add condition" click would read as an immediate mistake.
  it("keeps the missing-value error quiet until the row's input is left, then shows it", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("rule-add-condition"));

    expect(screen.queryByText(m.tasks_condition_values_required())).toBeNull();

    await userEvent.click(screen.getByLabelText(m.tasks_settings_condition_tag()));
    await userEvent.tab();

    expect(screen.getByText(m.tasks_condition_values_required())).toBeTruthy();
  });
});
