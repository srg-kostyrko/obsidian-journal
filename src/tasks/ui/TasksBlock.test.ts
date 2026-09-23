import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";
import type { Module } from "@/infrastructure/di";
import { journalsCoreModule } from "@/journals/module";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../module";
import { TaskProviderToken, type TaskProvider } from "../types";

import TasksBlock from "./TasksBlock.vue";

// TaskProvider.start returns a disposer; these stand-in providers are never started by
// TasksBlock (it only reads settingsRow), so the disposer is never called.
function noDisposer(): void {
  /* never started */
}

const FakeSection = defineComponent({ render: () => h("div", "fake provider section") });
const fakeProvider: TaskProvider = { id: "fake", settingsRow: FakeSection, start: () => noDisposer };
const fakeProviderModule: Module = {
  register(c) {
    c.register(TaskProviderToken).useValue(fakeProvider);
  },
};

const bareProvider: TaskProvider = { id: "bare", start: () => noDisposer };
const bareProviderModule: Module = {
  register(c) {
    c.register(TaskProviderToken).useValue(bareProvider);
  },
};

async function openBlock(): Promise<void> {
  await userEvent.click(screen.getByText(m.tasks_settings_title()));
}

describe("TasksBlock", () => {
  it("starts collapsed", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule, tasksCoreModule] });
    harness.render(TasksBlock);
    expect(screen.queryByText(m.tasks_settings_provider_checkbox())).toBeNull();
  });

  it("renders the checkbox provider's section once expanded", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule, tasksCoreModule] });
    harness.render(TasksBlock);
    await openBlock();
    expect(screen.getByText(m.tasks_settings_provider_checkbox())).toBeTruthy();
  });

  // Guards against TasksBlock hardcoding the checkbox provider: a module registering some other
  // provider under TaskProviderToken must show up too, with no reference to tasksCoreModule at all.
  it("renders sections from whatever the TaskProviderToken multi-token holds, not a fixed provider", async () => {
    const harness = await testContainer({ modules: [fakeProviderModule] });
    harness.render(TasksBlock);
    await openBlock();

    expect(screen.getByText("fake provider section")).toBeTruthy();
    expect(screen.queryByText(m.tasks_settings_provider_checkbox())).toBeNull();
  });

  it("skips a registered provider that declares no settings section", async () => {
    const harness = await testContainer({ modules: [bareProviderModule] });
    const { container } = harness.render(TasksBlock);
    await openBlock();

    expect(container.querySelector(".collapsible-content")?.children.length ?? 0).toBe(0);
  });
});
