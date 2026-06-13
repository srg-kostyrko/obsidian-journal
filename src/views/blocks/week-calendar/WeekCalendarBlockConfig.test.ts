import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Calendar } from "@/calendar";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import WeekCalendarBlockConfig from "./ui/WeekCalendarBlockConfig.vue";

import type { WeekCalendarConfig, WeekCalendarConfigChange } from "./week-calendar-block";

function mountConfig(config: WeekCalendarConfig, onChange: WeekCalendarConfigChange) {
  const container = new Container();
  container.register(Calendar).useValue(new Calendar());
  return render(WeekCalendarBlockConfig, {
    props: { config, onChange },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

afterEach(() => cleanup());

describe("WeekCalendarBlockConfig", () => {
  it("emits onChange with updated before count when the input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const }, onChange);
    const [beforeInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(beforeInput);
    await userEvent.type(beforeInput, "2");
    expect(onChange).toHaveBeenLastCalledWith({ before: 2, after: 0, hiddenWeekdays: [], weeks: "left" });
  });

  it("emits onChange with updated after count when the input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const }, onChange);
    const [, afterInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(afterInput);
    await userEvent.type(afterInput, "3");
    expect(onChange).toHaveBeenLastCalledWith({ before: 0, after: 3, hiddenWeekdays: [], weeks: "left" });
  });

  it("adds a weekday index to hiddenWeekdays when its checkbox is checked", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const }, onChange);
    await userEvent.click(screen.getByLabelText("Sat"));
    expect(onChange).toHaveBeenCalledWith({ before: 0, after: 0, hiddenWeekdays: [6], weeks: "left" });
  });

  it("removes a weekday index from hiddenWeekdays when its checkbox is unchecked", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [6], weeks: "left" as const }, onChange);
    await userEvent.click(screen.getByLabelText("Sat"));
    expect(onChange).toHaveBeenCalledWith({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" });
  });
});
