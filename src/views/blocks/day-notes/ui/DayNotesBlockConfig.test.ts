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
  showNavigation: false,
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
  it("exposes the block settings and independent heading and navigation toggles", async () => {
    await mountConfig();
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(screen.getByText(m.view_block_day_notes_show_heading_label())).toBeTruthy();
    expect(screen.getByText(m.view_block_day_notes_show_navigation_label())).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
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
    await userEvent.click(within(controlFor(m.view_block_day_notes_show_heading_label())).getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith({ ...config, showHeading: false });
  });

  it("can enable period navigation without changing the heading", async () => {
    const onChange = await mountConfig();
    await userEvent.click(within(controlFor(m.view_block_day_notes_show_navigation_label())).getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith({ ...config, showNavigation: true });
  });
});
