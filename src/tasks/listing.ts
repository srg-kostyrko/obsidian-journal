import { CalendarDate, type AnchorString } from "@/calendar";
import { basenameOf, type NoteStructureService, type VaultPath } from "@/infrastructure/host";
import type { CycleService, JournalsIndex, JournalsRepository } from "@/journals";

import { composeFilters, matchesFilter } from "./filter";
import { isExcluded } from "./status";

import type { TaskRule } from "./conditions";
import type { TaskQuery, TaskSort } from "./query";
import type { TaskIndex } from "./task-index";
import type { TaskItem, TaskStatus } from "./types";

export interface TaskListingDependencies {
  readonly journals: Pick<JournalsRepository, "get">;
  readonly index: Pick<JournalsIndex, "get" | "getRange" | "noteletsAt" | "noteletsFor">;
  readonly cycle: Pick<CycleService, "startOf" | "endOf" | "anchorOf" | "overlapsFrom">;
  readonly structure: Pick<NoteStructureService, "get">;
  readonly tasks: Pick<TaskIndex, "itemsIn" | "hydrate">;
}

export interface TaskListingPeriodRequest {
  readonly kind: "period";
  readonly hostJournal: string;
  readonly anchor: AnchorString;
  readonly journalNames: readonly string[];
  readonly query: TaskQuery;
}

// A view block has no single note to be literal about: it picks a calendar window independently
// of any journal's own cycle, and its journal list is already the block's full, explicit scope
// (the view's shelf, narrowed by the block's own filter) — there is no wider scope for a rollup
// to reach into the way the fence's host-plus-siblings model has. Mirrors the same two-variant
// split `NoteletListingRequest` (`src/journals/notelets/listing.ts`) already uses for this exact
// problem, tagged the same way.
export interface TaskListingWindowRequest {
  readonly kind: "window";
  readonly journalNames: readonly string[];
  readonly window: { readonly start: AnchorString; readonly end: AnchorString };
  readonly query: TaskQuery;
}

export type TaskListingRequest = TaskListingPeriodRequest | TaskListingWindowRequest;

export interface TaskListingSource {
  readonly kind: "note" | "notelet";
  readonly path: VaultPath;
  readonly label: string;
}

export interface TaskListingRow {
  readonly key: string;
  readonly item: TaskItem;
  readonly source: TaskListingSource;
  readonly depth: number;
  readonly context: boolean;
}

interface TargetPeriod {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly path: VaultPath | null;
}

interface SourceNote {
  readonly journalName: string;
  readonly source: TaskListingSource;
}

interface Kept {
  readonly item: TaskItem;
  readonly depth: number;
  readonly context: boolean;
  readonly parent: TaskItem | null;
}

interface Entry {
  readonly id: number;
  // undefined is "renders as a root", which a genuine root and an unresolvable parent both are.
  readonly parentId: number | undefined;
  readonly item: TaskItem;
  readonly source: TaskListingSource;
  readonly depth: number;
  readonly context: boolean;
}

// Every status a listing can show, in the order a status sort shows them. rolled sits between the
// open statuses and the done ones: it is neither, and a listing re-sorted by status is asking
// "what still needs me", which a rolled item no longer does. non-task is absent on purpose —
// gather drops it before any sort can see it.
const STATUS_ORDER: readonly TaskStatus[] = ["todo", "in-progress", "on-hold", "rolled", "done", "cancelled"];

// A status this list does not name sorts after every one it does. Left to indexOf's -1 it would
// sort ahead of todo instead, which is a silent answer to a question nobody asked.
function statusRank(status: TaskStatus): number {
  const rank = STATUS_ORDER.indexOf(status);
  return rank === -1 ? STATUS_ORDER.length : rank;
}

function lineOf(item: TaskItem): number {
  return item.display.kind === "line" ? item.display.line : -1;
}

