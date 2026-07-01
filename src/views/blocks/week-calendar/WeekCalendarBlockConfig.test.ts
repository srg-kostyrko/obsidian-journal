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
  it("merges a field patch into the full config for onChange", async () => {
    const onChange = vi.fn();
    mountConfig({ before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const }, onChange);
    const [beforeInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(beforeInput);
    await userEvent.type(beforeInput, "2");
    expect(onChange).toHaveBeenLastCalledWith({ before: 2, after: 0, hiddenWeekdays: [], weeks: "left" });
  });
});
