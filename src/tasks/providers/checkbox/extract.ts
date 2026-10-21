import type { AnchorString } from "@/calendar";
import type { NoteStructure, StructureListItem, VaultPath } from "@/infrastructure/host";
import type { TaskDateRole, TaskItem } from "@/tasks";

import { headingsOf, tagsOf } from "../../note-structure";

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
  readonly rolledMarker: string;
  // The containing note's properties some journal's dated rule names; undefined when none does.
  readonly properties?: Readonly<Record<string, unknown>>;
}

// Only a tag on the item's own first line counts: a child's tag or a frontmatter tag is not the item's stamp.
export function carriesMarker(
  listItem: Pick<StructureListItem, "line">,
  structure: NoteStructure,
  marker: string,
): boolean {
  if (marker === "") return false;
  const wanted = marker.toLowerCase();
  return structure.tags.some((tag) => tag.line === listItem.line && tag.tag.toLowerCase() === wanted);
}

// Only the root of a rolled group is stamped, but the whole group was taken: its open children read
// as rolled too, or listings and open-task dots count them after the copy. The walk follows parent
// lines, so it stops at a non-task parent, whose own parent the structure does not hold.
function underRolledAncestor(
  listItem: StructureListItem,
  structure: NoteStructure,
  marker: string,
  byLine: ReadonlyMap<number, StructureListItem>,
): boolean {
  let parent = listItem.parent;
  let below = listItem.line;
  while (parent !== null && parent < below) {
    if (carriesMarker({ line: parent }, structure, marker)) return true;
    below = parent;
    parent = byLine.get(parent)?.parent ?? null;
  }
  return false;
}

export function extractItems(input: ExtractInput): readonly TaskItem[] {
  const { path, structure, vault, journal, statusMap, owned, lineDates, rolledMarker, properties } = input;
  const byLine = new Map(structure.listItems.map((listItem) => [listItem.line, listItem]));
  const rolled = (listItem: StructureListItem): boolean =>
    carriesMarker(listItem, structure, rolledMarker) || underRolledAncestor(listItem, structure, rolledMarker, byLine);
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
      status: rolled(listItem) ? "rolled" : normalizeStatus(listItem.marker, statusMap),
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
      // Only a dated line is read by journals other than the note's own: by a dated rule, and by the
      // owning journal's heading condition on whichever surface asks. Headings ride along so a
      // heading edit above an unchanged line is a changed item there too.
      ...(dated && {
        facts: {
          tags: tagsOf(listItem, structure),
          headings: headingsOf(listItem.line, structure),
          ...(properties !== undefined && { properties }),
        },
      }),
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
