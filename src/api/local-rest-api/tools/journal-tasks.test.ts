import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { shelvesCoreModule } from "@/shelves/module";
import { tasksCoreModule } from "@/tasks/module";
import { TaskProviderRegistry } from "@/tasks/provider-registry";
import { TaskIndex } from "@/tasks/task-index";
import { buildTaskItem } from "@/tasks/testing";
import { testContainer } from "@/testing";

import { apiModule } from "../../module";

import { JournalTasksTool } from "./journal-tasks";

const NOTE = "2026-09-22.md" as VaultPath;

async function build() {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, apiModule],
    data: { journals: { work: fixedJournal("work", { type: "day" }) }, shelves: {} },
    initialize: [VaultSubscriptionService, TaskProviderRegistry],
  });
  harness.resolve(JournalsIndex).register({ journalName: "work", anchor: "2026-09-22" as AnchorString, path: NOTE });
  harness.resolve(TaskIndex).publish("checkbox", { path: NOTE }, [
    buildTaskItem({
      path: NOTE,
      key: `${NOTE}:1`,
      display: { kind: "line", path: NOTE, line: 1, endLine: 1, parentLine: null, markdown: "- [ ] open one" },
    }),
    buildTaskItem({
      path: NOTE,
      key: `${NOTE}:2`,
      status: "done",
      display: { kind: "line", path: NOTE, line: 2, endLine: 2, parentLine: null, markdown: "- [x] done one" },
    }),
  ]);
  return { tool: harness.resolve(JournalTasksTool) };
}

describe("JournalTasksTool", () => {
  it("lists the period's open tasks by default", async () => {
    const { tool } = await build();

    const result = await tool.call({ journal: "work", date: "2026-09-22" });

    expect(result).toMatchObject({ tasks: [{ line: 1, text: "- [ ] open one", status: "todo" }] });
  });

  it("narrows by status when asked", async () => {
    const { tool } = await build();

    const result = (await tool.call({ journal: "work", date: "2026-09-22", status: "done" })) as {
      tasks: { line: number }[];
    };

    expect(result.tasks.map((task) => task.line)).toEqual([2]);
  });

  it("rejects an unknown journal with journal-not-found", async () => {
    const { tool } = await build();

    await expect(tool.call({ journal: "nope", date: "2026-09-22" })).rejects.toMatchObject({
      code: "journal-not-found",
    });
  });
});
