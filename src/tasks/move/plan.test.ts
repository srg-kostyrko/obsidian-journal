import { describe, expect, it } from "vitest";

import type { NoteStructure, VaultPath } from "@/infrastructure/host";

import { extractItems } from "../providers/checkbox/extract";
import { DEFAULT_STATUS_MAP } from "../providers/checkbox/slice";

import { placeGroups } from "./placement";
import { planItem, planSource, type RollSource } from "./plan";

import type { TaskRule } from "../conditions";
import type { CheckboxRule } from "../providers/checkbox/rule-schema";

const path = "Daily/2026-10-20.md" as VaultPath;
const anySelection: TaskRule = { mode: "and", conditions: [] };
const rolledMarker = "#rolled";
const identifyAll: CheckboxRule = { mode: "and", conditions: [] };

// Builds the structure Obsidian would report: checkbox lines only, headings, and inline tags.
function sourceOf(lines: readonly string[], vault: CheckboxRule = identifyAll, marker = rolledMarker): RollSource {
  const structure: NoteStructure = {
    listItems: lines.flatMap((text, line) => {
      const marker = /^(?:>\s?)*\s*[-*+]\s+\[(.)\]/u.exec(text)?.[1];
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
    vault,
    journal: null,
    statusMap: DEFAULT_STATUS_MAP,
    owned: true,
    lineDates: undefined,
    rolledMarker: marker,
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
      rolledMarker,
    });
    expect(plan.roots.map((root) => root.line)).toEqual([1]);
    expect(plan.block).toEqual([{ heading: null, lines: ["- [x] Shopping", "    - [ ] milk"] }]);
  });

  it("a rolled parent the identification rule rejects still blocks its children", () => {
    const tagged: CheckboxRule = { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#task"] }] };
    const source = sourceOf(
      ["- [ ] Project #rolled", "    - [ ] sub #task", "- [ ] Other", "    - [ ] fresh #task"],
      tagged,
    );
    expect(source.items.map((item) => item.key)).toEqual([`${path}:1`, `${path}:3`]);
    expect(
      planSource(source, { selection: anySelection, mode: "copy", rolledMarker }).roots.map((root) => root.line),
    ).toEqual([3]);
  });

  it("a rolled ancestor two levels up blocks the root", () => {
    const tagged: CheckboxRule = { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#task"] }] };
    const lines = [
      "- [ ] Project #Rolled",
      "    - note",
      "        - [ ] deep #task",
      "- [ ] Other",
      "    - note",
      "        - [ ] free #task",
    ];
    const source = sourceOf(lines, tagged);
    expect(
      planSource(source, { selection: anySelection, mode: "copy", rolledMarker }).roots.map((root) => root.line),
    ).toEqual([5]);
  });

  it("an empty marker never reads an ancestor as rolled", () => {
    const source = sourceOf(["- [x] Project #rolled", "    - [ ] sub"], identifyAll, "");
    expect(
      planSource(source, { selection: anySelection, mode: "copy", rolledMarker: "" }).roots.map((root) => root.line),
    ).toEqual([1]);
  });

  it("a quoted parent and its quoted child roll together", () => {
    const plan = planSource(sourceOf(["> - [ ] Parent", ">   - [ ] Child", "> - [x] done", "- [ ] free"]), {
      selection: anySelection,
      mode: "copy",
      rolledMarker,
    });
    expect(plan.roots.map((root) => [root.line, root.end])).toEqual([
      [0, 1],
      [3, 3],
    ]);
    expect(plan.block).toEqual([{ heading: null, lines: ["> - [ ] Parent", ">   - [ ] Child", "- [ ] free"] }]);
  });

  it("a quoted rolled parent blocks its quoted child", () => {
    const plan = planSource(sourceOf(["> - [ ] Parent #rolled", ">   - [ ] Child", "- [ ] free"]), {
      selection: anySelection,
      mode: "copy",
      rolledMarker,
    });
    expect(plan.roots.map((root) => root.line)).toEqual([2]);
  });

  it("an open child under an open root travels with the root and is not a root", () => {
    const plan = planSource(sourceOf(["- [ ] Project", "    - [ ] step", "- [x] done sibling"]), {
      selection: anySelection,
      mode: "copy",
      rolledMarker,
    });
    expect(plan.roots).toEqual([
      {
        line: 0,
        end: 1,
        firstLine: "- [ ] Project",
        lines: ["- [ ] Project", "    - [ ] step"],
        heading: null,
        hasBlockId: false,
      },
    ]);
    expect(plan.block).toEqual([{ heading: null, lines: ["- [ ] Project", "    - [ ] step"] }]);
  });

  it("a line under a rolled ancestor is not eligible", () => {
    const plan = planSource(sourceOf(["- [ ] Project #rolled", "    - [ ] sub", "- [ ] fresh"]), {
      selection: anySelection,
      mode: "copy",
      rolledMarker,
    });
    expect(plan.roots.map((root) => root.line)).toEqual([2]);
  });

  it("a done line and a line outside the selection heading stay", () => {
    const source = sourceOf(["## Tasks", "- [ ] write", "- [x] shipped", "## Habits", "- [ ] stretch"]);
    const plan = planSource(source, { selection: underTasks, mode: "copy", rolledMarker });
    expect(plan.roots.map((root) => root.line)).toEqual([1]);
    expect(plan.roots.at(0)?.heading).toBe("Tasks");
    expect(plan.block).toEqual([{ heading: "Tasks", lines: ["- [ ] write"] }]);
  });

  it("selection names a heading the note lacks", () => {
    const source = sourceOf(["## Habits", "- [ ] stretch #daily", "- [ ] read"]);
    expect(planSource(source, { selection: underTasks, mode: "copy", rolledMarker }).selectionMissedHeading).toBe(true);
    const tagged: TaskRule = { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#daily"] }] };
    const byTag = planSource(source, { selection: tagged, mode: "copy", rolledMarker });
    expect(byTag.selectionMissedHeading).toBe(false);
    expect(byTag.roots.map((root) => root.line)).toEqual([1]);
    const withTasks = sourceOf(["## Tasks", "- [ ] write"]);
    expect(planSource(withTasks, { selection: underTasks, mode: "copy", rolledMarker }).selectionMissedHeading).toBe(
      false,
    );
  });

  it("groups consecutive roots by their selection heading, keeping source order", () => {
    const either: TaskRule = {
      mode: "and",
      conditions: [{ type: "heading", condition: "under", headings: ["Work", "Home"] }],
    };
    const source = sourceOf([
      "## Work",
      "- [ ] a",
      "- [ ] a2",
      "## Home",
      "- [ ] b",
      "## Work",
      "- [ ] c",
      "## Other",
      "- [ ] d",
    ]);
    expect(planSource(source, { selection: either, mode: "copy", rolledMarker }).block).toEqual([
      { heading: "Work", lines: ["- [ ] a", "- [ ] a2"] },
      { heading: "Home", lines: ["- [ ] b"] },
      { heading: "Work", lines: ["- [ ] c"] },
    ]);
  });

  it("sections sharing a fallback destination arrive in source order", () => {
    const either: TaskRule = {
      mode: "and",
      conditions: [{ type: "heading", condition: "under", headings: ["Work", "Home"] }],
    };
    const source = sourceOf(["## Work", "- [ ] a", "## Home", "- [ ] b", "## Work", "- [ ] c", "## Other", "- [ ] d"]);
    const { block } = planSource(source, { selection: either, mode: "copy", rolledMarker });
    expect(placeGroups("## Tasks\n- [ ] t\n\n## End\n", block, "Tasks")).toBe(
      "## Tasks\n- [ ] t\n- [ ] a\n- [ ] b\n- [ ] c\n\n## End\n",
    );
  });

  it("same-section groups land in source order under their own heading", () => {
    const either: TaskRule = {
      mode: "and",
      conditions: [{ type: "heading", condition: "under", headings: ["Work", "Home"] }],
    };
    const source = sourceOf(["## Work", "- [ ] a", "## Home", "- [ ] b", "## Work", "- [ ] c"]);
    const { block } = planSource(source, { selection: either, mode: "copy", rolledMarker });
    expect(placeGroups("## Home\n- [ ] h\n## Work\n- [ ] w\n", block, "")).toBe(
      "## Home\n- [ ] h\n- [ ] b\n## Work\n- [ ] w\n- [ ] a\n- [ ] c\n",
    );
  });

  it("emits a shared context ancestor once", () => {
    const source = sourceOf(["- [x] Shopping", "    - [ ] milk", "    - [x] bread", "    - [ ] eggs"]);
    expect(planSource(source, { selection: anySelection, mode: "copy", rolledMarker }).block).toEqual([
      { heading: null, lines: ["- [x] Shopping", "    - [ ] milk", "    - [ ] eggs"] },
    ]);
  });

  it("copy strips the block id from emitted lines and move keeps it", () => {
    const rootLines = ["- [ ] milk ^m1", "- [x] done"];
    expect(planSource(sourceOf(rootLines), { selection: anySelection, mode: "copy", rolledMarker }).block).toEqual([
      { heading: null, lines: ["- [ ] milk"] },
    ]);
    const lines = ["- [x] Shopping ^list", "    - [ ] milk ^m1", "        - semi-skimmed", "- [x] done ^d"];
    const copy = planSource(sourceOf(lines), { selection: anySelection, mode: "copy", rolledMarker });
    expect(copy.block).toEqual([
      { heading: null, lines: ["- [x] Shopping", "    - [ ] milk", "        - semi-skimmed"] },
    ]);
    expect(copy.roots.at(0)?.hasBlockId).toBe(true);
    const moveLines = ["- [x] Shopping ^list", "    - [ ] milk", "- [x] done ^d"];
    const move = planSource(sourceOf(moveLines), { selection: anySelection, mode: "move", rolledMarker });
    expect(move.block).toEqual([{ heading: null, lines: ["- [x] Shopping", "    - [ ] milk"] }]);
  });

  it("a context ancestor loses its block id in move mode too", () => {
    const plan = planSource(sourceOf(["- [x] Shopping ^list", "    - [ ] milk", "- [x] done ^d"]), {
      selection: anySelection,
      mode: "move",
      rolledMarker,
    });
    expect(plan.block).toEqual([{ heading: null, lines: ["- [x] Shopping", "    - [ ] milk"] }]);
  });

  it("in move mode a root with a block id in its subtree is refused, not planned", () => {
    const source = sourceOf([
      "- [x] Shopping",
      "    - [ ] milk",
      "        - note ^n1",
      "    - [ ] eggs",
      "- [ ] other",
    ]);
    const plan = planSource(source, { selection: anySelection, mode: "move", rolledMarker });
    expect(plan.refusedForBlockId.map((root) => root.line)).toEqual([1]);
    expect(plan.roots.map((root) => root.line)).toEqual([3, 4]);
    expect(plan.block).toEqual([{ heading: null, lines: ["- [x] Shopping", "    - [ ] eggs", "- [ ] other"] }]);
  });

  it("a refused root emits no context of its own", () => {
    const source = sourceOf(["- [x] Shopping", "    - [ ] milk ^m1", "- [ ] other"]);
    const plan = planSource(source, { selection: anySelection, mode: "move", rolledMarker });
    expect(plan.block).toEqual([{ heading: null, lines: ["- [ ] other"] }]);
  });

  it("two runs over the same input give identical plans", () => {
    const source = sourceOf(["## Tasks", "- [x] Shopping", "    - [ ] milk ^m", "## Habits", "- [ ] stretch"]);
    const shuffled: RollSource = { ...source, items: source.items.toReversed() };
    expect(planSource(shuffled, { selection: anySelection, mode: "copy", rolledMarker })).toStrictEqual(
      planSource(source, { selection: anySelection, mode: "copy", rolledMarker }),
    );
  });
});

describe("planItem", () => {
  const copy = { mode: "copy", rolledMarker } as const;
  const move = { mode: "move", rolledMarker } as const;

  it("the cursor on a child moves the child with its parent as context", () => {
    const source = sourceOf(["- [ ] Project", "    - [ ] step", "        - detail", "    - [ ] other step"]);
    expect(planItem(source, 1, move)).toEqual({
      kind: "planned",
      plan: {
        path,
        roots: [
          {
            line: 1,
            end: 2,
            firstLine: "    - [ ] step",
            lines: ["    - [ ] step", "        - detail"],
            heading: null,
            hasBlockId: false,
          },
        ],
        refusedForBlockId: [],
        block: [{ heading: null, lines: ["- [ ] Project", "    - [ ] step", "        - detail"] }],
        selectionMissedHeading: false,
      },
    });
  });

  it("the cursor on a continuation line resolves to its item", () => {
    const source = sourceOf(["## Tasks", "- [ ] write", "  more about it", "", "  and after a gap", "- [ ] next"]);
    for (const line of [2, 3, 4]) {
      const result = planItem(source, line, copy);
      expect(result.kind === "planned" ? result.plan.roots.map((root) => [root.line, root.end]) : result).toEqual([
        [1, 4],
      ]);
    }
  });

  it("a plain bullet line is not a task", () => {
    const source = sourceOf(["## Tasks", "- [ ] write", "    - plain note", "- plain", "text", ""]);
    for (const line of [0, 2, 3, 4, 5, 9]) {
      expect(planItem(source, line, copy)).toEqual({ kind: "refused", reason: "not-a-task" });
    }
  });

  it("a quoted task resolves within its quote", () => {
    const source = sourceOf(["> - [ ] Parent", ">   - [ ] Child", "> plain", "- [ ] free"]);
    const child = planItem(source, 1, copy);
    expect(child.kind === "planned" ? child.plan.block : child).toEqual([
      { heading: null, lines: ["> - [ ] Parent", ">   - [ ] Child"] },
    ]);
    const parent = planItem(source, 0, copy);
    expect(parent.kind === "planned" ? parent.plan.roots.map((root) => [root.line, root.end]) : parent).toEqual([
      [0, 1],
    ]);
    expect(planItem(source, 2, copy)).toEqual({ kind: "refused", reason: "not-a-task" });
  });

  it("a rolled line is refused", () => {
    const source = sourceOf(["- [ ] write #rolled", "- [ ] fresh"]);
    expect(planItem(source, 0, copy)).toEqual({ kind: "refused", reason: "rolled" });
    expect(planItem(source, 1, copy).kind).toBe("planned");
  });

  it("reads the rolled marker off the editor text, not a structure that lags it", () => {
    const parsed = sourceOf(["- [ ] fresh", "- [ ] write"]);
    const typed = { path, content: "- [ ] fresh #rolled\n- [ ] write" };
    expect(planItem({ ...parsed, ...typed }, 0, copy)).toEqual({ kind: "refused", reason: "rolled" });
    expect(planItem({ ...parsed, ...typed }, 1, copy).kind).toBe("planned");
    const stale = sourceOf(["- [ ] fresh #rolled", "- [ ] write"]);
    expect(planItem({ ...stale, content: "- [ ] fresh\n- [ ] write" }, 0, copy).kind).toBe("planned");
  });

  it("a done task is planned", () => {
    const result = planItem(sourceOf(["- [x] shipped", "- [-] dropped"]), 1, move);
    expect(result.kind === "planned" ? result.plan.block : result).toEqual([
      { heading: null, lines: ["- [-] dropped"] },
    ]);
  });

  it("move mode refuses a block id unless allowed", () => {
    const source = sourceOf(["- [ ] Shopping", "    - [ ] milk", "        - note ^n1"]);
    expect(planItem(source, 1, move)).toEqual({ kind: "refused", reason: "block-id" });
    const allowed = planItem(source, 1, { ...move, allowBlockId: true });
    expect(allowed.kind === "planned" ? allowed.plan.block : allowed).toEqual([
      { heading: null, lines: ["- [ ] Shopping", "    - [ ] milk", "        - note ^n1"] },
    ]);
    expect(planItem(source, 0, copy).kind).toBe("planned");
  });

  it("copy strips the id from the emitted root", () => {
    const source = sourceOf(["- [ ] Shopping ^list", "    - [ ] milk ^m1", "        - note ^n1"]);
    const result = planItem(source, 1, copy);
    expect(result.kind === "planned" ? result.plan.block : result).toEqual([
      { heading: null, lines: ["- [ ] Shopping", "    - [ ] milk", "        - note"] },
    ]);
    expect(result.kind === "planned" ? result.plan.roots.at(0)?.hasBlockId : result).toBe(true);
  });
});
