# v3 Journal Index — Design

**Stage:** First piece of the v3 `journals` feature port — the per-journal data
structure (`JournalIndex`) plus its caller-driven registry (`JournalsIndex`).
**Date:** 2026-05-15
**Status:** Draft for review

## Purpose

v2 ships two coupled data structures in `src/_old-code/journals/`:

- `JournalIndex` — per-journal: `anchor → notePath`, plus reverse `path → anchor`,
  plus a parallel sorted anchor array supporting `findNext` / `findPrevious` /
  `findClosestDate`.
- `JournalsIndex` — registry: `Map<journalName, JournalIndex>`, plus its own
  `path → journalName` reverse map, plus a `path → JournalNoteData` projection
  that reads file frontmatter (title, tags, tasks, properties), and a single
  `updateFromMetadata(journal, …)` method that interprets Obsidian
  `CachedMetadata` for a known `Journal`.

The vault-event wiring (`metadataCache` create / rename / delete / changed
listeners that drive registry mutations) lives in v2's `main.ts`, not in
the index.

This spec ports **only the passive data structures**: `JournalIndex` and
the caller-driven half of `JournalsIndex`. Both anchor primitives
(`AnchorString`) and host primitives (`VaultPath`) already exist in v3
([[2026-05-13-v3-host-design]], [[v3-calendar-design]]).

The wider journal feature port (entity, frontmatter parsing, vault-event
wiring, Vue reactivity bridge) layers on top of these in later specs.

## Non-goals

- **`updateFromMetadata` / frontmatter parsing.** Requires the journal
  entity (to know which frontmatter keys define an anchor for a given
  journal kind). Lands with the journal-entity port.
- **Vault / `metadataCache` event subscription.** The registry stays
  caller-driven. A wiring service backed by the host bridge drives it
  later, once the journal entity exists.
- **Vue composable bridge / per-component reactivity.** The registry
  exposes typed events; no Vue artefacts are imported anywhere in this
  spec. The composable layer lands when there is a Vue consumer.
- **`JournalNoteData` rich projection** (title, tags, tasks, properties).
  A separate concern — a higher-level "note metadata" service over
  `MetadataCache`. Not this port.
- **DI for `JournalIndex` itself.** Instances are internal state of
  `JournalsIndex`; only the registry gets a token and binding.
- **`JournalName` brand.** In this scope only `VaultPath` is at risk of
  being confused with another typed string; journal names stay as raw
  `string`. Promote later if more typed strings appear.
- **Performance regressions over v2.** v2's eager-sorted array works at
  10y daily-note scale (≈3650 entries). Lazy-sort and other rework is
  deferred until profiling motivates it.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  JournalsIndex  (Container-lifetime DI binding)             │
│                                                             │
│   #journals: Map<string, JournalIndex>                      │
│   #byPath:   Map<VaultPath, JournalEntry>   (single reverse)│
│   events:    TypedEmitter<JournalsIndexEvents>              │
│   #dirty + #flushScheduled  (microtask coalescing)          │
│                                                             │
│   register / unregister / transferPath / clearJournal /     │
│   clear / has / get / getRange / findNext / findPrevious /  │
│   findClosestAnchor / entryByPath / entriesFor              │
│                                                             │
└─────────┬───────────────────────────────────────────────────┘
          │ creates lazily on first register(name, …)
          ▼
┌─────────────────────────────────────────────────────────────┐
│  JournalIndex  (internal — not DI-registered)               │
│                                                             │
│   #byAnchor:     Map<AnchorString, VaultPath>               │
│   #sortedAnchors: AnchorString[]   (eager-sorted ascending) │
│                                                             │
│   has / get / set / delete / clear / size / iterator /      │
│   getRange / findNext / findPrevious / findClosestAnchor    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

`JournalsIndex` is the only public surface. `JournalIndex` is internal:
its methods are reached only via registry passthroughs; consumers never
hold a `JournalIndex` reference.

### Why the reverse map consolidates at the registry layer

v2 maintains _two_ reverse maps:

1. `path → journalName` inside `JournalsIndex` — used to dispatch vault
   events to the right journal.
2. `path → anchor` inside each `JournalIndex` — used by
   `deleteForPath(path)`.

Both must stay consistent with each other and with the forward map across
every mutation, splitting one invariant across two layers. v3
consolidates: a single `Map<VaultPath, JournalEntry>` at the registry
holds `{ journalName, anchor, path }` per known path. `JournalIndex`
becomes anchor-only.

### Why events live on the registry, not on `JournalIndex`

