import { describe, expect, it } from "vitest";

import type { NoteStructure, VaultPath } from "@/infrastructure/host";

import { extractItems } from "../providers/checkbox/extract";
import { DEFAULT_STATUS_MAP } from "../providers/checkbox/slice";

import { planSource, type RollSource } from "./plan";

import type { TaskRule } from "../conditions";

const path = "Daily/2026-10-20.md" as VaultPath;
const anySelection: TaskRule = { mode: "and", conditions: [] };

// Builds the structure Obsidian would report: checkbox lines only, headings, and inline tags.
function sourceOf(lines: readonly string[]): RollSource {
  const structure: NoteStructure = {
    listItems: lines.flatMap((text, line) => {
      const marker = /^\s*[-*+]\s+\[(.)\]/u.exec(text)?.[1];
      return marker === undefined ? [] : [{ marker, line, endLine: line, parent: null }];
    }),
    headings: lines.flatMap((text, line) => {
      const heading = /^(#{1,6})\s+(.*)$/u.exec(text);
      return heading === null ? [] : [{ heading: heading[2] ?? "", level: heading[1]?.length ?? 1, line }];
    }),
    tags: lines.flatMap((text, line) =>
      /^#{1,6}\s/u.test(text)
        ? []
        : [...text.matchAll(/(?:^|\s)(#[\w-]+)/gu)].map((tag) => ({ tag: tag[1] ?? "", line })),
    ),
    frontmatterTags: [],
  };
  const items = extractItems({
    path,
    structure,
    vault: { mode: "and", conditions: [] },
    journal: null,
    statusMap: DEFAULT_STATUS_MAP,
    owned: true,
    lineDates: undefined,
    rolledMarker: "#rolled",
  });
  return { path, content: lines.join("\n"), structure, items };
}

const underTasks: TaskRule = {
  mode: "and",
  conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }],
};

describe("planSource", () => {
  it("the Shopping example carries Shopping as context and leaves bread", () => {
    const plan = planSource(sourceOf(["- [x] Shopping", "    - [ ] milk", "    - [x] bread"]), {
      selection: anySelection,
      mode: "copy",
    });
    expect(plan.roots.map((root) => root.line)).toEqual([1]);
    expect(plan.block).toEqual([{ heading: null, lines: ["- [x] Shopping", "    - [ ] milk"] }]);
  });

  it("an open child under an open root travels with the root and is not a root", () => {
    const plan = planSource(sourceOf(["- [ ] Project", "    - [ ] step", "- [x] done sibling"]), {
      selection: anySelection,
      mode: "copy",
    });
    expect(plan.roots).toEqual([{ line: 0, end: 1, firstLine: "- [ ] Project", heading: null, hasBlockId: false }]);
    expect(plan.block).toEqual([{ heading: null, lines: ["- [ ] Project", "    - [ ] step"] }]);
  });

  it("a line under a rolled ancestor is not eligible", () => {
    const plan = planSource(sourceOf(["- [ ] Project #rolled", "    - [ ] sub", "- [ ] fresh"]), {
      selection: anySelection,
      mode: "copy",
    });
    expect(plan.roots.map((root) => root.line)).toEqual([2]);
  });

  it("a done line and a line outside the selection heading stay", () => {
    const source = sourceOf(["## Tasks", "- [ ] write", "- [x] shipped", "## Habits", "- [ ] stretch"]);
    const plan = planSource(source, { selection: underTasks, mode: "copy" });
    expect(plan.roots.map((root) => root.line)).toEqual([1]);
    expect(plan.roots.at(0)?.heading).toBe("Tasks");
    expect(plan.block).toEqual([{ heading: "Tasks", lines: ["- [ ] write"] }]);
  });

  it("selection names a heading the note lacks", () => {
    const source = sourceOf(["## Habits", "- [ ] stretch #daily", "- [ ] read"]);
    expect(planSource(source, { selection: underTasks, mode: "copy" }).selectionMissedHeading).toBe(true);
    const tagged: TaskRule = { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#daily"] }] };
    const byTag = planSource(source, { selection: tagged, mode: "copy" });
    expect(byTag.selectionMissedHeading).toBe(false);
    expect(byTag.roots.map((root) => root.line)).toEqual([1]);
    const withTasks = sourceOf(["## Tasks", "- [ ] write"]);
    expect(planSource(withTasks, { selection: underTasks, mode: "copy" }).selectionMissedHeading).toBe(false);
  });

  it("groups roots by their selection heading in source order", () => {
    const either: TaskRule = {
      mode: "and",
      conditions: [{ type: "heading", condition: "under", headings: ["Work", "Home"] }],
    };
    const source = sourceOf(["## Work", "- [ ] a", "## Home", "- [ ] b", "## Work", "- [ ] c", "## Other", "- [ ] d"]);
    expect(planSource(source, { selection: either, mode: "copy" }).block).toEqual([
      { heading: "Work", lines: ["- [ ] a", "- [ ] c"] },
      { heading: "Home", lines: ["- [ ] b"] },
    ]);
  });

  it("emits a shared context ancestor once", () => {
    const source = sourceOf(["- [x] Shopping", "    - [ ] milk", "    - [x] bread", "    - [ ] eggs"]);
    expect(planSource(source, { selection: anySelection, mode: "copy" }).block).toEqual([
      { heading: null, lines: ["- [x] Shopping", "    - [ ] milk", "    - [ ] eggs"] },
    ]);
  });

  it("copy strips the block id from emitted lines and move keeps it", () => {
    const lines = ["- [x] Shopping ^list", "    - [ ] milk ^m1", "        - semi-skimmed", "- [x] done ^d"];
    const copy = planSource(sourceOf(lines), { selection: anySelection, mode: "copy" });
    expect(copy.block).toEqual([
      { heading: null, lines: ["- [x] Shopping", "    - [ ] milk", "        - semi-skimmed"] },
    ]);
    expect(copy.roots.at(0)?.hasBlockId).toBe(true);
    const moveLines = ["- [x] Shopping ^list", "    - [ ] milk", "- [x] done ^d"];
    const move = planSource(sourceOf(moveLines), { selection: anySelection, mode: "move" });
    expect(move.block).toEqual([{ heading: null, lines: ["- [x] Shopping ^list", "    - [ ] milk"] }]);
  });

  it("in move mode a root with a block id in its subtree is refused, not planned", () => {
    const source = sourceOf([
      "- [x] Shopping",
      "    - [ ] milk",
      "        - note ^n1",
      "    - [ ] eggs",
      "- [ ] other",
    ]);
    const plan = planSource(source, { selection: anySelection, mode: "move" });
    expect(plan.refusedForBlockId.map((root) => root.line)).toEqual([1]);
    expect(plan.roots.map((root) => root.line)).toEqual([3, 4]);
    expect(plan.block).toEqual([{ heading: null, lines: ["- [x] Shopping", "    - [ ] eggs", "- [ ] other"] }]);
  });

  it("a refused root emits no context of its own", () => {
    const source = sourceOf(["- [x] Shopping", "    - [ ] milk ^m1", "- [ ] other"]);
    const plan = planSource(source, { selection: anySelection, mode: "move" });
    expect(plan.block).toEqual([{ heading: null, lines: ["- [ ] other"] }]);
  });

  it("two runs over the same input give identical plans", () => {
    const source = sourceOf(["## Tasks", "- [x] Shopping", "    - [ ] milk ^m", "## Habits", "- [ ] stretch"]);
    const shuffled: RollSource = { ...source, items: source.items.toReversed() };
    expect(planSource(shuffled, { selection: anySelection, mode: "copy" })).toStrictEqual(
      planSource(source, { selection: anySelection, mode: "copy" }),
    );
  });
});
