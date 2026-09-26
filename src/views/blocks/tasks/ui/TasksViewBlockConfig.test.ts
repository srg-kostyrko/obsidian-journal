import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { initLocale, m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { DEFAULT_TASK_QUERY } from "@/tasks/query";
import { testContainer } from "@/testing";

import { tasksViewBlock } from "../tasks-view-block";

import TasksViewBlockConfig from "./TasksViewBlockConfig.vue";

import type { TasksViewBlockConfig as Config } from "../tasks-view-block";

const daily = fixedJournal("Daily", { type: "day" });
const weekly = fixedJournal("Weekly", { type: "week" });

async function mountConfig(config: Config = tasksViewBlock.defaultConfig, onChange = vi.fn()) {
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: { journals: { Daily: daily, Weekly: weekly } },
  });
  harness.render(TasksViewBlockConfig, { props: { config, onChange } });
  return onChange;
}

function controlFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest(".setting-item");
  if (!row) throw new Error(`No row named ${name}`);
  return row as HTMLElement;
}

describe("TasksViewBlockConfig", () => {
  beforeAll(() => initLocale("en"));

  it("exposes window, journals, source and sort controls", async () => {
    await mountConfig();
    expect(screen.getByText(m.view_block_config_window_label())).toBeTruthy();
    expect(screen.getByText(m.view_block_tasks_journals_label())).toBeTruthy();
    expect(screen.getByText(m.view_block_tasks_source_label())).toBeTruthy();
    expect(screen.getByText(m.view_block_tasks_sort_label())).toBeTruthy();
  });

  it("emits the complete config when the window changes", async () => {
    const onChange = await mountConfig();
    const dropdown = within(controlFor(m.view_block_config_window_label())).getByRole("combobox");
    await userEvent.selectOptions(dropdown, "month");
    expect(onChange).toHaveBeenCalledWith({ ...tasksViewBlock.defaultConfig, window: "month" });
  });

  it("emits the complete config when the source changes", async () => {
    const onChange = await mountConfig();
    const dropdown = within(controlFor(m.view_block_tasks_source_label())).getByRole("combobox");
    await userEvent.selectOptions(dropdown, "note");
    expect(onChange).toHaveBeenCalledWith({
      ...tasksViewBlock.defaultConfig,
      scope: { ...DEFAULT_TASK_QUERY.scope, source: "note" },
    });
  });

  it("emits the complete config when the sort changes", async () => {
    const onChange = await mountConfig();
    const dropdown = within(controlFor(m.view_block_tasks_sort_label())).getByRole("combobox");
    await userEvent.selectOptions(dropdown, "due");
    expect(onChange).toHaveBeenCalledWith({ ...tasksViewBlock.defaultConfig, sort: "due" });
  });

  it("narrows to the journals toggled on", async () => {
    const onChange = await mountConfig();
    await userEvent.click(screen.getByText("Daily"));
    expect(onChange).toHaveBeenCalledWith({ ...tasksViewBlock.defaultConfig, journals: ["Daily"] });
  });

  it("offers no journals row when no journal exists", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
    harness.render(TasksViewBlockConfig, { props: { config: tasksViewBlock.defaultConfig, onChange: vi.fn() } });
    expect(screen.queryByText(m.view_block_tasks_journals_label())).toBeNull();
  });
});