The Vue bridge (future) subscribes per-journal; the registry already
knows which journal an event belongs to, so events naturally fire from
there. If individual `JournalIndex` instances emitted, the bridge would
have to track listener attach/detach as journals appear and disappear.
One emitter, one lifetime.

## Types

Reused (no redefinition):

- `AnchorString` — `@/calendar` (branded `YYYY-MM-DD`).
- `VaultPath` — `@/infrastructure/host` (branded vault-relative path).
- `Option<T>` — `@/infrastructure/result`.

New, in `src/journals/types.ts`:

```ts
export interface JournalEntry {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly path: VaultPath;
}

export type JournalsIndexEvents = {
  entryChanged: { entry: JournalEntry; kind: "added" | "removed" };
  journalDirty: { journalName: string };
};
```

`JournalEntry` is the registry's reverse-map value, the event payload,
and the shape `register` accepts. One type, three uses.

No `errors.ts` for this port. All operations are total.

### `TypedEmitter` location

v3 currently has `TypedEmitter` at
`src/infrastructure/host/internal/typed-emitter.ts`. Journals are not
host code; rather than reach across the internal boundary, lift the
class to its own module under `src/infrastructure/events/` (or similar)
and re-export from there. Host's existing usage updates to import from
the new location. This is a one-file mechanical move.

## Public API

### `JournalIndex`

```ts
export class JournalIndex {
  has(anchor: AnchorString): boolean;
  get(anchor: AnchorString): Option<VaultPath>;

  set(anchor: AnchorString, path: VaultPath): void;
  delete(anchor: AnchorString): void;
  clear(): void;

  getRange(start: AnchorString, end: AnchorString): ReadonlyMap<AnchorString, VaultPath>;

  findNext(from: AnchorString): Option<VaultPath>;
  findPrevious(from: AnchorString): Option<VaultPath>;
  findClosestAnchor(to: AnchorString): Option<AnchorString>;

  get size(): number;
  [Symbol.iterator](): IterableIterator<readonly [AnchorString, VaultPath]>;
}
```

API notes:

- **No `deleteForPath`, no reverse map.** Consolidated to the registry.
- **`getRange` is inclusive on both ends.** Returns a fresh
  `ReadonlyMap<AnchorString, VaultPath>`. Empty range → empty map (not
  `Option`). This is the reactive primitive used by future month/year
  calendar views; cell-level `has` checks read synchronously from a
  cached snapshot.
- **`findNext` / `findPrevious` accept any `AnchorString`,** existing or
  not. Semantics: "strictly after / strictly before this anchor in the
  index". Fixes v2's signature-vs-algorithm mismatch.
- **`findClosestAnchor` returns the anchor.** Not the path. Callers
  compose `index.findClosestAnchor(today).flatMap(index.get)` when they
  want both. Matches v2's `findClosestDate` semantics (clamp to first
  before range, clamp to last after, otherwise predecessor) but with
  uniform `Option` return — fixes v2's empty-index `undefined` vs
  `null` inconsistency.
- **No `getAll(): string[]`.** Iteration covers it; v2 had both for
  historical reasons.

### `JournalsIndex`

```ts
export class JournalsIndex {
  readonly events: TypedEmitter<JournalsIndexEvents>;

  has(journalName: string, anchor: AnchorString): boolean;
  get(journalName: string, anchor: AnchorString): Option<VaultPath>;

  getRange(journalName: string, start: AnchorString, end: AnchorString): ReadonlyMap<AnchorString, VaultPath>;
  findNext(journalName: string, from: AnchorString): Option<VaultPath>;
  findPrevious(journalName: string, from: AnchorString): Option<VaultPath>;
  findClosestAnchor(journalName: string, to: AnchorString): Option<AnchorString>;

  entryByPath(path: VaultPath): Option<JournalEntry>;
  entriesFor(journalName: string): Iterable<readonly [AnchorString, VaultPath]>;

  register(entry: JournalEntry): void;
  unregister(path: VaultPath): void;
  transferPath(from: VaultPath, to: VaultPath): void;
  clearJournal(journalName: string): void;
  clear(): void;
}
```

API notes:

- **Reads on unknown journals are not errors.** `get` returns `None`;
  `getRange` / `entriesFor` return empty. Startup ordering is benign:
  a calendar view may query before the wiring service has registered.
- **Mutations are caller-driven.** No Obsidian dependency at this layer.
  Whoever drives the registry (future: a wiring service backed by the
  host bridge) calls `register` / `unregister` / `transferPath`.
