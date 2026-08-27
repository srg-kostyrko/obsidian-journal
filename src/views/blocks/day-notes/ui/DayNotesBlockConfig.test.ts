import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { testContainer } from "@/testing";

import DayNotesBlockConfig from "./DayNotesBlockConfig.vue";

import type { DayNotesBlockConfig as Config } from "../day-notes-block";

const config: Config = {
  granularity: "day",
  sortField: "modified",
  sortDirection: "desc",
  showHeading: true,
};

async function mountConfig(onChange = vi.fn()) {
  const harness = await testContainer();
  harness.render(DayNotesBlockConfig, { props: { config, onChange } });
  return onChange;
}

function controlFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest(".setting-item");
  if (!row) throw new Error(`No row named ${name}`);
  return row as HTMLElement;
}

describe("DayNotesBlockConfig", () => {
  it("exposes all four block settings", async () => {
    await mountConfig();
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(screen.getByText(m.view_block_day_notes_show_heading_label())).toBeTruthy();
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });

  it("emits the complete config when granularity changes", async () => {
    const onChange = await mountConfig();
    const dropdown = within(controlFor(m.view_block_day_notes_granularity_label())).getByRole("combobox");
    await userEvent.selectOptions(dropdown, "month");
    expect(onChange).toHaveBeenCalledWith({ ...config, granularity: "month" });
  });

  it("emits the complete config when sorting changes", async () => {
    const onChange = await mountConfig();
    const field = within(controlFor(m.view_block_day_notes_sort_field_label())).getByRole("combobox");
    const direction = within(controlFor(m.view_block_day_notes_sort_direction_label())).getByRole("combobox");

    await userEvent.selectOptions(field, "created");
    await userEvent.selectOptions(direction, "asc");

    expect(onChange).toHaveBeenNthCalledWith(1, { ...config, sortField: "created" });
    expect(onChange).toHaveBeenNthCalledWith(2, { ...config, sortDirection: "asc" });
  });

  it("can hide the heading", async () => {
    const onChange = await mountConfig();
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith({ ...config, showHeading: false });
  });
});
