import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { SettingsService } from "@/settings";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { checkboxSlice } from "../slice";

import CheckboxProviderSection from "./CheckboxProviderSection.vue";

async function mount() {
  const harness = await testContainer({ modules: [tasksCoreModule] });
  const slice = harness.resolve(SettingsService).getSlice(checkboxSlice);
  harness.render(CheckboxProviderSection);
  return { harness, slice };
}

describe("CheckboxProviderSection", () => {
  it("shows the provider name from the message catalogue", async () => {
    await mount();
    expect(screen.getByText(m.tasks_settings_provider_checkbox())).toBeTruthy();
  });

  it("toggles the provider off", async () => {
    const { slice } = await mount();
    await userEvent.click(screen.getByTestId("checkbox-enabled"));
    expect(slice.state.enabled).toBe(false);
  });

  it("writes a changed symbol mapping back to the slice", async () => {
    const { slice } = await mount();
    const row = screen.getByTestId("status-map-row-/");
    const select = row.querySelector("select");
    if (!select) throw new Error("status map row has no select");
    await userEvent.selectOptions(select, "todo");
    expect(slice.state.statusMap["/"]).toBe("todo");
  });

  it("writes the canonical symbol for a type back to the slice", async () => {
    const { slice } = await mount();
    await userEvent.click(screen.getByTestId("canonical-done-X"));
    expect(slice.state.canonical.done).toBe("X");
  });

  it("adds a tag condition to the global rule", async () => {
    const { slice } = await mount();
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    expect(slice.state.rule.conditions.at(0)).toMatchObject({ type: "tag", condition: "has", tags: [] });
  });

  it("removes a condition from the global rule", async () => {
    const { slice } = await mount();
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    expect(slice.state.rule.conditions).toHaveLength(2);

    const [firstDelete] = screen.getAllByRole("button", { name: m.common_action_delete() });
    if (!firstDelete) throw new Error("no delete button rendered");
    await userEvent.click(firstDelete);

    expect(slice.state.rule.conditions).toHaveLength(1);
  });

  it("replaces a condition's fields when its type changes, rather than mixing tags and headings", async () => {
    const { slice } = await mount();
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const typeSelect = screen.getByDisplayValue(m.tasks_settings_condition_tag());

    await userEvent.selectOptions(typeSelect, m.tasks_settings_condition_heading());

    expect(slice.state.rule.conditions.at(0)).toMatchObject({ type: "heading", condition: "under", headings: [] });
    expect(slice.state.rule.conditions.at(0)).not.toHaveProperty("tags");
  });

  it("changes the rule's match mode", async () => {
    const { slice } = await mount();
    const modeSelect = screen.getByDisplayValue(m.tasks_settings_mode_and());

    await userEvent.selectOptions(modeSelect, m.tasks_settings_mode_or());

    expect(slice.state.rule.mode).toBe("or");
  });
});
