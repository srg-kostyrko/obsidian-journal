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

async function remap(symbol: string, status: string): Promise<void> {
  const row = screen.getByTestId(`status-map-row-${symbol}`);
  const select = row.querySelector("select");
  if (!select) throw new Error(`status map row ${symbol} has no select`);
  await userEvent.selectOptions(select, status);
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

  it("adds a new symbol mapping to the slice", async () => {
    const { slice } = await mount();
    await userEvent.type(screen.getByTestId("status-map-new-symbol"), ">");
    await userEvent.click(screen.getByTestId("status-map-add"));
    expect(slice.state.statusMap[">"]).toBe("todo");
  });

  it("does not add a blank or already-mapped symbol", async () => {
    const { slice } = await mount();
    const before = { ...slice.state.statusMap };

    await userEvent.click(screen.getByTestId("status-map-add"));
    expect(slice.state.statusMap).toEqual(before);

    await userEvent.type(screen.getByTestId("status-map-new-symbol"), "/");
    await userEvent.click(screen.getByTestId("status-map-add"));
    expect(slice.state.statusMap).toEqual(before);
  });

  it("removes a symbol mapping from the slice", async () => {
    const { slice } = await mount();
    expect(slice.state.statusMap).toHaveProperty("/");

    await userEvent.click(screen.getByTestId("status-map-remove-/"));

    expect(slice.state.statusMap).not.toHaveProperty("/");
  });

  it("reassigns the write symbol when its canonical symbol is removed", async () => {
    const { slice } = await mount();
    // "x" and "X" both read as done; canonical.done ships as "x".
    expect(slice.state.canonical.done).toBe("x");

    await userEvent.click(screen.getByTestId("status-map-remove-x"));

    expect(slice.state.canonical.done).toBe("X");
  });

  it("reassigns the write symbol when its canonical symbol is remapped to another status", async () => {
    const { slice } = await mount();
    expect(slice.state.canonical.done).toBe("x");

    await remap("x", "todo");

    expect(slice.state.canonical.done).toBe("X");
  });

  it("drops the write symbol when remapping leaves its status with no symbol", async () => {
    const { slice } = await mount();
    expect(slice.state.canonical["in-progress"]).toBe("/");

    await remap("/", "todo");

    expect(slice.state.canonical).not.toHaveProperty("in-progress");
  });

  it("renders status option labels from the message catalogue, not the raw identifier", async () => {
    await mount();
    expect(screen.getAllByText(m.tasks_status_in_progress()).length).toBeGreaterThan(0);
    expect(screen.queryByText("in-progress")).toBeNull();
  });

  it("names each write-symbol row with that status's own whole-phrase variant", async () => {
    await mount();
    expect(screen.getByText(m.tasks_settings_write_symbol({ status: "done" }))).toBeTruthy();
    // The stored type name is "in-progress" while the selector value is "in_progress": paraglide
    // answers a value it has no variant for with the bare message key, so a row naming itself
    // "tasks_settings_write_symbol" is what an unnormalized status looks like on screen.
    expect(screen.getByText(m.tasks_settings_write_symbol({ status: "in_progress" }))).toBeTruthy();
    expect(screen.queryByText("tasks_settings_write_symbol")).toBeNull();
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

    const [firstDelete] = screen.getAllByTestId("rule-remove-condition");
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
