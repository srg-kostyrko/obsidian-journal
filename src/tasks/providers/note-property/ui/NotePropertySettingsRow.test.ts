import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { SettingsService } from "@/settings";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { EditNotePropertyProviderFlow } from "../flows/edit-note-property-provider.flow";
import { notePropertySlice } from "../slice";

import NotePropertySettingsRow from "./NotePropertySettingsRow.vue";

async function mount() {
  const harness = await testContainer({ modules: [tasksCoreModule] });
  const slice = harness.resolve(SettingsService).getSlice(notePropertySlice);
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  harness.render(NotePropertySettingsRow);
  return { harness, slice, flows };
}

function summary(): string {
  return screen.getByTestId("note-property-summary").textContent;
}

describe("NotePropertySettingsRow", () => {
  it("names the provider", async () => {
    await mount();
    expect(screen.getByText(m.tasks_settings_provider_note_property())).toBeTruthy();
  });

  it("summarizes identification by tag", async () => {
    await mount();
    expect(summary()).toContain(m.tasks_note_property_summary_tag({ tag: "#task" }));
  });

  it("summarizes identification by a property and its value", async () => {
    const { slice } = await mount();
    slice.state.identify = { by: "property", name: "type", value: "task" };
    await nextTick();
    expect(summary()).toContain(m.tasks_note_property_summary_property({ property: "type", value: "task" }));
  });

  it("summarizes identification by a property with any value", async () => {
    const { slice } = await mount();
    slice.state.identify = { by: "property", name: "due", value: "" };
    await nextTick();
    expect(summary()).toContain(m.tasks_note_property_summary_property_any({ property: "due" }));
  });

  it("turns the provider on from the row, without opening anything", async () => {
    const { slice, flows } = await mount();
    expect(slice.state.enabled).toBe(false);
    await userEvent.click(screen.getByTestId("note-property-enabled"));
    expect(slice.state.enabled).toBe(true);
    expect(flows.invoke).not.toHaveBeenCalled();
  });

  it("opens the provider modal from the gear", async () => {
    const { flows } = await mount();
    await userEvent.click(screen.getByTestId("note-property-configure"));
    expect(flows.invoke).toHaveBeenCalledWith(EditNotePropertyProviderFlow, {});
  });
});
