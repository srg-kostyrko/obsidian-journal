import { screen } from "@testing-library/vue";
import * as v from "valibot";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import type { AnchorString } from "@/calendar";
import { initLocale, m } from "@/i18n";
import { MarkdownRenderService, type VaultPath } from "@/infrastructure/host";
import { FakeMarkdownRenderService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { tasksCoreModule } from "@/tasks/module";
import { TaskIndex } from "@/tasks/task-index";
import { buildTaskItem } from "@/tasks/testing";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { tasksBlockSchema } from "../tasks-config";

import TasksCodeBlock from "./TasksCodeBlock.vue";

const DAY = "2026-09-22" as AnchorString;
const HOST = "Daily/2026-09-22.md" as VaultPath;

const daily = fixedJournal("Daily", { type: "day" });
const DEFAULT_CONFIG = v.parse(tasksBlockSchema, {});

async function mount(path: VaultPath = HOST): Promise<TestHarness> {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule],
    data: { journals: { Daily: daily }, shelves: {} },
    overrides: [
      overrideWith(MarkdownRenderService, new FakeMarkdownRenderService() as unknown as MarkdownRenderService),
    ],
  });
  harness.render(TasksCodeBlock, { props: { path, config: DEFAULT_CONFIG } });
  return harness;
}

function seedHost(harness: TestHarness): void {
  harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: DAY, path: HOST });
}

describe("TasksCodeBlock", () => {
  beforeAll(() => initLocale("en"));

  // An empty listing reads as "you have no tasks", which is a different and wrong statement for
  // a note no journal owns — it must say so instead of quietly rendering nothing to show for it.
  it("says so, rather than an empty listing, when the host note is not a journal note", async () => {
    await mount("Inbox/loose.md" as VaultPath);
    await nextTick();
    expect(screen.getByText(m.code_blocks_tasks_not_connected())).toBeTruthy();
    expect(screen.queryByText(m.tasks_listing_empty())).toBeNull();
  });

  it("says so when the index names a journal no longer in the repository", async () => {
    const harness = await mount();
    harness.resolve(JournalsIndex).register({ journalName: "Gone", anchor: DAY, path: HOST });
    await nextTick();
    expect(screen.getByText(m.code_blocks_tasks_not_connected())).toBeTruthy();
  });

  it("shows the empty message for a connected note with no matching tasks", async () => {
    const harness = await mount();
    seedHost(harness);
    await vi.waitFor(() => expect(screen.getByText(m.tasks_listing_empty())).toBeTruthy());
  });

  it("lists the host note's open tasks", async () => {
    const harness = await mount();
    seedHost(harness);
    harness.resolve(TaskIndex).publish("checkbox", { path: HOST }, [
      buildTaskItem({
        path: HOST,
        key: `${HOST}:3`,
        display: { kind: "line", path: HOST, line: 3, endLine: 3, parentLine: null, markdown: "- [ ] Ship it" },
      }),
    ]);
    await vi.waitFor(() => expect(screen.getByText("- [ ] Ship it")).toBeTruthy());
  });

  // The fence has no key to name another journal, so `depth: rollup` has to reach a shelf-mate's
  // period notes on its own — proving the shelf-scope wiring the component computes itself,
  // not just that `buildTaskListing` can roll up when handed the right journal names.
  it("rolls up a shelf-mate's tasks into the host's period when depth is rollup", async () => {
    const MONTH = "Monthly/2026-09.md" as VaultPath;
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule],
      data: {
        journals: { Daily: daily, Monthly: fixedJournal("Monthly", { type: "month" }) },
        shelves: { work: buildShelf("work", { journals: ["Daily", "Monthly"] }) },
      },
      overrides: [
        overrideWith(MarkdownRenderService, new FakeMarkdownRenderService() as unknown as MarkdownRenderService),
      ],
    });
    harness
      .resolve(JournalsIndex)
      .register({ journalName: "Monthly", anchor: "2026-09-01" as AnchorString, path: MONTH });
    harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: DAY, path: HOST });
    harness.resolve(TaskIndex).publish("checkbox", { path: HOST }, [
      buildTaskItem({
        path: HOST,
        key: `${HOST}:3`,
        display: { kind: "line", path: HOST, line: 3, endLine: 3, parentLine: null, markdown: "- [ ] Ship it" },
      }),
    ]);

    harness.render(TasksCodeBlock, {
      props: { path: MONTH, config: v.parse(tasksBlockSchema, { depth: "rollup" }) },
    });

    await vi.waitFor(() => expect(screen.getByText("- [ ] Ship it")).toBeTruthy());
  });
});
