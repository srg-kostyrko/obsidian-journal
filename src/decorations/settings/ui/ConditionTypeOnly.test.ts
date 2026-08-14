import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import ConditionTypeOnly from "./ConditionTypeOnly.vue";

afterEach(() => cleanup());

function mount(type: "has-note" | "has-open-task" | "all-tasks-completed") {
  const container = new Container();
  container.register(Calendar).useValue(new Calendar());
  return render(ConditionTypeOnly, {
    props: { type },
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

describe("ConditionTypeOnly", () => {
  it.each([
    ["has-note", m.decoration_condition_has_note_describe()] as const,
    ["has-open-task", m.decoration_condition_has_open_task_describe()] as const,
    ["all-tasks-completed", m.decoration_condition_all_tasks_completed_describe()] as const,
  ])("renders the description for %s", (type, expected) => {
    mount(type);
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
