import { test } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer } from "@/testing";

import { TaskIndex } from "./task-index";

import type { TaskDateRole, TaskItem } from "./types";

// The #349 spike's dense 20k-note vault: 7,063 notes with checkboxes, ~32 lines each, ~40% dated —
// about 90k dated items. Only owned notes keep their undated lines.
const CHECKBOX_NOTES = 7063;
const OWNED_NOTES = 2000;
const LINES_PER_NOTE = 32;

function dateFor(seed: number): AnchorString {
  return new Date(Date.UTC(2024, 0, 1) + (seed % 1095) * 86_400_000).toISOString().slice(0, 10) as AnchorString;
}

function itemsOf(n: number, salt = 0): TaskItem[] {
  const owned = n < OWNED_NOTES;
  const path = (owned ? `Daily/${n}.md` : `Projects/${n}.md`) as VaultPath;
  const items: TaskItem[] = [];
  for (let line = 0; line < LINES_PER_NOTE; line++) {
    const dated = (n * 31 + line * 7) % 100 < 40;
    if (!owned && !dated) continue;
    const dates: Partial<Record<TaskDateRole, AnchorString>> = {};
    if (dated) dates.due = dateFor(n * 13 + line + salt);
    if (dated && line % 3 === 0) dates.scheduled = dateFor(n * 7 + line);
    items.push({
      provider: "checkbox",
      key: `${path}:${line}`,
      path,
      status: "todo",
      relations: owned ? (dated ? ["containment", "date"] : ["containment"]) : ["date"],
      capabilities: { movable: true, stampable: true, retargetable: dated },
      display: { kind: "line", path, line, endLine: line, parentLine: null, markdown: null },
      dates,
    });
  }
  return items;
}

const roles: TaskDateRole[] = ["scheduled", "due"];
const june = ["2025-06-01", "2025-06-30"] as [AnchorString, AnchorString];

test("TaskIndex - dense vault", async ({ bench }) => {
  const harness = await testContainer({ overrides: [(c) => c.register(TaskIndex).useClass(TaskIndex)] });
  const index = harness.resolve(TaskIndex);
  index.publish("checkbox", "all", Array.from({ length: CHECKBOX_NOTES }, (_, n) => itemsOf(n)).flat());
  const edited = "Daily/0.md" as VaultPath;
  let salt = 0;

  await bench.compare(
    // Every edit to a note bumps the version, and the next listing or decoration query pays this.
    bench("query after an edit", () => {
      index.publish("checkbox", { path: edited }, itemsOf(0, ++salt));
      index.datedIn(roles, ...june);
    }),
    bench("query with nothing changed", () => {
      index.datedIn(roles, ...june);
    }),
  );
});
