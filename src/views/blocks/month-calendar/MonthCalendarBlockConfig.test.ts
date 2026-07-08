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

  it("emits onChange turning follow off when the follow toggle is switched off", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const, showHeading: true }, onChange);
    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith({
      before: 0,
      after: 0,
      hiddenWeekdays: [],
      weeks: "left",
      showHeading: true,
      followActiveDate: false,
    });
  });
});