- **`register(entry)` accepts the whole `JournalEntry`,** matching event
  payloads. If the path is already registered with a different entry,
  `register` emits `removed` for the old entry and `added` for the new
  one (one transaction; consumers see a consistent pair).
- **`transferPath(from, to)` is rename-only.** `journalName` and
  `anchor` are preserved; only the path moves. Emits `removed` for the
  old path and `added` for the new path.
- **`unregister(path)` is the consolidated `deleteForPath`.** Vault
  events arrive as paths ("file X was deleted"); the registry resolves
  to `(journal, anchor)` via `#byPath`.
- **`clearJournal(name)` emits only `journalDirty`,** not per-entry
  `entryChanged`. Listeners that care about journal deletion subscribe
  to `journalDirty`; per-entry events on bulk removal would defeat the
  point of coalescing.
- **`events` is `readonly`.** Emitter is owned by the registry;
  consumers only `.on` / `.off`.

### Event semantics

| Mutation                                          | `entryChanged`                        | `journalDirty`                                      |
| ------------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| `register` of a new path                          | once, `kind: "added"`                 | once per microtask, target journal                  |
| `register` reusing an existing path, same journal | once `"removed"`, then once `"added"` | once per microtask, target journal                  |
| `register` reusing a path, different journal      | once `"removed"`, then once `"added"` | once per microtask each for old and target journals |
| `register` no-op (identical entry)                | nothing                               | nothing                                             |
| `unregister` of a known path                      | once, `kind: "removed"`               | once per microtask, owning journal                  |
| `unregister` of an unknown path                   | nothing                               | nothing                                             |
| `transferPath`                                    | once `"removed"`, then once `"added"` | once per microtask, owning journal                  |
| `clearJournal`                                    | nothing                               | once per microtask, cleared journal                 |
| `clear`                                           | nothing                               | once per microtask per affected journal, one batch  |

`entryChanged` fires synchronously inside the mutation call (granular
consumers see every change in order). `journalDirty` is microtask-coalesced
(UI bridges see at most one dirty event per journal per tick, regardless
of burst size — e.g. a 1000-file initial scan coalesces to N events
where N is the number of distinct journals touched).

## Internals

### `JournalIndex`

```ts
class JournalIndex {
  readonly #byAnchor = new Map<AnchorString, VaultPath>();
  readonly #sortedAnchors: AnchorString[] = [];
}
```

- `#byAnchor` — primary lookup, O(1) `has` / `get`.
- `#sortedAnchors` — eagerly maintained ascending; `AnchorString` is
  lexicographically `YYYY-MM-DD`, so string sort = chronological.

Both stay consistent through three private helpers:

- `#insertSorted(anchor)` — binary search insertion point, single
  `splice`. Called only when `set` adds a _new_ anchor (overwrite of
  existing anchor leaves the sorted array untouched).
- `#removeSorted(anchor)` — binary search, single `splice`. Called on
  `delete`.
- `#bsearch(target)` — single helper returning a discriminated result:
  `{ found: true; index } | { found: false; insertionPoint }`. v2's
  single-`number` return overloaded "found index" and "predecessor
  index" with a fragile zero-index edge case (`v2:journal-index.ts:105`);
  the discriminated shape removes the edge case.

Operation specifics:

- `set(anchor, path)`: if `#byAnchor` has no `anchor`, call
  `#insertSorted(anchor)`; assign in map.
- `delete(anchor)`: `#removeSorted(anchor)`; `#byAnchor.delete(anchor)`.
- `clear()`: `#byAnchor.clear()`; `#sortedAnchors.length = 0`.
- `getRange(start, end)`: `#bsearch(start)`; walk `#sortedAnchors`
  while `anchor <= end`; collect into a fresh `Map`.
- `findNext(from)`: `#bsearch(from)`; pick `index + 1` if found exact,
  else `insertionPoint`. `Option.fromNullable(#sortedAnchors[i]).flatMap(get)`.
