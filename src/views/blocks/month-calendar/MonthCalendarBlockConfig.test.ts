import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { testContainer } from "@/testing";

import MonthCalendarBlockConfig from "./ui/MonthCalendarBlockConfig.vue";

import type { MonthCalendarConfig, MonthCalendarConfigChange } from "./month-calendar-block";

async function mountConfig(config: MonthCalendarConfig, onChange: MonthCalendarConfigChange) {
  const harness = await testContainer();
  return harness.render(MonthCalendarBlockConfig, { props: { config, onChange } });
}

describe("MonthCalendarBlockConfig", () => {
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
