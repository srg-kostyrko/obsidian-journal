import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
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
    await save();

    expect(slice.state.rule.conditions.at(0)).toMatchObject({ type: "tag", condition: "has", tags: [] });
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

  it("removes a condition from the global rule, on Save", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const [firstDelete] = screen.getAllByTestId("rule-remove-condition");
    if (!firstDelete) throw new Error("no delete button rendered");
    await userEvent.click(firstDelete);
    await save();

    expect(slice.state.rule.conditions).toHaveLength(1);
  });

  it("replaces a condition's fields when its type changes, rather than mixing tags and headings, on Save", async () => {
    const { slice } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const typeSelect = screen.getByDisplayValue(m.tasks_settings_condition_tag());
    await userEvent.selectOptions(typeSelect, m.tasks_settings_condition_heading());
    await save();

    expect(slice.state.rule.conditions.at(0)).toMatchObject({ type: "heading", condition: "under", headings: [] });
    expect(slice.state.rule.conditions.at(0)).not.toHaveProperty("tags");
  });

  it("changes the rule's match mode, on Save", async () => {
    const { slice } = await mount();

    const modeSelect = screen.getByDisplayValue(m.tasks_settings_mode_and());
    await userEvent.selectOptions(modeSelect, m.tasks_settings_mode_or());
    await save();

    expect(slice.state.rule.mode).toBe("or");
  });

  it("keeps the whole rule editor inside one setting row", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const row = screen.getByTestId("rule-condition-row");
    expect(row.closest(".setting-item")).not.toBeNull();
  });
});
