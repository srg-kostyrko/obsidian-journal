import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { testContainer } from "@/testing";

import MonthCalendarBlockConfig from "./MonthCalendarBlockConfig.vue";

import type { MonthCalendarConfig, MonthCalendarConfigChange } from "../month-calendar-block";

async function mountConfig(config: MonthCalendarConfig, onChange: MonthCalendarConfigChange) {
  const harness = await testContainer();
  return harness.render(MonthCalendarBlockConfig, { props: { config, onChange } });
}

const config: MonthCalendarConfig = {
  before: 0,
  after: 0,
  hiddenWeekdays: [],
  weeks: "left",
  showHeading: "default",
  showWeekdays: "default",
  outsideDays: "default",
  monthRows: "default",
};

function optionLabels(select: HTMLElement): (string | null)[] {
  return within(select)
    .getAllByRole("option")
    .map((option) => option.textContent);
}

describe("MonthCalendarBlockConfig", () => {
  it("offers the four outside-days choices and the two row rules", async () => {
    await mountConfig(config, vi.fn());
    const [, , , outside, rows] = screen.getAllByRole("combobox");
    expect(optionLabels(outside)).toEqual(["Default", "Interactive", "Inert", "Hidden"]);
    expect(optionLabels(rows)).toEqual(["Default", "As needed", "Always six"]);
  });

  it("writes the literal outside-days value into the full config", async () => {
    const onChange = vi.fn();
    await mountConfig(config, onChange);
    await userEvent.selectOptions(screen.getAllByRole("combobox")[3], "Inert");
    expect(onChange).toHaveBeenCalledWith({ ...config, outsideDays: "inert" });
  });

  it("writes the literal rows value into the full config", async () => {
    const onChange = vi.fn();
    await mountConfig(config, onChange);
    await userEvent.selectOptions(screen.getAllByRole("combobox")[4], "Always six");
    expect(onChange).toHaveBeenCalledWith({ ...config, monthRows: "six" });
  });

  it("writes a hidden heading as a literal false", async () => {
    const onChange = vi.fn();
    await mountConfig(config, onChange);
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "Hidden");
    expect(onChange).toHaveBeenCalledWith({ ...config, showHeading: false });
  });
});
