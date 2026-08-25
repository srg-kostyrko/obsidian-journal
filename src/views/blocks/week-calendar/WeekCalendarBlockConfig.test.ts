import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { testContainer } from "@/testing";

import WeekCalendarBlockConfig from "./ui/WeekCalendarBlockConfig.vue";

import type { WeekCalendarConfig, WeekCalendarConfigChange } from "./week-calendar-block";

async function mountConfig(config: WeekCalendarConfig, onChange: WeekCalendarConfigChange) {
  const harness = await testContainer();
  return harness.render(WeekCalendarBlockConfig, { props: { config, onChange } });
}

describe("WeekCalendarBlockConfig", () => {
  it("merges a field patch into the full config for onChange", async () => {
    const onChange = vi.fn();
    await mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
    const [beforeInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(beforeInput);
    await userEvent.type(beforeInput, "2");
    expect(onChange).toHaveBeenLastCalledWith({
      before: 2,
      after: 0,
      hiddenWeekdays: [],
      weeks: "left",
      showHeading: true,
    });
  });

  it("emits onChange turning the heading off when the toggle is switched off", async () => {
    const onChange = vi.fn();
    await mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes.at(-1)!);
    expect(onChange).toHaveBeenCalledWith({
      before: 0,
      after: 0,
      hiddenWeekdays: [],
      weeks: "left",
      showHeading: false,
    });
  });
});
