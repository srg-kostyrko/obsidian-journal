import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { SettingsService } from "@/settings";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { EditCheckboxProviderFlow } from "../flows/edit-checkbox-provider.flow";
import { checkboxSlice } from "../slice";

import CheckboxSettingsRow from "./CheckboxSettingsRow.vue";

async function mount() {
  const harness = await testContainer({ modules: [tasksCoreModule] });
  const slice = harness.resolve(SettingsService).getSlice(checkboxSlice);
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  harness.render(CheckboxSettingsRow);
  return { harness, slice, flows };
}

describe("CheckboxSettingsRow", () => {
  it("names the provider", async () => {
    await mount();
    expect(screen.getByText(m.tasks_settings_provider_checkbox())).toBeTruthy();
  });

  it("summarizes the current rule", async () => {
    await mount();
    expect(screen.getByTestId("checkbox-summary").textContent).toContain(m.tasks_rule_summary_any());
  });

  // A summary read once at mount would go stale the moment the modal saved.
  it("refreshes the summary when the rule changes", async () => {
    const { slice } = await mount();
    slice.state.rule = { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#task"] }] };
    await nextTick();
    expect(screen.getByTestId("checkbox-summary").textContent).toContain("#task");
  });

  it("toggles the provider off from the row, without opening anything", async () => {
    const { slice, flows } = await mount();
    await userEvent.click(screen.getByTestId("checkbox-enabled"));
    expect(slice.state.enabled).toBe(false);
    expect(flows.invoke).not.toHaveBeenCalled();
  });

  it("opens the provider modal from the gear", async () => {
    const { flows } = await mount();
    await userEvent.click(screen.getByTestId("checkbox-configure"));
    expect(flows.invoke).toHaveBeenCalledWith(EditCheckboxProviderFlow, {});
  });
});