- `findPrevious(from)`: symmetric (predecessor).
- `findClosestAnchor(to)`: empty → `None`. Exact hit → `Some(to)`.
  `to < #sortedAnchors[0]` → first. `to > last` → last. Otherwise the
  predecessor (matches v2's "2022-01-05 → 2022-01-04" test).

### `JournalsIndex`

```ts
class JournalsIndex {
  readonly #journals = new Map<string, JournalIndex>();
  readonly #byPath = new Map<VaultPath, JournalEntry>();
  readonly events = new TypedEmitter<JournalsIndexEvents>();

  readonly #dirty = new Set<string>();
  #flushScheduled = false;
}
```

- `#journals` — per-journal indices, lazily created on first `register`.
- `#byPath` — single reverse map; replaces v2's two split reverse maps.
- `#dirty` + `#flushScheduled` — microtask coalescing for
  `journalDirty`.

Mutation specifics:

- `register(entry)`:
  1. If `#byPath` has `entry.path`:
     - If existing entry equals `entry` (same `journalName`, `anchor`,
       `path`): no-op (no emit, no dirty mark).
     - Otherwise:
       - Remove old anchor from old journal's `JournalIndex`.
       - Emit `entryChanged({ entry: old, kind: "removed" })`.
       - Mark old journal dirty.
  2. Look up or create the target `JournalIndex` in `#journals`.
  3. `targetIndex.set(entry.anchor, entry.path)`.
  4. `#byPath.set(entry.path, entry)`.
  5. Emit `entryChanged({ entry, kind: "added" })`.
  6. Mark `entry.journalName` dirty.

- `unregister(path)`:
  - If `#byPath` has no `path`: silent no-op.
  - Else: look up entry; remove from `#byPath`; `journalIndex.delete(anchor)`;
    emit `entryChanged({ entry, kind: "removed" })`; mark journal dirty.

- `transferPath(from, to)`:
  - If `from === to` or `#byPath` has no `from`: no-op.
  - Else: look up `old = #byPath.get(from)`; build
    `next = { ...old, path: to }`. Update the per-journal index (the
    anchor → path value reassigns; no anchor-key change).
    `#byPath.delete(from)`; `#byPath.set(to, next)`. Emit
    `entryChanged({ entry: old, kind: "removed" })` then
    `entryChanged({ entry: next, kind: "added" })`. Mark journal dirty
    once.

- `clearJournal(name)`:
  - For each `[anchor, path]` in the journal's index, `#byPath.delete(path)`.
  - Empty the inner index; remove the entry from `#journals`.
  - Mark journal dirty. No per-entry `entryChanged`.

- `clear()`:
  - Collect dirty names from `#journals.keys()`.
  - Clear `#byPath`, each inner index, `#journals` itself.
  - Mark every collected name dirty in one batch (one microtask flush).

- `#markDirty(name)`:
  ```ts
  #markDirty(name: string) {
    this.#dirty.add(name);
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    queueMicrotask(() => {
      this.#flushScheduled = false;
      const names = [...this.#dirty];
      this.#dirty.clear();
      for (const journalName of names) {
        this.events.emit("journalDirty", { journalName });
      }
    });
  }
  ```

## File layout

```
src/journals/
  types.ts              JournalEntry, JournalsIndexEvents
  tokens.ts             JournalsIndexToken
  module.ts             const journalsIndexModule: Module
  journal-index.ts      JournalIndex (internal)
  journal-index.test.ts
  journal-index.bench.ts
  journals-index.ts     JournalsIndex
  journals-index.test.ts
```

No barrel until there is more than one public export
([[feedback_barrel_files]]). No `errors.ts`. No `testing.ts` until a
fake is needed by another spec's consumers.

## DI registration

```ts
// src/journals/tokens.ts
export const JournalsIndexToken = token<JournalsIndex>("JournalsIndex");

// src/journals/module.ts
export const journalsIndexModule: Module = {
  register(c) {
    c.bind(JournalsIndexToken).toClass(JournalsIndex); // default Container lifetime
  },
};
```

Zero-arg module — exported as a plain const value per
[[feedback_di_module_factories]]. Default lifetime omitted per
[[feedback_di_omit_default_lifetime]]. Registered in `main.ts`
between `settingsModule` and `CalendarModule` (registration order
doesn't matter for resolution; alphabetical-ish grouping keeps `main.ts`
readable).

## Testing strategy

Per [[feedback_test_hygiene]], [[feedback_one_behavior_per_test]],
[[feedback_nested_describes]], [[feedback_black_box_assertions]],
[[feedback_test_descriptions]], [[feedback_no_trivial_tests]],
[[feedback_no_wiring_tests]].

### `journal-index.test.ts`

```
describe("JournalIndex")
  describe("get")
    test("returns the path when anchor exists")
    test("returns None when anchor is absent")
  describe("set")
    test("overwrites the path when anchor already exists")
    test("does not duplicate the anchor in ordering after overwrite")
  describe("delete")
    test("removes the entry")
    test("is a no-op when anchor is absent")
  describe("clear")
    test("empties the index")
  describe("getRange")
    test("returns entries within an inclusive range")
    test("returns empty map when range starts after all entries")
    test("returns empty map when range ends before all entries")
    test("returns empty map when start is after end")
  describe("findNext")
    test("returns the next path when from is an existing anchor")
    test("returns the next path when from is between entries")
    test("returns None when from is at or past the last anchor")
    test("returns the first path when from is before any anchor")
  describe("findPrevious")
    test("returns the previous path when from is an existing anchor")
    test("returns the previous path when from is between entries")
    test("returns None when from is at or before the first anchor")
    test("returns the last path when from is after any anchor")
  describe("findClosestAnchor")
    test("returns the exact anchor when present")
    test("returns the first anchor when target is before the range")
    test("returns the last anchor when target is after the range")
    test("returns the previous anchor when target is between entries")
    test("returns None when the index is empty")
  describe("iteration")
    test("yields all entries in anchor order")
```

Skipped: empty-constructor tests, "method exists" tests, internal
`#sortedAnchors` shape tests (covered transitively by next/prev/range).

### `journals-index.test.ts`

```
describe("JournalsIndex")
  describe("register")
    test("indexes the entry under its journal")
    test("makes the entry retrievable by path")
    test("emits entryChanged with kind: added for a new path")
    test("identical re-registration emits nothing")
    test("re-registering a path with a new anchor emits removed for the old entry and added for the new")
    test("re-registering a path under a different journal removes it from the old journal")
    test("re-registering across journals emits removed for the old and added for the new")
  describe("unregister")
    test("removes the entry from its journal")
    test("removes the entry from path lookup")
    test("emits entryChanged with kind: removed")
    test("is a no-op when path is unknown")
  describe("transferPath")
    test("updates the path while keeping journal and anchor")
    test("makes the entry retrievable under the new path")
    test("emits removed for the old path and added for the new path")
    test("is a no-op when from path is unknown")
    test("is a no-op when from equals to")
  describe("clearJournal")
    test("removes all entries for the journal")
    test("removes those entries from path lookup")
    test("does not affect other journals")
    test("emits a single journalDirty for the cleared journal")
    test("does not emit per-entry entryChanged")
  describe("clear")
    test("empties every journal")
    test("emits journalDirty once per previously-known journal")
  describe("journalDirty coalescing")
    test("multiple register calls within one microtask emit one journalDirty per journal")
    test("changes across different journals emit one journalDirty each")
    test("entryChanged still fires synchronously per mutation during coalescing")
  describe("query passthroughs")
    test("get on an unknown journal returns None")
    test("getRange on an unknown journal returns an empty map")
    test("entriesFor on an unknown journal yields nothing")
```

Event-emission tests use a small inline listener that pushes payloads
into a local array. `journalDirty` coalescing tests resolve a promise
to flush the microtask queue (`await Promise.resolve()`).

### `journal-index.bench.ts`

Straight port of v2's three describe blocks (filling-in, find-next,
find-previous, find-closest) at 1y and 10y data scales. `JournalAnchorDate(d)`
becomes `d as AnchorString` (the helper is removed). `moment` import in
v2 stays — it's used to generate the test data set, not under test.

