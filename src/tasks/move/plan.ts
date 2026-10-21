import type { NoteStructure, VaultPath } from "@/infrastructure/host";

import { matchesFilter } from "../filter";
import { headingsOf } from "../note-structure";
import { carriesMarker, CHECKBOX_PROVIDER_ID } from "../providers/checkbox/extract";
import { isOpen } from "../status";

import { ancestorsOf, subtreeEnd, TRAILING_BLOCK_ID } from "./subtree";

import type { TaskRule } from "../conditions";
import type { TaskItem } from "../types";

export interface RollSource {
  readonly path: VaultPath;
  readonly content: string;
  readonly structure: NoteStructure;
  readonly items: readonly TaskItem[];
}

export interface PlannedRoot {
  readonly line: number;
  readonly end: number;
  readonly firstLine: string;
  readonly lines: readonly string[];
  readonly heading: string | null;
  readonly hasBlockId: boolean;
}

export interface BlockGroup {
  readonly heading: string | null;
  readonly lines: readonly string[];
}

export interface SourcePlan {
  readonly path: VaultPath;
  readonly roots: readonly PlannedRoot[];
  readonly refusedForBlockId: readonly PlannedRoot[];
  readonly block: readonly BlockGroup[];
  readonly selectionMissedHeading: boolean;
}

export interface PlanOptions {
  readonly selection: TaskRule;
  readonly mode: "copy" | "move";
  readonly rolledMarker: string;
}

function positiveHeadings(selection: TaskRule): readonly string[] {
  return selection.conditions.flatMap((condition) =>
    condition.type === "heading" && condition.condition === "under" ? condition.headings : [],
  );
}

interface LineItem {
  readonly item: TaskItem;
  readonly line: number;
}

function checkboxLines(items: readonly TaskItem[]): readonly LineItem[] {
  return items
    .flatMap((item) =>
      item.provider === CHECKBOX_PROVIDER_ID && item.display.kind === "line" ? [{ item, line: item.display.line }] : [],
    )
    .toSorted((a, b) => a.line - b.line);
}

function stripId(text: string): string {
  return text.replace(TRAILING_BLOCK_ID, "");
}

/** Picks a source note's roots and the block they carry into the target. */
export function planSource(source: RollSource, options: PlanOptions): SourcePlan {
  const { path, content, structure } = source;
  const { selection, mode, rolledMarker } = options;
  const lines = content.split("\n");
  const named = positiveHeadings(selection);

  const checkboxes = checkboxLines(source.items);
  const rolledLines = new Set(checkboxes.filter(({ item }) => item.status === "rolled").map(({ line }) => line));
  // Read off the text as well as the items: identification drops lines it rejects, and a stamped
  // parent it drops must still keep its children from rolling a second time.
  const isRolled = (line: number): boolean => rolledLines.has(line) || carriesMarker({ line }, structure, rolledMarker);
  const eligible = checkboxes.filter(
    ({ item, line }) =>
      isOpen(item.status) &&
      matchesFilter(item, structure, selection) &&
      ancestorsOf(lines, line).every((ancestor) => !isRolled(ancestor)),
  );

  const candidates: PlannedRoot[] = [];
  for (const { line } of eligible) {
    const previous = candidates.at(-1);
    if (previous !== undefined && line <= previous.end) continue;
    const end = subtreeEnd(lines, line);
    const planned = lines.slice(line, end + 1);
    candidates.push({
      line,
      end,
      firstLine: lines[line] ?? "",
      lines: planned,
      heading: headingsOf(line, structure).find((heading) => named.includes(heading)) ?? null,
      hasBlockId: planned.some((text) => TRAILING_BLOCK_ID.test(text)),
    });
  }
  const refusedForBlockId = mode === "move" ? candidates.filter((root) => root.hasBlockId) : [];
  const roots = mode === "move" ? candidates.filter((root) => !root.hasBlockId) : candidates;

  // A context line stays in the source, so its target line is always a copy and must not claim the anchor.
  const emitRoot = (text: string): string => (mode === "copy" ? stripId(text) : text);
  const emitted = new Set<number>();
  const groups = new Map<string | null, string[]>();
  for (const root of roots) {
    const group = groups.get(root.heading) ?? [];
    groups.set(root.heading, group);
    for (const ancestor of ancestorsOf(lines, root.line)) {
      if (emitted.has(ancestor)) continue;
      emitted.add(ancestor);
      group.push(stripId(lines[ancestor] ?? ""));
    }
    group.push(...root.lines.map(emitRoot));
  }

  return {
    path,
    roots,
    refusedForBlockId,
    block: [...groups].map(([heading, groupLines]) => ({ heading, lines: groupLines })),
    selectionMissedHeading: named.length > 0 && structure.headings.every((heading) => !named.includes(heading.heading)),
  };
}