function periodsWithin(
  dependencies: TaskListingDependencies,
  journalName: string,
  from: AnchorString,
  to: AnchorString,
  source: TaskQuery["scope"]["source"],
): readonly TargetPeriod[] {
  // getRange compares anchor strings, so asking it for [from, to] drops any period that opened
  // before the window and is still running inside it — a week straddling a month boundary as much
  // as a custom interval. Widening the lower bound to the anchor of the period holding `from`
  // catches that leading period, and overlapsFrom keeps the widening honest: a custom interval
  // pulled in can hold `from` under anchorOf and still have closed before it. Same pairing as
  // journals-api.ts's #existingAnchors, and it is why this needs no fixed/custom split. Preferred
  // over cycle.intervalsInRange, which walks anchorOf per step — quadratic on a custom cycle —
  // and then costs one index lookup per anchor to reach the notes that exist.
  const opening = dependencies.cycle.anchorOf(journalName, CalendarDate.fromAnchor(from));
  if (opening.isNone()) return [];
  const pathByAnchor = new Map<AnchorString, VaultPath | null>(
    dependencies.index.getRange(journalName, opening.value, to),
  );
  // getRange answers for periods whose note exists, so a day holding nothing but a notelet would
  // never be visited at all. A notelet is indexed against the (journal, anchor) slot rather than
  // against the period note — the same rule targetPeriods' literal branch states below — so its
  // anchor joins the walk with a null path, on exactly the same terms as the rest: inside the
  // widened bounds, and still overlapping `from` once the filter below runs.
  //
  // Gated on source: sourceNotes below discards every path: null period when source is "note", so
  // under that scope this scan's result is thrown away unread — and unlike getRange's binary
  // search, NoteletIndex.paths() (behind noteletsFor) returns every notelet the journal has,
  // unbounded, so skipping the call is the saving, not just skipping its output. A version of
  // NoteletIndex sorted by anchor, mirroring JournalIndex, would let this run unconditionally at
  // getRange's own cost; that is a deferred follow-up, not done here.
  if (source !== "note") {
    for (const entry of dependencies.index.noteletsFor(journalName)) {
      if (entry.anchor < opening.value || entry.anchor > to || pathByAnchor.has(entry.anchor)) continue;
      pathByAnchor.set(entry.anchor, null);
    }
  }
  return (
    [...pathByAnchor]
      // getRange is sorted and these additions are not, and the order periods are walked in is the
      // order `sort: document` renders them in.
      .toSorted(([left], [right]) => (left < right ? -1 : 1))
      .filter(([anchor]) => dependencies.cycle.overlapsFrom(journalName, anchor, from))
      .map(([anchor, path]) => ({ journalName, anchor, path }))
  );
}

function dedupeBySlot(periods: readonly TargetPeriod[]): readonly TargetPeriod[] {
  const seen = new Map<string, Set<AnchorString>>();
  return periods.filter((period) => {
    const anchors = seen.get(period.journalName) ?? new Set<AnchorString>();
    seen.set(period.journalName, anchors);
    if (anchors.has(period.anchor)) return false;
    anchors.add(period.anchor);
    return true;
  });
}

function targetPeriods(dependencies: TaskListingDependencies, request: TaskListingRequest): readonly TargetPeriod[] {
  if (request.kind === "window") {
    return dedupeBySlot(
      request.journalNames.flatMap((name) =>
        periodsWithin(dependencies, name, request.window.start, request.window.end, request.query.scope.source),
      ),
    );
  }
  const { hostJournal, anchor } = request;
  // Carried even when no note exists for it: a notelet is indexed against the (journal, anchor)
  // slot, not against the period note, so source: notelets must still reach one.
  const host: TargetPeriod = {
    journalName: hostJournal,
    anchor,
    path: dependencies.index.get(hostJournal, anchor).getOrUndefined() ?? null,
  };
  if (request.query.scope.depth === "literal") return [host];
  const start = dependencies.cycle.startOf(hostJournal, anchor);
  const end = dependencies.cycle.endOf(hostJournal, anchor);
  if (start.isNone() || end.isNone()) return [host];
  const from = start.value.toAnchor();
  const to = end.value.toAnchor();
  // Rollup widens the literal target rather than replacing it: dropping the host note's own items
  // while showing all of its days' would lose whatever the user writes in the period note itself.
  // The host journal is normally in scope too, so its period arrives twice — deduped by slot.
  return dedupeBySlot([
    host,
    ...request.journalNames.flatMap((name) => periodsWithin(dependencies, name, from, to, request.query.scope.source)),
  ]);
}

function sourceNotes(
  dependencies: TaskListingDependencies,
  periods: readonly TargetPeriod[],
  source: TaskQuery["scope"]["source"],
): readonly SourceNote[] {
  const notes: SourceNote[] = [];
  for (const period of periods) {
    if (source !== "notelets" && period.path !== null) {
      notes.push({
        journalName: period.journalName,
        source: { kind: "note", path: period.path, label: basenameOf(period.path) },
      });
    }
    if (source === "note") continue;
    for (const entry of dependencies.index.noteletsAt(period.journalName, period.anchor)) {
      notes.push({
        journalName: period.journalName,
        source: { kind: "notelet", path: entry.path, label: basenameOf(entry.path) },
      });
    }
  }
  return notes;
}

function composedFilterFor(dependencies: TaskListingDependencies, query: TaskQuery): (name: string) => TaskRule {
  const cache = new Map<string, TaskRule>();
  return (journalName) => {
    const cached = cache.get(journalName);
    if (cached !== undefined) return cached;
    const owner = dependencies.journals.get(journalName).getOrUndefined();
    const composed = composeFilters(owner?.tasks.filter ?? null, query.filter);
    cache.set(journalName, composed);
    return composed;
  };
}

function gather(
  dependencies: TaskListingDependencies,
  path: VaultPath,
  providers: readonly string[],
): readonly TaskItem[] {
  return dependencies.tasks
    .itemsIn(path)
    .filter((item) => !isExcluded(item.status) && (providers.length === 0 || providers.includes(item.provider)));
}

