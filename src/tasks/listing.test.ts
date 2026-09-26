import { describe, expect, it } from "vitest";

import { CalendarDate, type AnchorString } from "@/calendar";
import type { NoteStructure, VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import type { NoteletEntry } from "@/journals";
import { fixedJournal } from "@/journals/testing";

import { buildTaskListing, type TaskListingDependencies, type TaskListingPeriodRequest } from "./listing";
import { DEFAULT_TASK_QUERY } from "./query";
import { buildTaskItem } from "./testing";

import type { TaskRule } from "./conditions";
import type { TaskQuery } from "./query";
import type { TaskItem } from "./types";

const DAY = "Daily/2026-09-22.md" as VaultPath;
const OTHER_DAY = "Daily/2026-09-23.md" as VaultPath;
const MONTH = "Monthly/2026-09.md" as VaultPath;
const NOTELET = "Daily/2026-09-22 Standup.md" as VaultPath;
const WEEK = "Weekly/2026-W36.md" as VaultPath;
const SPRINT = "Sprints/2026-08-25.md" as VaultPath;
const LATER_SPRINT = "Sprints/2026-09-05.md" as VaultPath;
const CLOSED_SPRINT_NOTELET = "Sprints/2026-08-29 Retro.md" as VaultPath;
const LATER_SPRINT_NOTELET = "Sprints/2026-09-05 Retro.md" as VaultPath;

const EMPTY_STRUCTURE: NoteStructure = { listItems: [], tags: [], headings: [], frontmatterTags: [] };

function line(path: VaultPath, lineNumber: number, overrides: Partial<TaskItem> = {}): TaskItem {
  return buildTaskItem({
    path,
    key: `${path}:${lineNumber}`,
    display: { kind: "line", path, line: lineNumber, endLine: lineNumber, parentLine: null, markdown: null },
    ...overrides,
  });
}

function child(path: VaultPath, lineNumber: number, parentLine: number, overrides: Partial<TaskItem> = {}): TaskItem {
  return buildTaskItem({
    path,
    key: `${path}:${lineNumber}`,
    display: { kind: "line", path, line: lineNumber, endLine: lineNumber, parentLine, markdown: null },
    ...overrides,
  });
}

// Keyed by plain string, not AnchorString: a branded key type rejects the anchor literals these
// fixtures are readable with.
type AnchorMap = Partial<Record<string, Record<string, VaultPath>>>;
type EndMap = Partial<Record<string, Record<string, string>>>;
type NoteletMap = Partial<Record<string, Record<string, readonly VaultPath[]>>>;

function noteletEntry(journalName: string, anchor: AnchorString, path: VaultPath): NoteletEntry {
  return { kind: "notelet", journalName, anchor, path, typeName: "Meeting", typeId: null };
}

function buildDependencies(options: {
  items?: Partial<Record<VaultPath, readonly TaskItem[]>>;
  structures?: Partial<Record<VaultPath, NoteStructure>>;
  notes?: AnchorMap;
  ends?: EndMap;
  notelets?: NoteletMap;
  journalFilters?: Partial<Record<string, TaskRule>>;
  // Journals the repository does not know, and journals whose cycle cannot place a date.
  unknownJournals?: readonly string[];
  journalsWithoutCycle?: readonly string[];
}): TaskListingDependencies {
  const {
    items = {},
    structures = {},
    notes = {},
    ends = {},
    notelets = {},
    journalFilters = {},
    unknownJournals = [],
    journalsWithoutCycle = [],
  } = options;
  const endAnchorOf = (name: string, anchor: AnchorString): AnchorString =>
    (ends[name]?.[anchor] ?? anchor) as AnchorString;
  return {
    journals: {
      get: (name) => {
        if (unknownJournals.includes(name)) return Option.none();
        const base = fixedJournal(name, { type: name === "Monthly" ? "month" : "day" });
        const filter = journalFilters[name];
        return Option.some(filter ? { ...base, tasks: { ...base.tasks, filter } } : base);
      },
    },
    index: {
      get: (name, anchor) => Option.fromNullable(notes[name]?.[anchor]),
      getRange: (name, start, end) => {
        const found = new Map<AnchorString, VaultPath>();
        const known = Object.entries(notes[name] ?? {});
        for (const [anchor, path] of known) {
          if (anchor >= start && anchor <= end) found.set(anchor as AnchorString, path);
        }
        return found;
      },
      noteletsAt: (name, anchor) => (notelets[name]?.[anchor] ?? []).map((path) => noteletEntry(name, anchor, path)),
      noteletsFor: (name) =>
        Object.entries(notelets[name] ?? {}).flatMap(([anchor, paths]) =>
          paths.map((path) => noteletEntry(name, anchor as AnchorString, path)),
        ),
    },
    cycle: {
      startOf: (name, anchor) =>
        journalsWithoutCycle.includes(name) ? Option.none() : Option.some(CalendarDate.fromAnchor(anchor)),
      endOf: (name, anchor) =>
        journalsWithoutCycle.includes(name)
          ? Option.none()
          : Option.some(CalendarDate.fromAnchor(endAnchorOf(name, anchor))),
      // The period holding a date can open before it, which is the whole reason the listing
      // widens its lower bound; the latest known anchor at or before the date models that.
      anchorOf: (name, date) => {
        if (journalsWithoutCycle.includes(name)) return Option.none();
        const target = date.toAnchor();
        const known = Object.keys(notes[name] ?? {}).toSorted();
        return Option.some((known.findLast((anchor) => anchor <= target) ?? target) as AnchorString);
      },
      overlapsFrom: (name, anchor, start) => anchor >= start || endAnchorOf(name, anchor) >= start,
    },
    structure: { get: (path) => Option.fromNullable(structures[path] ?? EMPTY_STRUCTURE) },
    tasks: {
      itemsIn: (path) => items[path] ?? [],
      // Hydration is the seam under test only for its position in the pipeline; give every line
      // item a markdown so the rows are complete.
      hydrate: (given) =>
        Promise.resolve(
          given.map((item) =>
            item.display.kind === "line"
              ? { ...item, display: { ...item.display, markdown: `- [ ] ${item.key}` } }
              : item,
          ),
        ),
    },
  };
}

function request(overrides: Partial<TaskListingPeriodRequest> = {}): TaskListingPeriodRequest {
  return {
    kind: "period",
    hostJournal: "Daily",
    anchor: "2026-09-22" as AnchorString,
    journalNames: ["Daily"],
    query: DEFAULT_TASK_QUERY,
    ...overrides,
  };
}

const withQuery = (query: Partial<TaskQuery>): TaskQuery => ({ ...DEFAULT_TASK_QUERY, ...query });

// What a bare fence, and a view block whose filter the user emptied, both hand the listing.
const NO_CONDITIONS: TaskRule = { mode: "and", conditions: [] };

describe("buildTaskListing", () => {
  it("returns the period note's open items in document order and leaves the done one out", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [
          line(DAY, 5, { status: "done" }),
          line(DAY, 3, { status: "todo" }),
          line(DAY, 4, { status: "in-progress" }),
        ],
      },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:3`, `${DAY}:4`]);
  });

  // The rolled-up scope deliberately leaves the host journal out: with it in, the rollup walk finds
  // the month note by itself and the assertion holds even for a rollup that replaced the literal
  // target instead of widening it.
  it("widens rather than replaces on rollup — the month note's own items stay alongside its days'", async () => {
    const dependencies = buildDependencies({
      items: {
        [MONTH]: [line(MONTH, 1), line(MONTH, 6, { status: "done" })],
        [DAY]: [line(DAY, 3)],
        [OTHER_DAY]: [line(OTHER_DAY, 3), line(OTHER_DAY, 8, { status: "done" })],
      },
      notes: {
        Monthly: { "2026-09-01": MONTH },
        Daily: { "2026-09-22": DAY, "2026-09-23": OTHER_DAY },
      },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.source.path)).toEqual([MONTH, DAY, OTHER_DAY]);
  });

  it("lists the host journal's own period once when the rolled-up scope holds it too", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 1), line(MONTH, 4, { status: "done" })], [DAY]: [line(DAY, 3)] },
      notes: { Monthly: { "2026-09-01": MONTH }, Daily: { "2026-09-22": DAY } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Monthly", "Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${MONTH}:1`, `${DAY}:3`]);
  });

  it("rolls up a period that opened before the target and drops one that had already closed", async () => {
    const dependencies = buildDependencies({
      items: {
        [MONTH]: [],
        [WEEK]: [line(WEEK, 3)],
        [SPRINT]: [line(SPRINT, 3)],
        [LATER_SPRINT]: [line(LATER_SPRINT, 3)],
      },
      notes: {
        Monthly: { "2026-09-01": MONTH },
        Weekly: { "2026-08-31": WEEK },
        Sprints: { "2026-08-25": SPRINT, "2026-09-05": LATER_SPRINT },
      },
      ends: {
        Monthly: { "2026-09-01": "2026-09-30" },
        Weekly: { "2026-08-31": "2026-09-06" },
        Sprints: { "2026-08-25": "2026-08-28", "2026-09-05": "2026-09-10" },
      },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Monthly", "Weekly", "Sprints"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.source.path)).toEqual([WEEK, LATER_SPRINT]);
  });

  it("adds a notelet's items under source: both and omits them under source: note", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [line(DAY, 3), line(DAY, 6, { status: "done" })],
        [NOTELET]: [line(NOTELET, 2), line(NOTELET, 5, { status: "done" })],
      },
      notes: { Daily: { "2026-09-22": DAY } },
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const both = await buildTaskListing(dependencies, request());
    expect(both.map((row) => row.source.kind)).toEqual(["note", "notelet"]);

    const noteOnly = await buildTaskListing(
      dependencies,
      request({ query: withQuery({ scope: { provider: [], source: "note", depth: "literal" } }) }),
    );
    expect(noteOnly.map((row) => row.source.path)).toEqual([DAY]);
  });

  it("labels each row's source with the basename of the note it came from", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [line(DAY, 3), line(DAY, 6, { status: "done" })],
        [NOTELET]: [line(NOTELET, 2), line(NOTELET, 5, { status: "done" })],
      },
      notes: { Daily: { "2026-09-22": DAY } },
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => row.source.label)).toEqual(["2026-09-22", "2026-09-22 Standup"]);
  });

  it("leaves the period note's own items out under source: notelets", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [line(DAY, 3), line(DAY, 6, { status: "done" })],
        [NOTELET]: [line(NOTELET, 2), line(NOTELET, 5, { status: "done" })],
      },
      notes: { Daily: { "2026-09-22": DAY } },
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({ query: withQuery({ scope: { provider: [], source: "notelets", depth: "literal" } }) }),
    );
    expect(rows.map((row) => row.source.path)).toEqual([NOTELET]);
  });

  it("reaches a notelet whose own period note is not indexed", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3)], [NOTELET]: [line(NOTELET, 2, { status: "done" }), line(NOTELET, 4)] },
      notes: {},
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => row.key)).toEqual([`${NOTELET}:4`]);
  });

  it("rolls up a period whose only notes are notelets, its own period note never having been created", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [], [NOTELET]: [line(NOTELET, 2)] },
      notes: { Monthly: { "2026-09-01": MONTH } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Daily"],
        query: withQuery({ scope: { provider: [], source: "both", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${NOTELET}:2`]);
  });

  it("keeps a notelet out of a rollup when its own period had already closed before the target", async () => {
    const dependencies = buildDependencies({
      items: {
        [MONTH]: [],
        [CLOSED_SPRINT_NOTELET]: [line(CLOSED_SPRINT_NOTELET, 2)],
        [LATER_SPRINT_NOTELET]: [line(LATER_SPRINT_NOTELET, 2)],
      },
      notes: { Monthly: { "2026-09-01": MONTH }, Sprints: { "2026-08-25": SPRINT } },
      ends: {
        Monthly: { "2026-09-01": "2026-09-30" },
        Sprints: { "2026-08-25": "2026-08-28", "2026-08-29": "2026-08-31" },
      },
      notelets: { Sprints: { "2026-08-29": [CLOSED_SPRINT_NOTELET], "2026-09-05": [LATER_SPRINT_NOTELET] } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Sprints"],
        query: withQuery({ scope: { provider: [], source: "both", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${LATER_SPRINT_NOTELET}:2`]);
  });

  it("renders a filtered-out parent as a context row above its matching child", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "done" }), child(DAY, 4, 3, { status: "todo" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.item.status, row.context, row.depth])).toEqual([
      ["done", true, 0],
      ["todo", false, 1],
    ]);
  });

  it("hydrates a context row too, so it has something to render", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "done" }), child(DAY, 4, 3, { status: "todo" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    const display = rows.at(0)?.item.display;
    expect(rows.at(0)?.context).toBe(true);
    expect(display?.kind === "line" && display.markdown).toBeTruthy();
  });

  it("renders a child whose parent is not itself a task as a root, with no context row", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [child(DAY, 4, 3), line(DAY, 6, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.depth, row.context])).toEqual([[0, false]]);
  });

  it("keeps a whole filtered-out ancestor chain as context above the item that matched", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [
          line(DAY, 3, { status: "done" }),
          child(DAY, 4, 3, { status: "done" }),
          child(DAY, 5, 4, { status: "todo" }),
        ],
      },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.key, row.depth, row.context])).toEqual([
      [`${DAY}:3`, 0, true],
      [`${DAY}:4`, 1, true],
      [`${DAY}:5`, 2, false],
    ]);
  });

  it("lists a note-shaped item as a root of its own", async () => {
    const noteItem = buildTaskItem({
      path: DAY,
      key: `${DAY}#note`,
      display: { kind: "note", path: DAY, title: "Ship it" },
    });
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3), line(DAY, 5, { status: "done" }), noteItem] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.key, row.depth])).toEqual([
      [`${DAY}#note`, 0],
      [`${DAY}:3`, 0],
    ]);
  });

  it("filters a note no journal owns by the query's filter alone", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3), line(DAY, 5, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
      journalFilters: {
        Daily: { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["cancelled"] }] },
      },
      unknownJournals: ["Daily"],
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:3`]);
  });

  it("leaves a rolled-up journal out when its cycle cannot place the window's start", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 1)], [DAY]: [line(DAY, 3)] },
      notes: { Monthly: { "2026-09-01": MONTH }, Daily: { "2026-09-22": DAY } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
      journalsWithoutCycle: ["Daily"],
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${MONTH}:1`]);
  });

  it("falls back to the literal target when the host period has no bounds to roll up over", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 1), line(MONTH, 4, { status: "done" })], [DAY]: [line(DAY, 3)] },
      notes: { Monthly: { "2026-09-01": MONTH }, Daily: { "2026-09-22": DAY } },
      journalsWithoutCycle: ["Monthly"],
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Monthly", "Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${MONTH}:1`]);
  });

  it("terminates on an item that names itself as its own parent", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [child(DAY, 3, 3), line(DAY, 5, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.key, row.depth])).toEqual([[`${DAY}:3`, 0]]);
  });

  it("drops a non-task item before the filter or the sort can see it", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "non-task" }), line(DAY, 4, { status: "todo" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({ query: withQuery({ filter: { mode: "and", conditions: [] } }) }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:4`]);
  });

  it("does not pull a non-task parent in as a context row, and roots its child", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "non-task" }), child(DAY, 4, 3, { status: "todo" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.key, row.depth])).toEqual([[`${DAY}:4`, 0]]);
  });

  // A bare fence and a view block whose filter names no status both arrive here with an empty
  // condition list; the listing's own `status: open` default is applied at composition, so it
  // reaches both without either surface having to emit it.
  it("defaults a surface that names no status to open items", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "todo" }), line(DAY, 4, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ filter: NO_CONDITIONS }) }));
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:3`]);
  });

  it("lets the journal's own status condition stand where the surface names none", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "todo" }), line(DAY, 4, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
      journalFilters: {
        Daily: { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["done"] }] },
      },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ filter: NO_CONDITIONS }) }));
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:4`]);
  });

  // Heading fixtures carry no "#" — see filter.test.ts's own note on HeadingCache.heading.
  it("applies the owning journal's filter, and lets the query's condition of the same type replace it", async () => {
    const structures: Partial<Record<VaultPath, NoteStructure>> = {
      [DAY]: {
        listItems: [
          { marker: " ", line: 3, endLine: 3, parent: null },
          { marker: " ", line: 7, endLine: 7, parent: null },
        ],
        tags: [],
        headings: [
          { heading: "Tasks", level: 2, line: 1 },
          { heading: "Log", level: 2, line: 5 },
        ],
        frontmatterTags: [],
      },
    };
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3), line(DAY, 7)] },
      structures,
      notes: { Daily: { "2026-09-22": DAY } },
      journalFilters: {
        Daily: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }] },
      },
    });

    const inherited = await buildTaskListing(dependencies, request());
    expect(inherited.map((row) => row.key)).toEqual([`${DAY}:3`]);

    const overridden = await buildTaskListing(
      dependencies,
      request({
        query: withQuery({
          filter: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["Log"] }] },
        }),
      }),
    );
    expect(overridden.map((row) => row.key)).toEqual([`${DAY}:7`]);
  });

  it("filters each note by its own journal's stored filter on a rollup", async () => {
    const structure: NoteStructure = {
      listItems: [
        { marker: " ", line: 3, endLine: 3, parent: null },
        { marker: " ", line: 7, endLine: 7, parent: null },
      ],
      tags: [],
      headings: [
        { heading: "Tasks", level: 2, line: 1 },
        { heading: "Log", level: 2, line: 5 },
      ],
      frontmatterTags: [],
    };
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 3), line(MONTH, 7)], [DAY]: [line(DAY, 3), line(DAY, 7)] },
      structures: { [MONTH]: structure, [DAY]: structure },
      notes: { Monthly: { "2026-09-01": MONTH }, Daily: { "2026-09-22": DAY } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
      journalFilters: {
        Monthly: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }] },
        Daily: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["Log"] }] },
      },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Monthly", "Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${MONTH}:3`, `${DAY}:7`]);
  });

  it("narrows to one provider when the scope names it", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3), line(DAY, 4, { provider: "note-property", key: `${DAY}:np` })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({ query: withQuery({ scope: { provider: ["checkbox"], source: "both", depth: "literal" } }) }),
    );
    expect(rows.map((row) => row.item.provider)).toEqual(["checkbox"]);
  });

  it("hydrates every line row's markdown before returning", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3), line(DAY, 5, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    const display = rows.at(0)?.item.display;
    expect(display?.kind === "line" && display.markdown).toBeTruthy();
  });

  it("orders by status when the sort names it, keeping document order within a status", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [
          line(DAY, 3, { status: "on-hold" }),
          line(DAY, 4, { status: "in-progress" }),
          line(DAY, 5, { status: "todo" }),
          line(DAY, 6, { status: "done" }),
          line(DAY, 7, { status: "todo" }),
        ],
      },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ sort: "status" }) }));
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:5`, `${DAY}:7`, `${DAY}:4`, `${DAY}:3`]);
  });

  it("orders by a date role, putting an item carrying no such date last", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [
          line(DAY, 3, { dates: { due: "2026-10-05" as AnchorString } }),
          line(DAY, 4),
          line(DAY, 5, { dates: { due: "2026-09-30" as AnchorString } }),
          line(DAY, 6, { status: "done", dates: { due: "2026-09-01" as AnchorString } }),
          line(DAY, 7, { dates: { due: "2026-09-30" as AnchorString } }),
          line(DAY, 8, { dates: { due: "2026-12-01" as AnchorString } }),
        ],
      },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ sort: "due" }) }));
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:5`, `${DAY}:7`, `${DAY}:3`, `${DAY}:8`, `${DAY}:4`]);
  });

  it("keeps a child under its own parent when a sort reorders the roots", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [
          line(DAY, 3, { status: "on-hold" }),
          child(DAY, 4, 3, { status: "todo" }),
          line(DAY, 8, { status: "todo" }),
          line(DAY, 12, { status: "done" }),
        ],
      },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ sort: "status" }) }));
    expect(rows.map((row) => [row.key, row.depth])).toEqual([
      [`${DAY}:8`, 0],
      [`${DAY}:3`, 0],
      [`${DAY}:4`, 1],
    ]);
  });
});

// The view block has no single host note — its window is a calendar span picked independently of
// any journal's own cycle, and the journal list handed in is already the block's whole explicit
// scope. This request shape walks every named journal's own periods inside the window directly,
// the same periodsWithin primitive rollup uses to widen past a host.
describe("buildTaskListing — window request", () => {
  it("gathers each named journal's own periods within the window, not just one host's", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 1)], [DAY]: [line(DAY, 3)], [OTHER_DAY]: [line(OTHER_DAY, 3)] },
      notes: {
        Monthly: { "2026-09-01": MONTH },
        Daily: { "2026-09-22": DAY, "2026-09-23": OTHER_DAY },
      },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
    });
    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Monthly", "Daily"],
      window: { start: "2026-09-01" as AnchorString, end: "2026-09-30" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });
    expect(rows.map((row) => row.source.path)).toEqual([MONTH, DAY, OTHER_DAY]);
  });

  it("never widens beyond the journals it is given, having no host to widen from", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3)] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Daily"],
      window: { start: "2026-09-01" as AnchorString, end: "2026-09-30" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });
    expect(rows.map((row) => row.source.path)).toEqual([DAY]);
  });

  it("reaches a notelet inside the window whose own period note does not exist", async () => {
    const dependencies = buildDependencies({
      items: { [NOTELET]: [line(NOTELET, 2)] },
      notes: {},
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Daily"],
      window: { start: "2026-09-01" as AnchorString, end: "2026-09-30" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });
    expect(rows.map((row) => row.key)).toEqual([`${NOTELET}:2`]);
  });

  it("dedupes a journal named more than once within the window", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3)] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Daily", "Daily"],
      window: { start: "2026-09-01" as AnchorString, end: "2026-09-30" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:3`]);
  });
});
