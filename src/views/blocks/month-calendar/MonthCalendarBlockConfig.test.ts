import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Calendar } from "@/calendar";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import MonthCalendarBlockConfig from "./ui/MonthCalendarBlockConfig.vue";

import type { MonthCalendarConfig, MonthCalendarConfigChange } from "./month-calendar-block";

function mountConfig(config: MonthCalendarConfig, onChange: MonthCalendarConfigChange) {
  const container = new Container();
  container.register(Calendar).useValue(new Calendar());
  return render(MonthCalendarBlockConfig, {
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

describe("MonthCalendarBlockConfig", () => {
  it("emits onChange with updated before count when the input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
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

  it("emits onChange with updated after count when the input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
    const [, afterInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(afterInput);
    await userEvent.type(afterInput, "3");
    expect(onChange).toHaveBeenLastCalledWith({
      before: 0,
      after: 3,
      hiddenWeekdays: [],
      weeks: "left",
      showHeading: true,
    });
  });

  it("adds a weekday index to hiddenWeekdays when its checkbox is checked", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
    await userEvent.click(screen.getByLabelText("Sat"));
    expect(onChange).toHaveBeenCalledWith({
      before: 0,
      after: 0,
      hiddenWeekdays: [6],
      weeks: "left",
      showHeading: true,
    });
  });

  it("removes a weekday index from hiddenWeekdays when its checkbox is unchecked", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [6], weeks: "left" as const, showHeading: true }, onChange);
    await userEvent.click(screen.getByLabelText("Sat"));
    expect(onChange).toHaveBeenCalledWith({
      before: 0,
      after: 0,
      hiddenWeekdays: [],
      weeks: "left",
      showHeading: true,
    });
  });

  it("emits onChange turning the heading off when the toggle is switched off", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
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
