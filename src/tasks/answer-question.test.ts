import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { NoteStructure, VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import type { NoteletEntry } from "@/journals";
import { fixedJournal } from "@/journals/testing";

import { answerTaskQuestion, type TaskQuestionDependencies } from "./answer-question";
import { buildTaskItem } from "./testing";

import type { TaskCondition, TaskRule } from "./conditions";
import type { TaskQuestion } from "./question";
import type { TaskItem, TaskStatus } from "./types";

const DAY = "Daily/2026-09-22.md" as VaultPath;
const NOTELET = "Daily/2026-09-22 Standup.md" as VaultPath;
const ANCHOR = "2026-09-22" as AnchorString;

function task(path: VaultPath, lineNumber: number, status: TaskStatus): TaskItem {
  return buildTaskItem({
    path,
    key: `${path}:${lineNumber}`,
    status,
    display: { kind: "line", path, line: lineNumber, endLine: lineNumber, parentLine: null, markdown: null },
  });
}

function structureWith(
  headings: readonly { line: number; heading: string }[],
  listItems: readonly { line: number; tags: readonly string[] }[] = [],
): NoteStructure {
  return {
    listItems: listItems.map(({ line }) => ({ marker: "-", line, endLine: line, parent: null })),
    tags: listItems.flatMap(({ line, tags }) => tags.map((tag) => ({ tag, line }))),
    headings: headings.map((entry) => ({ ...entry, level: 2 })),
    frontmatterTags: [],
  };
}

function build(options: {
  items?: Partial<Record<VaultPath, readonly TaskItem[]>>;
  notelets?: readonly VaultPath[];
  journalFilter?: readonly TaskCondition[];
  structures?: Partial<Record<VaultPath, NoteStructure>>;
}): TaskQuestionDependencies {
  const { items = {}, notelets = [], journalFilter, structures = {} } = options;
  return {
    journals: {
      get: (name) => {
        const base = fixedJournal(name, { type: "day" });
        const filter: TaskRule | undefined = journalFilter && { mode: "and", conditions: [...journalFilter] };
        return Option.some(filter ? { ...base, tasks: { ...base.tasks, filter } } : base);
      },
    },
    index: {
      noteletsAt: (name, anchor) =>
        notelets.map((path): NoteletEntry => ({
          kind: "notelet",
          journalName: name,
          anchor,
          path,
          typeName: "Meeting",
          typeId: null,
        })),
    },
    structure: { get: (path) => Option.fromNullable(structures[path]) },
    tasks: { itemsIn: (path) => items[path] ?? [] },
  };
}

const BASE_QUESTION: TaskQuestion = {
  quantifier: "any",
  status: "listing",
  source: "both",
  filter: { mode: "and", conditions: [] },
};

function ask(
  dependencies: TaskQuestionDependencies,
  question: Partial<TaskQuestion>,
  path: VaultPath | null = DAY,
): boolean {
  return answerTaskQuestion(
    dependencies,
    { journalName: "Daily", anchor: ANCHOR, path },
    { ...BASE_QUESTION, ...question },
  );
}

const withTags = (tags: string[]): NoteStructure =>
  structureWith([{ line: 0, heading: "## Log" }], [{ line: 1, tags }]);

const only = (item: TaskStatus, journalFilter?: TaskCondition[]) =>
  build({ journalFilter, items: { [DAY]: [task(DAY, 1, item)] } });

const status = (condition: "is" | "is-not", statuses: string[]): TaskCondition => ({
  type: "status",
  condition,
  statuses,
});
const heading = (...headings: string[]): TaskCondition => ({ type: "heading", condition: "under", headings });
const tag = (...tags: string[]): TaskCondition => ({ type: "tag", condition: "has", tags });

describe("answerTaskQuestion", () => {
  describe("any", () => {
    it("is true when an open item sits beside a done one and false with only the done one", () => {
      expect(ask(build({ items: { [DAY]: [task(DAY, 1, "todo"), task(DAY, 2, "done")] } }), {})).toBe(true);
      expect(ask(build({ items: { [DAY]: [task(DAY, 2, "done")] } }), {})).toBe(false);
    });
  });

  describe("all", () => {
    const question: Partial<TaskQuestion> = { quantifier: "all", status: "done" };

    it("is false for a note with no items", () => {
      expect(ask(build({ items: { [DAY]: [] } }), question)).toBe(false);
    });

    it("is true when every counted item is done or cancelled", () => {
      expect(ask(build({ items: { [DAY]: [task(DAY, 1, "done"), task(DAY, 2, "cancelled")] } }), question)).toBe(true);
    });

    it("is false while an item is still open", () => {
      expect(ask(build({ items: { [DAY]: [task(DAY, 1, "done"), task(DAY, 2, "todo")] } }), question)).toBe(false);
    });

    it("never counts a non-task item", () => {
      expect(ask(build({ items: { [DAY]: [task(DAY, 1, "done"), task(DAY, 2, "non-task")] } }), question)).toBe(true);
    });
  });

  describe("none", () => {
    const question: Partial<TaskQuestion> = { quantifier: "none", status: "open" };

    it("is false for a day with neither a note nor a notelet", () => {
      expect(ask(build({}), question, null)).toBe(false);
    });

    it("is true for a note with no items", () => {
      expect(ask(build({ items: { [DAY]: [] } }), question)).toBe(true);
    });

    it("is false for a note holding an open item", () => {
      expect(ask(build({ items: { [DAY]: [task(DAY, 1, "todo")] } }), question)).toBe(false);
    });

    it("counts a notelet as a source when the source includes notelets", () => {
      const dependencies = build({ notelets: [NOTELET], items: { [NOTELET]: [] } });
      expect(ask(dependencies, { ...question, source: "both" }, null)).toBe(true);
      expect(ask(dependencies, { ...question, source: "note" }, null)).toBe(false);
    });
  });

  describe("source", () => {
    const dependencies = build({
      notelets: [NOTELET],
      items: { [DAY]: [task(DAY, 1, "done")], [NOTELET]: [task(NOTELET, 1, "todo")] },
    });

    it("reaches an open item that lives only in a notelet", () => {
      expect(ask(dependencies, { status: "open", source: "both" })).toBe(true);
      expect(ask(dependencies, { status: "open", source: "note" })).toBe(false);
      expect(ask(dependencies, { status: "open", source: "notelets" })).toBe(true);
    });
  });

  describe("filtering", () => {
    const structure = structureWith([
      { line: 0, heading: "## Tasks" },
      { line: 10, heading: "## Habits" },
    ]);

    it("counts only items the journal filter admits, so a ticked-off section reads as all done", () => {
      const dependencies = build({
        journalFilter: [heading("## Tasks")],
        structures: { [DAY]: structure },
        items: { [DAY]: [task(DAY, 2, "done"), task(DAY, 3, "done"), task(DAY, 12, "todo")] },
      });
      expect(ask(dependencies, { quantifier: "all", status: "done" })).toBe(true);
      expect(ask(dependencies, { quantifier: "any", status: "listing" })).toBe(false);
    });

    it("lets the question replace the journal's condition of the same type and keep the others", () => {
      const base = {
        journalFilter: [heading("## Tasks"), tag("#work")],
      };
      const question = { status: "open" as const, filter: { mode: "and" as const, conditions: [heading("## Log")] } };
      const tagged = buildTaskItem({
        path: DAY,
        key: "tagged",
        status: "todo",
        display: { kind: "line", path: DAY, line: 1, endLine: 1, parentLine: null, markdown: null },
      });
      expect(
        ask(build({ ...base, structures: { [DAY]: withTags(["#work"]) }, items: { [DAY]: [tagged] } }), question),
      ).toBe(true);
      expect(ask(build({ ...base, structures: { [DAY]: withTags([]) }, items: { [DAY]: [tagged] } }), question)).toBe(
        false,
      );
    });

    it("keeps an item when the structure has not resolved, instead of dropping the heading condition's verdict to false", () => {
      const dependencies = build({ journalFilter: [heading("## Tasks")], items: { [DAY]: [task(DAY, 1, "todo")] } });
      expect(ask(dependencies, { status: "open" })).toBe(true);
    });
  });

  describe("status as in the listing", () => {
    it("follows the journal's stored status condition", () => {
      const filter = [status("is", ["in-progress"])];
      expect(ask(only("todo", filter), {})).toBe(false);
      expect(ask(only("in-progress", filter), {})).toBe(true);
    });

    it("reads an is-not condition", () => {
      expect(ask(only("rolled", [status("is-not", ["done"])]), {})).toBe(true);
    });

    it("reads an empty is condition as every status", () => {
      expect(ask(only("done", [status("is", [])]), {})).toBe(true);
    });

    it("defaults to open when the journal names no status", () => {
      expect(ask(only("done"), {})).toBe(false);
    });

    it("lets an explicit status replace the journal's", () => {
      expect(ask(only("todo", [status("is", ["done"])]), { status: "open" })).toBe(true);
    });
  });
});
