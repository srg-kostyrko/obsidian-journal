import type { NoteStructure, VaultPath } from "@/infrastructure/host";

import { matchesFilter } from "../filter";
import { headingsOf } from "../note-structure";
import { CHECKBOX_PROVIDER_ID } from "../providers/checkbox/extract";
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

/** Picks a source note's roots and the block they carry into the target. */
export function planSource(source: RollSource, options: PlanOptions): SourcePlan {
  const { path, content, structure } = source;
  const { selection, mode } = options;
  const lines = content.split("\n");
  const named = positiveHeadings(selection);

  const checkboxes = checkboxLines(source.items);
  const rolledLines = new Set(checkboxes.filter(({ item }) => item.status === "rolled").map(({ line }) => line));
  const eligible = checkboxes.filter(
    ({ item, line }) =>
      isOpen(item.status) &&
      matchesFilter(item, structure, selection) &&
      ancestorsOf(lines, line).every((ancestor) => !rolledLines.has(ancestor)),
  );

  const candidates: PlannedRoot[] = [];
  for (const { line } of eligible) {
    const previous = candidates.at(-1);
    if (previous !== undefined && line <= previous.end) continue;
    const end = subtreeEnd(lines, line);
    candidates.push({
      line,
      end,
      firstLine: lines[line] ?? "",
      heading: headingsOf(line, structure).find((heading) => named.includes(heading)) ?? null,
      hasBlockId: lines.slice(line, end + 1).some((text) => TRAILING_BLOCK_ID.test(text)),
    });
  }
  const refusedForBlockId = mode === "move" ? candidates.filter((root) => root.hasBlockId) : [];
  const roots = mode === "move" ? candidates.filter((root) => !root.hasBlockId) : candidates;

  const emit = (text: string): string => (mode === "copy" ? text.replace(TRAILING_BLOCK_ID, "") : text);
  const emitted = new Set<number>();
  const groups = new Map<string | null, string[]>();
  for (const root of roots) {
    const group = groups.get(root.heading) ?? [];
    groups.set(root.heading, group);
    for (const ancestor of ancestorsOf(lines, root.line)) {
      if (emitted.has(ancestor)) continue;
      emitted.add(ancestor);
      group.push(emit(lines[ancestor] ?? ""));
    }
    group.push(...lines.slice(root.line, root.end + 1).map(emit));
  }

  return {
    path,
    roots,
    refusedForBlockId,
    block: [...groups].map(([heading, groupLines]) => ({ heading, lines: groupLines })),
    selectionMissedHeading: named.length > 0 && structure.headings.every((heading) => !named.includes(heading.heading)),
  };
}
