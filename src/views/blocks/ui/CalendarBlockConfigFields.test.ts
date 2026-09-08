import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import { testContainer } from "@/testing";

import CalendarBlockConfigFields from "./CalendarBlockConfigFields.vue";

import type { CalendarBlockFields } from "./calendar-block-fields";

async function mountFields(config: CalendarBlockFields, onChange: (patch: Partial<CalendarBlockFields>) => void) {
  const harness = await testContainer();
  return harness.render(CalendarBlockConfigFields, { props: { unit: "week", config, onChange } });
}

function weekdayLabels(): string[] {
  return within(screen.getByRole("group"))
    .getAllByRole("button")
    .map((day) => day.textContent?.trim() ?? "");
}

const baseConfig: CalendarBlockFields = { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" };

describe("CalendarBlockConfigFields", () => {
  it("emits a before patch when the before input changes", async () => {
    const onChange = vi.fn();
    await mountFields(baseConfig, onChange);
    const [beforeInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(beforeInput);
    await userEvent.type(beforeInput, "2");
    expect(onChange).toHaveBeenLastCalledWith({ before: 2 });
  });

  it("emits an after patch when the after input changes", async () => {
    const onChange = vi.fn();
    await mountFields(baseConfig, onChange);
    const [, afterInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(afterInput);
    await userEvent.type(afterInput, "3");
    expect(onChange).toHaveBeenLastCalledWith({ after: 3 });
  });

  it("hides a weekday when its shown button is clicked", async () => {
    const onChange = vi.fn();
    await mountFields(baseConfig, onChange);
    await userEvent.click(screen.getByRole("button", { name: "Sat" }));
    expect(onChange).toHaveBeenCalledWith({ hiddenWeekdays: [6] });
  });

  it("shows a hidden weekday when its dimmed button is clicked", async () => {
    const onChange = vi.fn();
    await mountFields({ ...baseConfig, hiddenWeekdays: [6] }, onChange);
    await userEvent.click(screen.getByRole("button", { name: "Sat" }));
    expect(onChange).toHaveBeenCalledWith({ hiddenWeekdays: [] });
  });

  it("reorders the weekday buttons when the week preset moves the first day", async () => {
    await mountFields(baseConfig, vi.fn());
    expect(weekdayLabels()).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

    // Entering at the grid rather than at the calendar slice: CalendarSettingsBridge's own test
    // covers the slice reaching applyWeekConfig, and this asserts what applyWeekConfig reaches.
    installTestCalendar({ dow: 0, doy: 6 });
    await nextTick();

    expect(weekdayLabels()).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("emits a weeks patch when the weeks dropdown changes", async () => {
    const onChange = vi.fn();
    await mountFields(baseConfig, onChange);
    await userEvent.selectOptions(screen.getByRole("combobox"), "right");
    expect(onChange).toHaveBeenCalledWith({ weeks: "right" });
  });
});
