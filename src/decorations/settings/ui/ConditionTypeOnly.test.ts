import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer } from "@/testing";

import ConditionTypeOnly from "./ConditionTypeOnly.vue";

async function mount(type: "has-note" | "has-open-task" | "all-tasks-completed") {
  const harness = await testContainer();
  return harness.render(ConditionTypeOnly, { props: { type } });
}

describe("ConditionTypeOnly", () => {
  it.each([
    ["has-note", m.decoration_condition_has_note_describe()] as const,
    ["has-open-task", m.decoration_condition_has_open_task_describe()] as const,
    ["all-tasks-completed", m.decoration_condition_all_tasks_completed_describe()] as const,
  ])("renders the description for %s", async (type, expected) => {
    await mount(type);
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