## Migration notes

- v2's `JournalAnchorDate` brand is dropped — `AnchorString` from
  `@/calendar` is used directly per the answered question.
- v2's `getAll(): string[]` is dropped; iteration covers the use case.
- v2's `findClosestDate(date: string)` (raw string in) becomes
  `findClosestAnchor(to: AnchorString)` (anchor in, anchor out).
  Callers that have a raw string brand it at the call site.
- v2's `deleteForPath` is removed from the per-journal index; the
  registry's `unregister(path)` replaces it.
- v2's `JournalsIndex` keeps its query passthroughs and mutation verbs
  but loses `getForPath` / `getForPathComputed` (rich projection — a
  separate later concern), `updateFromMetadata` (frontmatter parsing —
  needs the journal entity), and `onunload` (replaced by `clear()`,
  which a future wiring service calls on plugin teardown if needed).

## Open follow-ups (not in this spec)

- Vault / `metadataCache` event subscription service that drives the
  registry — depends on the journal entity to map `(path, frontmatter) →
(journalName, anchor)`.
- Journal entity port (custom-interval, fixed-interval, journal data,
  frontmatter contract).
- Vue composable bridge (`useJournalIndex(name)` / `useJournalEntries`)
  that subscribes to `journalDirty` and exposes a `ReadonlyMap` view.
- Rich note-metadata projection (`title`, `tags`, `tasks`, `properties`)
  as a separate service.
