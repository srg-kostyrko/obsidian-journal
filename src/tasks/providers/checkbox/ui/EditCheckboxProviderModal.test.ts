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
