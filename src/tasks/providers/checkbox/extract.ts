import type { AnchorString } from "@/calendar";
import type { NoteStructure, VaultPath } from "@/infrastructure/host";
import type { TaskDateRole, TaskItem } from "@/tasks";

import { datesIn } from "./dates";
import { identifies } from "./identification";
import { normalizeStatus } from "./normalize";

import type { CheckboxJournalRule, CheckboxRule } from "./rule-schema";

export const CHECKBOX_PROVIDER_ID = "checkbox";

export type LineDates = ReadonlyMap<number, Partial<Record<TaskDateRole, AnchorString>>>;

export interface ExtractInput {
  readonly path: VaultPath;
  readonly structure: NoteStructure;
  readonly vault: CheckboxRule;
  readonly journal: CheckboxJournalRule | null;
  readonly statusMap: Record<string, string>;
  readonly owned: boolean;
  readonly lineDates: LineDates | undefined;
}

export function extractItems(input: ExtractInput): readonly TaskItem[] {
  const { path, structure, vault, journal, statusMap, owned, lineDates } = input;
  const items: TaskItem[] = [];
  for (const listItem of structure.listItems) {
    const dates = lineDates?.get(listItem.line) ?? {};
    const dated = Object.keys(dates).length > 0;
    // An undated line in a note no journal owns is reachable by no relation.
    if (!owned && !dated) continue;
    if (!identifies(listItem, { structure, vault, journal })) continue;
    items.push({
      provider: CHECKBOX_PROVIDER_ID,
      key: `${path}:${listItem.line}`,
      path,
      status: normalizeStatus(listItem.marker, statusMap),
      relations: owned ? (dated ? ["containment", "date"] : ["containment"]) : ["date"],
      capabilities: { movable: true, stampable: true, retargetable: dated },
      display: {
        kind: "line",
        path,
        line: listItem.line,
        endLine: listItem.endLine,
        parentLine: listItem.parent,
        markdown: null,
      },
      dates: { ...dates },
    });
  }
  return items;
}

export function lineDatesOf(text: string, structure: NoteStructure): LineDates {
  const lines = text.split("\n");
  const found = new Map<number, Partial<Record<TaskDateRole, AnchorString>>>();
  for (const listItem of structure.listItems) {
    const dates = datesIn(lines.slice(listItem.line, listItem.endLine + 1).join("\n"));
    if (Object.keys(dates).length > 0) found.set(listItem.line, dates);
  }
  return found;
}

export function lineStampOf(structure: NoteStructure): string {
  return structure.listItems.map((listItem) => listItem.line).join(",");
}
