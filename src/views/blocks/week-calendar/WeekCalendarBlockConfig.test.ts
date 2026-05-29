import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import WeekCalendarBlockConfig from "./ui/WeekCalendarBlockConfig.vue";

import type { WeekCalendarConfig, WeekCalendarConfigChange } from "./week-calendar-block";

function mountConfig(config: WeekCalendarConfig, onChange: WeekCalendarConfigChange) {
  return render(WeekCalendarBlockConfig, { props: { config, onChange } });
}

afterEach(() => cleanup());

describe("WeekCalendarBlockConfig", () => {
  it("emits onChange with updated before count when the input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hideWeekends: false }, onChange);
    const [beforeInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(beforeInput);
    await userEvent.type(beforeInput, "2");
    expect(onChange).toHaveBeenLastCalledWith({ before: 2, after: 0, hideWeekends: false });
  });

  it("emits onChange with updated after count when the input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hideWeekends: false }, onChange);
    const [, afterInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(afterInput);
    await userEvent.type(afterInput, "3");
    expect(onChange).toHaveBeenLastCalledWith({ before: 0, after: 3, hideWeekends: false });
  });

  it("emits onChange with toggled hideWeekends when the toggle is flipped", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hideWeekends: false }, onChange);
    const toggle = screen.getByRole("checkbox");
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ before: 0, after: 0, hideWeekends: true });
  });
});
