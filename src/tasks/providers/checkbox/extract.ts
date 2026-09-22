import type { NoteStructure, VaultPath } from "@/infrastructure/host";
import type { TaskItem } from "@/tasks";

import { identifies } from "./identification";
import { normalizeStatus } from "./normalize";

import type { CheckboxJournalRule, CheckboxRule } from "./rule-schema";

export const CHECKBOX_PROVIDER_ID = "checkbox";

export interface ExtractInput {
  readonly path: VaultPath;
  readonly structure: NoteStructure;
  readonly vault: CheckboxRule;
  readonly journal: CheckboxJournalRule | null;
  readonly statusMap: Record<string, string>;
}

export function extractItems(input: ExtractInput): readonly TaskItem[] {
  const { path, structure, vault, journal, statusMap } = input;
  const items: TaskItem[] = [];
  for (const listItem of structure.listItems) {
    if (!identifies(listItem, { structure, vault, journal })) continue;
    items.push({
      provider: CHECKBOX_PROVIDER_ID,
      key: `${path}:${listItem.line}`,
      path,
      status: normalizeStatus(listItem.marker, statusMap),
      relations: ["containment"],
      // retargetable means "the line already carries a date signifier", which needs text —
      // hydration recomputes it.
      capabilities: { movable: true, stampable: true, retargetable: false },
      display: { kind: "line", path, line: listItem.line, endLine: listItem.endLine, markdown: null },
      dates: {},
    });
  }
  return items;
}
