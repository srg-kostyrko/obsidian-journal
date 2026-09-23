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

  // The whole point of the modal: edits are staged, not written per keystroke.
  it("leaves the slice untouched until Save", async () => {
    const { slice } = await mount();
    const before = structuredClone({ ...slice.state.statusMap });

    await userEvent.click(screen.getByTestId("status-map-remove-/"));

    expect(slice.state.statusMap).toEqual(before);
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
