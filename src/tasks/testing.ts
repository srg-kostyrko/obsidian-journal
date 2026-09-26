import type { VaultPath } from "@/infrastructure/host";

import type { TaskItem } from "./types";

export function buildTaskItem(overrides: Partial<TaskItem> = {}): TaskItem {
  const path = (overrides.path ?? "Daily/2026-09-22.md") as VaultPath;
  return {
    provider: "checkbox",
    key: `${path}:0`,
    path,
    status: "todo",
    relations: ["containment"],
    capabilities: { movable: true, stampable: true, retargetable: false },
    display: { kind: "line", path, line: 0, endLine: 0, parentLine: null, markdown: null },
    dates: {},
    ...overrides,
  };
}
