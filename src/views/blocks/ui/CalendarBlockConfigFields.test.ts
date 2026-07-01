import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Calendar } from "@/calendar";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import CalendarBlockConfigFields from "./CalendarBlockConfigFields.vue";

import type { CalendarBlockFields } from "./calendar-block-fields";

function mountFields(config: CalendarBlockFields, onChange: (patch: Partial<CalendarBlockFields>) => void) {
  const container = new Container();
  container.register(Calendar).useValue(new Calendar());
  return render(CalendarBlockConfigFields, {
    props: { unit: "week", config, onChange },
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

const baseConfig: CalendarBlockFields = { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" };

afterEach(() => cleanup());

describe("CalendarBlockConfigFields", () => {
  it("emits a before patch when the before input changes", async () => {
    const onChange = vi.fn();
    mountFields(baseConfig, onChange);
    const [beforeInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(beforeInput);
    await userEvent.type(beforeInput, "2");
    expect(onChange).toHaveBeenLastCalledWith({ before: 2 });
  });

  it("emits an after patch when the after input changes", async () => {
    const onChange = vi.fn();
    mountFields(baseConfig, onChange);
    const [, afterInput] = screen.getAllByRole("spinbutton");
    await userEvent.clear(afterInput);
    await userEvent.type(afterInput, "3");
    expect(onChange).toHaveBeenLastCalledWith({ after: 3 });
  });

  it("adds a weekday index to hiddenWeekdays when its checkbox is checked", async () => {
    const onChange = vi.fn();
    mountFields(baseConfig, onChange);
    await userEvent.click(screen.getByLabelText("Sat"));
    expect(onChange).toHaveBeenCalledWith({ hiddenWeekdays: [6] });
  });

  it("removes a weekday index from hiddenWeekdays when its checkbox is unchecked", async () => {
    const onChange = vi.fn();
    mountFields({ ...baseConfig, hiddenWeekdays: [6] }, onChange);
    await userEvent.click(screen.getByLabelText("Sat"));
    expect(onChange).toHaveBeenCalledWith({ hiddenWeekdays: [] });
  });

  it("emits a weeks patch when the weeks dropdown changes", async () => {
    const onChange = vi.fn();
    mountFields(baseConfig, onChange);
    await userEvent.selectOptions(screen.getByRole("combobox"), "right");
    expect(onChange).toHaveBeenCalledWith({ weeks: "right" });
  });
});
