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
export type LineMarkdown = ReadonlyMap<number, string>;

export interface ExtractInput {
  readonly path: VaultPath;
  readonly structure: NoteStructure;
  readonly vault: CheckboxRule;
  readonly journal: CheckboxJournalRule | null;
  readonly statusMap: Record<string, string>;
  readonly owned: boolean;
  readonly lineDates: LineDates | undefined;
  readonly lineMarkdown?: LineMarkdown;
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

// Only the root of a rolled group is stamped, but its whole subtree was copied: every task nested
// under a stamped root reads as rolled too, done ones included, or listings and open-task dots count
// the open ones a second time beside their copies. The walk follows parent lines, so it stops at a
// non-task parent, whose own parent the structure does not hold.
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
  const { path, structure, vault, journal, statusMap, owned, lineDates, lineMarkdown, rolledMarker, properties } =
    input;
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
        // A listing rebuilds only off the index version, so the text it shows and filters on rides
        // along: an edit that rewords a line, or adds a tag to it, is then a changed item.
        markdown: lineMarkdown?.get(listItem.line) ?? null,
      },
      dates: { ...dates },
      facts: {
        tags: tagsOf(listItem, structure),
        headings: headingsOf(listItem.line, structure),
        ...(dated && properties !== undefined && { properties }),
      },
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

export function lineMarkdownOf(text: string, structure: NoteStructure): LineMarkdown {
  const lines = text.split("\n");
  const found = new Map<number, string>();
  for (const listItem of structure.listItems) {
    // Blank only when the line fell past end-of-file; left out so the item stays unhydrated, as
    // TaskIndex.hydrate leaves it.
    const markdown = lines.slice(listItem.line, listItem.endLine + 1).join("\n");
    if (markdown !== "") found.set(listItem.line, markdown);
  }
  return found;
}

export function lineStampOf(structure: NoteStructure): string {
  return structure.listItems.map((listItem) => listItem.line).join(",");
}
