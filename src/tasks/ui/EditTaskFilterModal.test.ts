import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";

import { initLocale, m } from "@/i18n";
import { testContainer } from "@/testing";

import EditTaskFilterModal from "./EditTaskFilterModal.vue";

import type { TaskRule } from "../conditions";

const EMPTY_FILTER: TaskRule = { mode: "and", conditions: [] };

async function mount(filter: TaskRule = EMPTY_FILTER) {
  const harness = await testContainer();
  const { submit, cancel } = harness.renderModal(EditTaskFilterModal, { props: { filter } });
  return { harness, submit, cancel };
}

describe("EditTaskFilterModal", () => {
  beforeAll(() => initLocale("en"));

  // The whole reason this editor is a separate instance from the checkbox one: a listing filter's
  // most useful condition is exactly the one identification can never offer.
  it("offers a status condition in the type dropdown, unlike the checkbox identification editor", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const typeSelect = screen.getByDisplayValue(m.tasks_settings_condition_tag());
    const optionLabels = [...typeSelect.querySelectorAll("option")].map((option) => option.textContent);
    expect(optionLabels).toContain(m.tasks_settings_condition_status());
  });

  it("submits the edited rule, not the array the draft was mutating", async () => {
    const { submit } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.type(screen.getByLabelText(m.tasks_settings_condition_tag()), "work");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    expect(submit).toHaveBeenCalledWith({
      mode: "and",
      conditions: [{ type: "tag", condition: "has", tags: ["#work"] }],
    });
  });

  it("lets a status condition be picked and toggled by group, not typed", async () => {
    const { submit } = await mount();

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const typeSelect = screen.getByDisplayValue(m.tasks_settings_condition_tag());
    await userEvent.selectOptions(typeSelect, m.tasks_settings_condition_status());
    await userEvent.click(screen.getByText(m.tasks_status_group_open()));
    await userEvent.click(screen.getByText(m.common_action_submit()));

    expect(submit).toHaveBeenCalledWith({
      mode: "and",
      conditions: [{ type: "status", condition: "is", statuses: ["open"] }],
    });
  });

  it("discards the edit on Cancel", async () => {
    const { cancel } = await mount({ mode: "and", conditions: [] });

    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalled();
  });

  it("disables Save while a condition has no values", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const saveButton: HTMLButtonElement = screen.getByText(m.common_action_submit());
    expect(saveButton.disabled).toBe(true);
  });

  it("seeds the editor from the passed-in filter", async () => {
    await mount({ mode: "or", conditions: [{ type: "status", condition: "is-not", statuses: ["done"] }] });
    expect(screen.getByDisplayValue(m.tasks_settings_mode_or())).toBeTruthy();
    expect(screen.getByText(m.tasks_status_group_done())).toBeTruthy();
  });
});
