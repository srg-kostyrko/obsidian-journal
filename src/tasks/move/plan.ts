import type { NoteStructure, VaultPath } from "@/infrastructure/host";

import { matchesFilter } from "../filter";
import { headingsOf } from "../note-structure";
import { carriesMarker, CHECKBOX_PROVIDER_ID } from "../providers/checkbox/extract";
import { isOpen } from "../status";

import { lineHasTag } from "./line-tags";
import { ancestorsOf, isCheckboxLine, isListLine, subtreeEnd, TRAILING_BLOCK_ID } from "./subtree";

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

function plannedRoot(lines: readonly string[], line: number, heading: string | null): PlannedRoot {
  const end = subtreeEnd(lines, line);
  const planned = lines.slice(line, end + 1);
  return {
    line,
    end,
    firstLine: lines[line] ?? "",
    lines: planned,
    heading,
    hasBlockId: planned.some((text) => TRAILING_BLOCK_ID.test(text)),
  };
}

function blockOf(lines: readonly string[], roots: readonly PlannedRoot[], mode: "copy" | "move"): BlockGroup[] {
  // A context line stays in the source, so its target line is always a copy and must not claim the anchor.
  const emitRoot = (text: string): string => (mode === "copy" ? stripId(text) : text);
  const emitted = new Set<number>();
  // Only neighbors merge: sections that fall back to one destination must still arrive in source order.
  const groups: { heading: string | null; lines: string[] }[] = [];
  for (const root of roots) {
    const last = groups.at(-1);
    const group = last?.heading === root.heading ? last : { heading: root.heading, lines: [] };
    if (group !== last) groups.push(group);
    for (const ancestor of ancestorsOf(lines, root.line)) {
      if (emitted.has(ancestor)) continue;
      emitted.add(ancestor);
      group.lines.push(stripId(lines[ancestor] ?? ""));
    }
    group.lines.push(...root.lines.map(emitRoot));
  }
  return groups;
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
    candidates.push(
      plannedRoot(lines, line, headingsOf(line, structure).find((heading) => named.includes(heading)) ?? null),
    );
  }
  const refusedForBlockId = mode === "move" ? candidates.filter((root) => root.hasBlockId) : [];
  const roots = mode === "move" ? candidates.filter((root) => !root.hasBlockId) : candidates;

  return {
    path,
    roots,
    refusedForBlockId,
    block: blockOf(lines, roots, mode),
    selectionMissedHeading: named.length > 0 && structure.headings.every((heading) => !named.includes(heading.heading)),
  };
}

export type ItemPlan =
  | { readonly kind: "planned"; readonly plan: SourcePlan }
  | { readonly kind: "refused"; readonly reason: "not-a-task" | "rolled" | "block-id" };

export interface ItemPlanOptions {
  readonly mode: "copy" | "move";
  readonly rolledMarker: string;
  readonly allowBlockId?: boolean;
}

function containingListLine(lines: readonly string[], line: number): number | null {
  for (let index = Math.min(line, lines.length - 1); index >= 0; index--) {
    if (isListLine(lines[index] ?? "") && subtreeEnd(lines, index) >= line) return index;
  }
  return null;
}

// Text only: the source is the editor's buffer, which runs ahead of metadataCache, so a structure
// read by line number would judge whatever line used to sit there.
/** Plans moving the one checkbox item whose subtree holds `line`, whatever its status. */
export function planItem(
  source: Pick<RollSource, "path" | "content">,
  line: number,
  options: ItemPlanOptions,
): ItemPlan {
  const { path, content } = source;
  const { mode, rolledMarker, allowBlockId = false } = options;
  const lines = content.split("\n");
  const itemLine = containingListLine(lines, line);
  if (itemLine === null || !isCheckboxLine(lines[itemLine] ?? "")) return { kind: "refused", reason: "not-a-task" };
  // The roll stamps only a root, so a line under a stamped ancestor has already gone with it.
  const rolled = [...ancestorsOf(lines, itemLine), itemLine].some((index) =>
    lineHasTag(lines[index] ?? "", rolledMarker),
  );
  if (rolled) return { kind: "refused", reason: "rolled" };
  const root = plannedRoot(lines, itemLine, null);
  if (mode === "move" && root.hasBlockId && !allowBlockId) return { kind: "refused", reason: "block-id" };
  return {
    kind: "planned",
    plan: {
      path,
      roots: [root],
      refusedForBlockId: [],
      block: blockOf(lines, [root], mode),
      selectionMissedHeading: false,
    },
  };
}
