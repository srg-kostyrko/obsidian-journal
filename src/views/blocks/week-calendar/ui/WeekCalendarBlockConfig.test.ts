import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { testContainer } from "@/testing";

import WeekCalendarBlockConfig from "./WeekCalendarBlockConfig.vue";

import type { WeekCalendarConfig, WeekCalendarConfigChange } from "../week-calendar-block";

async function mountConfig(config: WeekCalendarConfig, onChange: WeekCalendarConfigChange) {
  const harness = await testContainer();
  return harness.render(WeekCalendarBlockConfig, { props: { config, onChange } });
}

describe("WeekCalendarBlockConfig", () => {
  it("merges a field patch into the full config for onChange", async () => {
    const onChange = vi.fn();
    await mountConfig(
      {
        before: 0,
        after: 0,
        hiddenWeekdays: [],
        weeks: "left" as const,
        showHeading: "default",
        showWeekdays: "default",
      },
      onChange,
    );
    const [beforeInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(beforeInput);
    await userEvent.type(beforeInput, "2");
    expect(onChange).toHaveBeenLastCalledWith({
      before: 2,
      after: 0,
      hiddenWeekdays: [],
      weeks: "left",
      showHeading: "default",
      showWeekdays: "default",
    });
  });

  it("writes a hidden weekday header as a literal false", async () => {
    const onChange = vi.fn();
    await mountConfig(
      {
        before: 0,
        after: 0,
        hiddenWeekdays: [],
        weeks: "left" as const,
        showHeading: "default",
        showWeekdays: "default",
      },
      onChange,
    );
    await userEvent.selectOptions(screen.getAllByRole("combobox")[2], "Hidden");
    expect(onChange).toHaveBeenCalledWith({
      before: 0,
      after: 0,
      hiddenWeekdays: [],
      weeks: "left",
      showHeading: "default",
      showWeekdays: false,
    });
  });
});
