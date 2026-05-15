# v3 Journal Entity — Design

**Stage:** Journal core (timeline + numbering + frontmatter + vault sync) for the v3 plugin rewrite
**Date:** 2026-05-15
**Status:** Draft for review

## Purpose

The journal-index spec ([[2026-05-15-v3-journal-index-design]]) shipped an
empty registry: `JournalsIndex` keyed by `(journalName, anchor) → path`,
with events and query passthroughs but no writer and no semantics. This
spec delivers the four services that give the registry meaning and the
service that keeps it in sync with the vault:

- **`TimelineService`** — given a journal name + a date or anchor, answer
  containment ("is this in the journal's active range?") and boundary
  queries. Replaces v2's `Journal.#checkBounds` + `Journal.endDate`.
- **`CycleService`** — given a journal name + a date or anchor, answer
  cycle math: which anchor contains this date, what's the next/previous
  anchor, what dates does an anchor span, how many repeats between two
  anchors. Replaces v2's `FixedIntervalResolver` + `CustomIntervalResolver`
  - the parts of `Journal` that delegated to them.
- **`NumberingService`** — given a journal name + an anchor, produce the
  numbering values (Sprint 1, Release 4711, etc.). Replaces v2's
  `Journal.#resolveIndex` and generalizes to multi-source numbering for
  issue [#61](https://github.com/srg-kostyrko/obsidian-journal/issues/61).
- **`FrontmatterService`** — single source of truth for the frontmatter
  contract. Parses notes into `JournalEntry` values; produces write
  mutators for note-creation flows. Replaces both halves of v2's split
  contract (`JournalsIndex.updateFromMetadata` read; `Journal.#ensureFrontMatter`
  write).
- **`VaultSubscriptionService`** — the only writer to `JournalsIndex`.
  Subscribes to `NotesService` events, runs `FrontmatterService.parseEntry`,
  drives `register` / `unregister` / `transferPath`. Replaces v2's
  ad-hoc bridge in `JournalsIndex.updateFromMetadata` (which was wrong
  layer — the index shouldn't know about frontmatter or journals).

After this spec, the registry is populated, queryable, and answers
domain questions through four single-purpose services. Note IO (create,
open, ensure, connect, disconnect), command registration, decorations,
nav-block list mutators, autoCreate, rich note-metadata projection
(title/tags/tasks/properties), and the Vue composable bridge are
deferred to their own specs.

## Non-goals

- **No note IO.** `NotesService` is consumed for events and reads only.
  `create`, `open`, `connect`, `disconnect`, `clearNotes`, `deleteNotes`
  belong to a future note-IO spec.
- **No commands.** Command registration, command dispatch, and the
  `JournalCommand` config schema all defer. `CommandType` is not imported
  in this spec.
- **No decorations, nav blocks, or calendar-view blocks.** Schemas and
  mutators stay out; the config slices defer to their own specs.
- **No `autoCreate` / `confirmCreation`.** Those are note-IO triggers.
- **No template-context building or `nameTemplate` rendering.** The
  template-context port is a separate concern; this spec produces only
  the raw values (`anchor`, `start`, `end`, `numbers`) that a future
  template layer will consume.
- **No rich note-metadata projection.** `JournalEntry` carries
  identity-level fields only (`journalName`, `anchor`, `path`, optional
  `endDate`, optional `numbers`). Title, tags, tasks, properties belong
  to a separate projection service.
- **No Vue composable bridge.** `useTimeline(name)`, `useNumbering(name)`,
  etc. defer to the composables spec.
- **No v2→v3 migration code.** The schema is expressed in v3 terms; one
  lump-sum migration ships at v3 completion in a dedicated spec. Dev/test
  vaults use v3-shaped settings directly.
- **No journal identity beyond `name`.** Renames are handled as
  delete+create at the service-cache level (see "Lifecycle" below).
  Stable journal IDs are an explicit non-goal.
- **No "relative name" string** ("This week", "3 quarters ago").
  Belongs to a future display/template layer; cycle exposes the
  structural primitives needed to compute it.
- **No tests for DI wiring, schema shape, or migration declarations**
  (per [[feedback_no_wiring_tests]]). Migration _behavior_ is tested via
  the existing settings-migration test pattern when the lump-sum
  migration lands.

## Architecture

### Layout

```
src/journals/
├── index.ts                  # public barrel
├── types.ts                  # JournalEntry (extended), JournalMetadata, JournalsIndexEvents
├── errors.ts                 # JournalNotFoundError, JournalsError base
├── config.ts                 # JournalConfig schema + journalDefaultsFor()
├── journal-index.ts          # (existing) per-journal anchor → path map
├── journals-index.ts         # (existing) registry, with extended JournalEntry
├── timeline.ts               # TimelineService + JournalBounds value
├── cycle.ts                  # CycleService + JournalCycle union + buildCycle
├── numbering.ts              # NumberingService + cascade math
├── frontmatter.ts            # FrontmatterService (parseEntry, buildMetadata, writeMutator)
├── vault-subscription.ts     # VaultSubscriptionService
├── module.ts                 # journalsModule DI binding
└── testing.ts                # fake SettingsService factory, JournalConfig builder
```

Tests are colocated (`timeline.test.ts`, `cycle.test.ts`, etc.). No
`index.test.ts`, no `module.test.ts`, no `config.test.ts` (per
[[feedback_no_wiring_tests]]).

### Service responsibilities

Each service is independent — they don't import each other except where
explicitly noted in "Dependencies" below.

| Service                    | Reads from                                                          | Writes to       |
| -------------------------- | ------------------------------------------------------------------- | --------------- |
| `TimelineService`          | `SettingsService`, `CycleService`                                   | —               |
| `CycleService`             | `SettingsService`, `JournalsIndex`                                  | —               |
| `NumberingService`         | `SettingsService`, `CycleService`, `JournalsIndex`                  | —               |
| `FrontmatterService`       | `SettingsService`, `CycleService`, `NumberingService`               | —               |
| `VaultSubscriptionService` | `NotesService`, `app.metadataCache`, `FrontmatterService`, `Logger` | `JournalsIndex` |

`VaultSubscriptionService` is the **only writer** to `JournalsIndex` in
this spec. Future specs (note creation) will also call `register` /
`transferPath` indirectly through frontmatter writes that trigger
`metadata-changed` events.

Services read journal configs through
`settingsService.getCollection(journalConfigCollection).get(name)`,
returning `JournalConfig | undefined`. Each service maps `undefined`
to `None` in its own return value.

### Why no per-journal facade

We considered materializing a `Journal` aggregate per settings entry
(value or class), with the four pieces accessible as fields. Rejected:
that approach forces synchronization code on journal create, delete, and
rename (each event has to update or rebuild the aggregate). The chosen
service-style design lets each service treat a journal name as a lookup
key — creation is implicit, deletion orphans cache entries that are
ignored on next access, rename is delete+create at the cache level.

### Why no cycle/timeline cache

Journal type is fixed at creation (v2 behavior, preserved). Cycle and
bounds values are allocation-cheap (3-field object literals). Services
build them from current config on each call. The one exception is
`NumberingService`, where computing values walks the registry; that
service caches per-anchor results and invalidates on
`JournalsIndex.events.journalDirty`.

## Types

### `JournalEntry` (extension to existing)

```ts
interface JournalEntry {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly path: VaultPath;
  readonly endDate?: AnchorString;
  readonly numbers?: Readonly<Record<string, number>>;
}
```

`endDate` is present only when a note's `endDateField` frontmatter
differs from the cycle-computed end (i.e., the user manually extended a
custom interval). `CycleService` consults it for custom-variant
`nextAnchor` / `startOf` / `endOf`.

`numbers` is keyed by `NumberingSource.variable`. Present only when the
note has at least one numbering source value persisted in frontmatter.
`NumberingService` uses it as a basis for the stored-anchor
optimization.

### `JournalMetadata`

```ts
interface JournalMetadata {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly endDate?: AnchorString;
  readonly numbers?: Readonly<Record<string, number>>;
}
```

The same shape as `JournalEntry` minus `path`. Built by
`FrontmatterService.buildMetadata` for note-creation flows; written via
`FrontmatterService.writeMutator`.

### `JournalCycle`

```ts
type JournalCycle =
  | { readonly kind: "fixed"; readonly period: PeriodKind }
  | {
      readonly kind: "custom";
      readonly every: PeriodKind;
      readonly duration: number;
      readonly anchor: AnchorString;
    };
```

A pure value built from `config.write` by `buildCycle`. The custom
variant does not carry a `JournalsIndex` reference — extension-aware
lookups happen on the service, not the value.

### `JournalBounds`

```ts
type JournalBoundsEnd = { kind: "never" } | { kind: "date"; date: CalendarDate } | { kind: "repeats"; count: number };

interface JournalBounds {
  readonly start: CalendarDate;
  readonly end: JournalBoundsEnd;
}
```

Built from `config.timeline`.

### `NumberingSource` / `JournalNumberingConfig`

```ts
type NumberingReset = { kind: "never" } | { kind: "after"; count: number };

interface NumberingSource {
  readonly variable: string; // unique within sources[]; template var name
  readonly frontmatterKey: string; // unique within sources[]; frontmatter field name
  readonly anchorValue: number;
  readonly reset: NumberingReset;
}

interface JournalNumberingConfig {
  readonly enabled: boolean;
  readonly anchorDate: AnchorString;
  readonly allowBefore: boolean;
  readonly sources: readonly NumberingSource[]; // outer (slowest) → inner (fastest)
}
```

### `FrontmatterFields`

```ts
interface FrontmatterFields {
  readonly dateField: string; // default "journal-date"
  readonly startDateField: string; // default "journal-start-date"
  readonly endDateField: string; // default "journal-end-date"
  readonly addStartDate: boolean;
  readonly addEndDate: boolean;
}
```

No `indexField` — numbering sources own their own `frontmatterKey`.

The `journal` frontmatter key (the owning-journal identifier) is a
module-level constant `FRONTMATTER_NAME_KEY`. Not configurable per
journal in v2 either.

### `JournalConfig`

```ts
interface JournalConfig {
  name: string;
  write: FixedWriteIntervals | WriteCustom;
  timeline: {
    start: AnchorString;
    end: { kind: "never" } | { kind: "date"; date: AnchorString } | { kind: "repeats"; count: number };
  };
  dateFormat: string;
  frontmatter: FrontmatterFields;
  numbering: JournalNumberingConfig;
}
```

`FixedWriteIntervals` and `WriteCustom` shapes are inherited from v2's
schema (preserved for v2-fidelity), declared in `config.ts`.

UI-bound fields (`nameTemplate`, `folder`, `templates`,
`confirmCreation`, `autoCreate`, `commands`, `decorations`, `navBlock`,
`calendarViewBlock`, `shelves`) are intentionally absent. Future specs
add them.

## Public API

### `TimelineService`

```ts
class TimelineService {
  contains(name: string, anchor: AnchorString): boolean;
  startOf(name: string): Option<CalendarDate>;
  endOf(name: string): Option<CalendarDate>;
}
```

- `contains` for `end.kind === "never" | "date"`: pure date comparison.
- `contains` for `end.kind === "repeats"`: `cycleService.countRepeats(name, start, anchor) < count`. Cycle-aware, so custom-interval extensions are honored.
- `startOf`: returns `Some(start)`; `None` if the journal name is unknown.
- `endOf`: returns `None` only for `end.kind === "never"`. For `"date"`, returns `Some(date)`. For `"repeats"`, returns `Some(end)` computed live by stepping `cycleService.nextAnchor` `count - 1` times from `start`'s anchor, then taking `cycleService.endOf` of the final anchor. O(count); acceptable for date-picker use (typical counts in the dozens-to-hundreds).

### `CycleService`

```ts
class CycleService {
  anchorOf(name: string, date: CalendarDate): Option<AnchorString>;
  nextAnchor(name: string, from: AnchorString): Option<AnchorString>;
  previousAnchor(name: string, from: AnchorString): Option<AnchorString>;
  startOf(name: string, anchor: AnchorString): Option<CalendarDate>;
  endOf(name: string, anchor: AnchorString): Option<CalendarDate>;
  offsets(name: string, date: CalendarDate): Option<readonly [positive: number, negative: number]>;
  countRepeats(name: string, from: AnchorString, to: AnchorString): Option<number>;
}
```

Method semantics match v2's `AnchorDateResolver` interface with three
shape changes:

- All methods return `Option<…>` — `None` when the journal name is
  unknown, when the input date is invalid, or when the requested anchor
  is outside the journal (where v2 returned `null` or `[0, 0]`).
- No boolean trap: `nextAnchor` / `previousAnchor` step the cycle only.
  Registry-aware "find next stored note" lives on `JournalsIndex`
  directly (`findNext` / `findPrevious`).
- The string + brand approach (`JournalAnchorDate`) is dropped in
  favour of `AnchorString` from `@/calendar`.

### `NumberingService`

```ts
class NumberingService {
  assignNumbers(name: string, anchor: AnchorString): Option<Readonly<Record<string, number>>>;
}
```

Returns the cascade-computed numbering dictionary keyed by
`NumberingSource.variable`. `None` when:

- The journal name is unknown.
- `config.numbering.enabled === false`.
- `config.numbering.allowBefore === false` and `anchor < anchorDate`.

### `FrontmatterService`

```ts
class FrontmatterService {
  parseEntry(path: VaultPath, frontmatter: Record<string, unknown>): Option<JournalEntry>;
  buildMetadata(name: string, anchor: AnchorString): Result<JournalMetadata, JournalNotFoundError>;
  writeMutator(
    name: string,
    metadata: JournalMetadata,
  ): Result<(fm: Record<string, unknown>) => void, JournalNotFoundError>;
}
```

### `VaultSubscriptionService`

```ts
class VaultSubscriptionService {
  initialize(): AsyncResult<void, never>;
  [Symbol.asyncDispose](): Promise<void>;
}
```

Called from `main.ts` once, after `SettingsService.initialize()`
succeeds. Performs the initial vault walk and wires ongoing event
subscriptions.

## Internals

### `CycleService` — fixed variant

Delegates to v3 `Period` types:

- `anchorOf`: `Period.containing(date)` → `period.anchor` (year-correct
  for week — replaces v2's hand-written cross-year branch).
- `nextAnchor`/`previousAnchor`: `period.next().anchor` / `period.previous().anchor`.
- `startOf`/`endOf`: `period.start` / `period.end`.
- `offsets`: anchor-relative day deltas via `period.start.diff(date, "days")` analogues.
- `countRepeats`: `Math.abs(period.diff(other, "...units...))` — implementation chooses the closed form per `PeriodKind`.

The `PeriodKind` → `Period` constructor mapping is a small dispatch
table (`{ day: DayPeriod.containing, week: WeekPeriod.containing, ... }`).
No `match()` needed because the dispatch is by string lookup.

### `CycleService` — custom variant

Pure step math when no extensions exist:

- `anchorOf(date)`: floor((date − anchor) / step) → step start.
- `nextAnchor(from)`: `startOf(from) + step`.
- `previousAnchor(from)`: `startOf(from) − step`.
- `startOf(anchor)`: equals `anchor` (custom anchors are start dates).
- `endOf(anchor)`: `anchor + step − 1 day`.
- `countRepeats(from, to)`: `floor((to − from) / step)` with sign.

Extension-aware lookups:

- `endOf(anchor)`: if `JournalsIndex.entryByAnchor(name, anchor)` has
  `endDate`, return that instead of the computed end.
- `nextAnchor(from)`: same — if the current step has an extended
  `endDate`, the next anchor is `endDate + 1 day` rather than the
  computed step boundary.

The `endOf(anchor)` extension lookup uses a new method on
`JournalsIndex`: `entryByAnchor(name, anchor): Option<JournalEntry>`.
Today's registry exposes `get(name, anchor)` which returns `Option<VaultPath>`;
we add `entryByAnchor` returning the full entry. (Implementation note:
`entryByPath` already exists and returns the full entry; this is the
symmetric query.)

Month-end clipping (v2's `#advanceDate` / `#retractDate` quirk: a
custom monthly cycle starting on the 30th lands on the 28th/29th in
February) is preserved verbatim.

No iteration safety cap. v2's `if (count > 10) break;` is removed —
the new implementation terminates on "step crossed target" with an
explicit invariant.

### `TimelineService` — `endOf` for `"repeats"`

Walks `cycleService.nextAnchor(name, current)` `count - 1` times from
`anchorOf(name, start)`, then returns `cycleService.endOf(name, finalAnchor)`.
Honors custom extensions because each step consults `JournalsIndex`.

### `NumberingService` — cascade math

For a single call to `assignNumbers(name, anchor)`:

1. Load `config.numbering`. If `enabled === false` → `None`.
2. If `allowBefore === false` and `anchor < anchorDate` → `None`.
3. Compute `steps_innermost = cycleService.countRepeats(name, anchorDate, anchor)`.
4. For source `i` (from innermost to outermost): compute `steps_i`:
   - Innermost: `steps_innermost`.
   - Outer: `floor(steps_inner / product_of_inner_reset_counts)`. If any
     inner source has `reset.kind === "never"`, all sources outside it
     get `steps_i = 0` (they never advance because no inner reset
     happens — `value = anchorValue` forever, which is a valid config).
5. For source `i`: `raw = anchorValue_i + steps_i`. If
   `reset.kind === "after"`: `value = ((raw - anchorValue_i) mod count) + anchorValue_i`.
   Else: `value = raw`.
6. Return `Some({ [source.variable]: value, ... })`.

### `NumberingService` — stored-basis optimization

Before step 3 above, ask `JournalsIndex.findPrevious(name, anchor)` for
the nearest stored entry. If hit and `entry.numbers` present, compute
the result by taking the delta from the entry's anchor to the queried
anchor (a partial cascade walk: only sources that step between the two
anchors change values). Avoids walking back to `anchorDate` on every
call.

### `NumberingService` — cache

`Map<string, { fp: string; values: Map<AnchorString, Readonly<Record<string, number>> | null> }>`.
The outer map is keyed by journal name; the inner by anchor. The `fp`
is a fingerprint of `config.numbering` (JSON of the relevant slice).
Cache miss when `fp` changes (handles settings edits).

The inner map is cleared on `JournalsIndex.events.journalDirty` for
that journal name. This fixes v2's stale-cache bug — `#dateIndexCache`
in v2 was cleared only on `dispose()`, so adding/removing notes left
stale entries.

### `FrontmatterService.parseEntry`

1. Read `frontmatter[FRONTMATTER_NAME_KEY]`. Missing or non-string → `None`.
2. Look up journal config by name. Missing → `None`.
3. Read `frontmatter[config.frontmatter.dateField]`. Validate via
   `CalendarDate.parse`. Invalid → `None`.
4. If `addEndDate` and `frontmatter[endDateField]` is set and valid:
   include `endDate` (validated as an anchor). Invalid `endDate` is
   silently dropped — the entry stays valid.
5. For each `numbering.sources[i]`: read `frontmatter[source.frontmatterKey]`.
   If a finite number, include in `numbers` dictionary under
   `source.variable`. Partial coverage is fine.
6. Return `Some({ journalName, anchor, path, endDate?, numbers? })`.

Pure projection — no calls to cycle, numbering, or timeline. Just
config lookup and field reads.

### `FrontmatterService.buildMetadata`

1. Resolve config; `None` → `Err(JournalNotFoundError)`.
2. Compute `metadata.numbers = numberingService.assignNumbers(name, anchor)`.
3. Determine `metadata.endDate`: compare `cycleService.endOf(name, anchor)`
   to the default (computed-from-step) end. If different (i.e., an
   extension exists), include the extended value. Otherwise omit.
4. Return `Ok({ journalName: name, anchor, endDate?, numbers? })`.

### `FrontmatterService.writeMutator`

Returns a closure for `NotesService.updateFrontmatter`:

```ts
(fm) => {
  fm[FRONTMATTER_NAME_KEY] = name;
  fm[fields.dateField] = anchor;

  if (fields.addStartDate) fm[fields.startDateField] = cycleService.startOf(name, anchor).toAnchor();
  else delete fm[fields.startDateField];

  const hasExtension = metadata.endDate !== undefined;
  if (fields.addEndDate || hasExtension) {
    fm[fields.endDateField] = metadata.endDate ?? cycleService.endOf(name, anchor).toAnchor();
  } else {
    delete fm[fields.endDateField];
  }

  for (const source of config.numbering.sources) {
    const value = metadata.numbers?.[source.variable];
    if (value === undefined) delete fm[source.frontmatterKey];
    else fm[source.frontmatterKey] = value;
  }
};
```

The closure captures `name`, `metadata`, and the resolved config
snapshot. Re-issuing requires another `writeMutator` call.

### `VaultSubscriptionService.initialize`

```ts
class VaultSubscriptionService {
  readonly #unsubscribes: Array<() => void> = [];

  initialize(): AsyncResult<void, never> {
    for (const path of this.#notes.allMarkdownNotes()) {
      const file = this.#app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const fm = this.#app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm) continue;
      this.#frontmatter.parseEntry(path, fm).tap((entry) => this.#index.register(entry));
    }

    this.#unsubscribes.push(
      this.#notes.events.on("metadata-changed", (path) => this.#onMetadataChanged(path)),
      this.#notes.events.on("renamed", ({ from, to }) => this.#index.transferPath(from, to)),
      this.#notes.events.on("deleted", (path) => this.#index.unregister(path)),
      // "created" intentionally not subscribed — "metadata-changed" fires after creation.
    );

    return AsyncResult.ok(undefined);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
  }
}
```

The container calls `Symbol.asyncDispose` on plugin teardown (per the
DI binding lifecycle), which unwires all NotesService subscriptions.

`#onMetadataChanged(path)`: read `getFileCache(path).frontmatter`, run
`parseEntry`, `Some` → `register`; `None` → `unregister`.

The initial walk + ongoing events have a tiny race window — a
`metadata-changed` during the walk could double-register the same
path. `JournalsIndex.register` is idempotent for unchanged entries
(early-return when name and anchor match), so this is a no-op in
practice.

Parse failures during the walk and during event handling are silently
dropped (returned as `None` from `parseEntry`). The logger records a
`debug` line per drop, not `warn` — malformed personal-vault
frontmatter is normal.

## Lifecycle and config changes

### Journal creation

No service-level action. First lookup (`cycleService.anchorOf(name, ...)`,
etc.) reads the new config and builds whatever the call needs.

### Journal deletion

No service-level action. Lookups under the dead name return `None`
(settings lookup misses). Any cached numbering entries for the dead
name are orphaned in `NumberingService.#cache` until evicted on
access; eviction happens at the outer-map level when a lookup misses.

### Journal rename

v2 behavior: rename rewrites the `FRONTMATTER_NAME_KEY` value in every
note belonging to the journal. That bulk rewrite belongs to a future
note-IO spec (it's the same kind of operation as v2's
`renameFrontmatterField`). From the services' POV, the rename is
delete-of-old-name + create-of-new-name, both handled lazily.

### Config edits

- `config.write` changes: v2 enforces "type is immutable" — UI does not
  allow switching `fixed` ↔ `custom`. Within-type edits to
  `WriteCustom.duration` / `anchorDate` are reflected by next lookup
  (cycles are built fresh per call).
- `config.timeline` / `config.numbering` / `config.frontmatter` edits:
  reflected by next lookup. `NumberingService` cache invalidates via
  fingerprint mismatch.

## DI registration

```ts
export const journalsModule: Module = {
  register(c) {
    c.register(JournalsIndex).useClass(JournalsIndex);
    c.register(TimelineService).useClass(TimelineService);
    c.register(CycleService).useClass(CycleService);
    c.register(NumberingService).useClass(NumberingService);
    c.register(FrontmatterService).useClass(FrontmatterService);
    c.register(VaultSubscriptionService).useClass(VaultSubscriptionService).eager();
  },
};
```

`journalsModule` replaces `journalsIndexModule` from the journal-index
spec — same `JournalsIndex` binding, bundled with the rest. `main.ts`:

```ts
container.addModule(journalsModule); // was: journalsIndexModule
// ... after settings.initialize() succeeds:
await container.resolve(VaultSubscriptionService).initialize();
```

Eager binding on `VaultSubscriptionService` ensures the container
constructs it during `autoLoad`; the explicit `initialize()` call wires
subscriptions and runs the initial walk after settings is ready.

Per [[feedback_di_module_factories]], zero-arg module → plain `const`
value, no factory. Per [[feedback_di_omit_default_lifetime]], no
`.lifetime(Lifetime.Container)` — Container is the default.

## Defaults

`journalDefaultsFor(write): JournalConfig` lives in `config.ts`.
Returns a complete `JournalConfig` with type-appropriate defaults.

Type-dependent fields in this spec's scope:

| Field                   | Day / Week / Month / Quarter / Year               | Custom                                                                                               |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `dateFormat`            | per-type per v2 (`YYYY-MM-DD`, `YYYY-[W]w`, etc.) | `YYYY-MM-DD`                                                                                         |
| `numbering.enabled`     | `false`                                           | `true`                                                                                               |
| `numbering.anchorDate`  | `config.timeline.start`                           | `write.anchorDate`                                                                                   |
| `numbering.allowBefore` | `false`                                           | `false`                                                                                              |
| `numbering.sources`     | `[]`                                              | `[{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }]` |

Type-independent defaults:

- `timeline.start`: empty (caller-supplied at creation time).
- `timeline.end`: `{ kind: "never" }`.
- `frontmatter`: `{ dateField: "journal-date", startDateField: "journal-start-date", endDateField: "journal-end-date", addStartDate: false, addEndDate: false }`.

`defineCollection("journals", schema, (id) => journalDefaultsFor({ type: "day" }))` —
the collection's default factory uses daily defaults for the corruption
fallback path. The full type-aware function is used at journal-creation
time in the future UI spec.

Type-dependent defaults outside this spec's scope (`nameTemplate`,
`navBlock`, `calendarViewBlock`, `decorations`) are added by their
respective future specs and folded into `journalDefaultsFor` at that
time.

## Errors

```ts
// errors.ts
export class JournalsError extends Error {}

export class JournalNotFoundError extends JournalsError {
  constructor(readonly journalName: string) {
    super(`Journal not found: ${journalName}`);
  }
}
```

Only `FrontmatterService.buildMetadata` and `writeMutator` return
`Result` with `JournalNotFoundError`. Cycle / Timeline / Numbering use
`Option` (no answer = `None`), matching their query-style semantics.

## Testing strategy

Per [[feedback_testing_dir_layout]], [[feedback_one_behavior_per_test]],
[[feedback_black_box_assertions]], [[feedback_nested_describes]],
[[feedback_no_baked_in_error_simulation]].

### `cycle.test.ts`

`CycleService` with a fake `SettingsService` (in-memory configs) + real
`JournalsIndex`. Nested describes: per method × per cycle kind.

Fixed-variant cases:

- `anchorOf` for week containing 2020-12-30 returns the year-2020
  anchor, but for 2020-12-31 returns the year-2021 anchor (regression
  for [[project_v2_week_anchor_bug]]).
- `nextAnchor` / `previousAnchor` round-trip for each `PeriodKind`.
- `offsets` returns positive/negative deltas matching v2 behavior.
- `countRepeats` is symmetric (`|count(a, b)| === |count(b, a)|`).

Custom-variant cases:

- `anchorOf` lands on `write.anchorDate` for dates in the first step,
  on `anchorDate + step` for the second, etc.
- `endOf(anchor)` returns the cycle-computed end when no entry exists,
  returns the stored `endDate` when one does.
- `nextAnchor` after an extended interval starts at `endDate + 1 day`,
  not `step boundary`.
- Month-end clipping: monthly cycle starting 2024-01-30 lands on
  2024-02-29 (leap year), then 2024-03-30.

### `timeline.test.ts`

`TimelineService` with fake settings + real `CycleService`.

- `contains(name, anchor)` for each `end.kind`:
  - `never`: `anchor >= start` → true; `anchor < start` → false.
  - `date`: bounded both sides.
  - `repeats`: bounded by count, honors custom extensions (extended
    interval consumes one repeat slot).
- `startOf` returns `None` for unknown name, `Some(start)` otherwise.
- `endOf` returns `None` for `never`, `Some(date)` for `date`,
  `Some(computed)` for `repeats`.
- `endOf` for `repeats` honors a stored extension (computed end shifts
  later when one interval is extended).

### `numbering.test.ts`

`NumberingService` with fake settings + real `CycleService` + real
`JournalsIndex`.

Single-source (v2-compat):

- `enabled: false` → `None`.
- `allowBefore: false`, anchor before `anchorDate` → `None`.
- `reset.kind === "never"`: monotonic increment from `anchorValue`.
- `reset.kind === "after", count: 4`: values cycle 1→2→3→4→1→2→...

Multi-source cascade:

- Two sources `[release{anchorValue: 4711, reset: never}, sprint{anchorValue: 1, reset: after 6}]`:
  - anchor `start`: `{ release: 4711, sprint: 1 }`.
  - anchor `start + 6 steps`: `{ release: 4712, sprint: 1 }`.
  - anchor `start + 13 steps`: `{ release: 4713, sprint: 2 }`.

Stored-basis optimization:

- After `JournalsIndex.register({ ..., numbers: { release: 4715, sprint: 3 } })`
  at anchor X, computing for `X + 1` step uses the stored basis (assert
  observable correctness — values match the cascade — not the
  optimization path itself).

Cache invalidation on `journalDirty`:

- Compute values, register a new entry that changes the basis, compute
  again — second result reflects the change.

Degenerate config:

- Outer source exists, innermost has `reset.kind === "never"` → `None`.

### `frontmatter.test.ts`

`FrontmatterService` with fake `SettingsService`, real `CycleService`,
real `NumberingService`.

`parseEntry`:

- Missing `FRONTMATTER_NAME_KEY` → `None`.
- Unknown journal → `None`.
- Invalid date → `None`.
- Valid date, no end date, no numbers → `Some({ journalName, anchor, path })`.
- Valid date with extension → `Some({ ..., endDate })`.
- Valid date with partial numbers (one source present, one missing) →
  `Some({ ..., numbers: { [present]: value } })`.

`buildMetadata`:

- Unknown journal → `Err(JournalNotFoundError)`.
- Known journal, fixed cycle, numbering off → `Ok({ ..., numbers: undefined })`.
- Known journal, custom cycle, extended interval → `Ok({ ..., endDate })`.

`writeMutator`:

- Sets `FRONTMATTER_NAME_KEY` and `dateField`.
- `addStartDate: true` writes `startDateField`; `false` deletes it.
- Extension present writes `endDateField` even when `addEndDate: false`.
- Each numbering source's `frontmatterKey` is written when value present,
  deleted when absent.

### `vault-subscription.test.ts`

`VaultSubscriptionService` with fake `NotesService` emitter + fake
`app.metadataCache` + real `JournalsIndex` + real `FrontmatterService`.

- `initialize()` walks fake notes and registers parseable ones.
- Emitting `metadata-changed` on a registerable path calls `register`.
- Emitting `metadata-changed` on a no-longer-parseable path calls `unregister`.
- Emitting `renamed` calls `transferPath`.
- Emitting `deleted` calls `unregister`.
- Emitting `created` does nothing (no `register` until `metadata-changed`).
- Initial walk + concurrent `metadata-changed` for the same path → final
  registry state is correct (single entry, no duplicates — covered by
  `JournalsIndex.register` idempotence).

### `testing.ts`

Exports:

- `createFakeSettings(journals: Record<string, JournalConfig>): SettingsService`
  — minimal fake exposing `journals.get(name)`.
- `journalConfig(overrides: Partial<JournalConfig>): JournalConfig` —
  builder with sensible defaults (daily fixed, no numbering, no end).
- `customJournalConfig(overrides): JournalConfig` — builder with
  custom cycle defaults.

No test-local stubs. No `vi.spyOn`-based error simulation in fakes (per
[[feedback_no_baked_in_error_simulation]]) — tests inject errors via
`vi.spyOn` on real services when needed.

## Migration notes

No v2→v3 migration is registered in this spec. The schema is expressed
in v3-native terms (`numbering`, `timeline`, `end.kind`, etc.). A
dedicated migration spec at v3 completion will produce the lump-sum
v1→v3 migration covering all settings slices at once.

Until then, dev/test vaults populate settings with v3-shaped configs
directly (the test `journalConfig` builder handles this for tests).

## Open follow-ups (not in this spec)

- **Note-IO service**: create, open, ensure, connect, disconnect,
  clearNotes, deleteNotes, rename-frontmatter-field bulk rewrite. Uses
  `FrontmatterService.writeMutator` + `NotesService` directly.
- **Commands feature**: `JournalCommand` schema, command registration
  with `AppManager`, command dispatch (uses `CycleService` primitives).
- **Decorations / nav-block / calendar-view-block features**: each its
  own config slice and (likely) a separate service.
- **Template-context port**: `nameTemplate`, `folder`, `templates`,
  `relativeName` strings. Consumes `CycleService` + `NumberingService`
  - `FrontmatterService.buildMetadata`.
- **Rich note-metadata projection** (title, tags, tasks, properties).
  Separate service consuming `app.metadataCache` independently of
  `VaultSubscriptionService`.
- **Vue composable bridge**: `useTimeline(name)`, `useCycle(name)`,
  `useNumbering(name)`, `useJournalEntries(name)`. Subscribes to
  `JournalsIndex.journalDirty` and exposes reactive views.
- **Lump-sum v2→v3 migration**: covers all settings slices in one
  registered `Migration`.