function ancestorsOf(item: TaskItem, byLine: ReadonlyMap<number, TaskItem>): readonly TaskItem[] {
  const chain: TaskItem[] = [];
  const walked = new Set<string>([item.key]);
  let current = item;
  while (current.display.kind === "line" && current.display.parentLine !== null) {
    const parent = byLine.get(current.display.parentLine);
    // A parent that is not itself a task is absent from the item set (note-structure-service keeps
    // only checkbox list items), and a note whose list starts at line 0 yields a parent value a
    // child shares with its own line. Both end the walk and leave the child a root: a context row
    // can only ever show a parent that is itself a task, and the walk must terminate regardless.
    if (parent === undefined || walked.has(parent.key)) break;
    walked.add(parent.key);
    chain.push(parent);
    current = parent;
  }
  return chain;
}

function keptInNote(items: readonly TaskItem[], matched: ReadonlySet<string>): readonly Kept[] {
  const byLine = new Map<number, TaskItem>();
  for (const item of items) {
    if (item.display.kind === "line") byLine.set(item.display.line, item);
  }
  const kept = new Map<string, Kept>();
  for (const item of items) {
    if (!matched.has(item.key)) continue;
    const chain = ancestorsOf(item, byLine);
    kept.set(item.key, { item, depth: chain.length, context: false, parent: chain.at(0) ?? null });
    // An ancestor of a matching item that the filter rejected is pulled in as context, to anchor
    // the child. One already kept keeps its own verdict — a matching item is never dimmed.
    for (const [index, ancestor] of chain.entries()) {
      if (kept.has(ancestor.key)) continue;
      kept.set(ancestor.key, {
        item: ancestor,
        depth: chain.length - 1 - index,
        context: true,
        parent: chain.at(index + 1) ?? null,
      });
    }
  }
  // Document order, restored: items arrive in whatever order their providers published them, while
  // a parent has to precede its child for depth to read as nesting and for the tree pass below to
  // find it. A note-kind item has no line to sort by, so it takes -1 and leads its note's rows;
  // two of them hold their relative order, the sort being stable.
  return [...kept.values()].toSorted((a, b) => lineOf(a.item) - lineOf(b.item));
}

function comparatorFor(sort: TaskSort): (a: Entry, b: Entry) => number {
  if (sort === "document") return (a, b) => a.id - b.id;
  if (sort === "status") {
    return (a, b) => {
      const rank = statusRank(a.item.status) - statusRank(b.item.status);
      return rank === 0 ? a.id - b.id : rank;
    };
  }
  // Whatever is left names a date role, which only exists once hydration has read the line — so
  // this comparator runs after the await, never before it. An item carrying no date of the role
  // sorts last, so naming a role never buries the items that answer it.
  return (a, b) => {
    const left = a.item.dates[sort];
    const right = b.item.dates[sort];
    if (left === right) return a.id - b.id;
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    return left < right ? -1 : 1;
  };
}

export async function buildTaskListing(
  dependencies: TaskListingDependencies,
  request: TaskListingRequest,
): Promise<readonly TaskListingRow[]> {
  const { query } = request;
  const filterFor = composedFilterFor(dependencies, query);
  const entries: Entry[] = [];

  const notes = sourceNotes(dependencies, targetPeriods(dependencies, request), query.scope.source);
  for (const note of notes) {
    const items = gather(dependencies, note.source.path, query.scope.provider);
    const structure = dependencies.structure.get(note.source.path).getOrUndefined();
    const filter = filterFor(note.journalName);
    const matched = new Set(items.filter((item) => matchesFilter(item, structure, filter)).map((item) => item.key));
    const idByKey = new Map<string, number>();
    for (const kept of keptInNote(items, matched)) {
      const id = entries.length;
      idByKey.set(kept.item.key, id);
      entries.push({
        id,
        parentId: kept.parent === null ? undefined : idByKey.get(kept.parent.key),
        item: kept.item,
        source: note.source,
        depth: kept.depth,
        context: kept.context,
      });
    }
  }

  // One call, over the context rows as well as the matching ones: a context row renders its own
  // markdown, so hydrating only what matched would leave it blank. The pipeline's only await.
  const hydrated = await dependencies.tasks.hydrate(entries.map((entry) => entry.item));
  const resolved = entries.map((entry, index) => ({ ...entry, item: hydrated.at(index) ?? entry.item }));

  const childrenOf = new Map<number, Entry[]>();
  const roots: Entry[] = [];
  for (const entry of resolved) {
    if (entry.parentId === undefined) {
      roots.push(entry);
      continue;
    }
    const siblings = childrenOf.get(entry.parentId) ?? [];
    siblings.push(entry);
    childrenOf.set(entry.parentId, siblings);
  }

  // Sorted level by level rather than as one flat list: a subtree has to stay contiguous and
  // below its parent, or a context row no longer sits above the child it was pulled in to anchor.
  const compare = comparatorFor(query.sort);
  const rows: TaskListingRow[] = [];
  const emit = (siblings: readonly Entry[]): void => {
    for (const entry of siblings.toSorted(compare)) {
      rows.push({
        key: entry.item.key,
        item: entry.item,
        source: entry.source,
        depth: entry.depth,
        context: entry.context,
      });
      emit(childrenOf.get(entry.id) ?? []);
    }
  };
  emit(roots);
  return rows;
}
