# Domain context

Living glossary of the domain nouns and verbs this codebase reasons in. Use these
terms in design discussion, module names, and review. Added to as concepts
crystallize — not exhaustive.

## Calendar periods

**Period** — a calendar span with an anchor: `DayPeriod`, `WeekPeriod`,
`MonthPeriod`, `QuarterPeriod`, `YearPeriod`, `DecadePeriod`. All implement
`PeriodBase<Self>` (`start`/`end`/`anchor`, `next()`/`previous()`, `contains`,
`days()`, `format`). The union is `Period`; the tag is `PeriodKind`.

**periodOfKind(kind, date): Period** — the canonical kind→period factory. Given a
`PeriodKind` and a `CalendarDate`, returns the containing period of that kind.
The single home for "string/kind → which `Period` constructor", consolidating the
dispatches previously hand-rolled in `cycle.ts` (private `PERIOD_CTORS` table),
`ButtonItem`, `window-resolution`, and `period-buttons`. Callers that key on a
_narrower or different_ vocabulary (e.g. `ButtonLevel`, UI window strings,
`JournalWrite`) map to `PeriodKind` at their own edge before calling it — the
factory does not know those vocabularies.

**period window** — `window(focus, before, after): Self[]`: the run of periods
from `before` steps prior through `after` steps after `focus`, inclusive of
`focus` (length `before + after + 1`, focus at index `before`). Self-preserving:
`window(aMonthPeriod, …)` is `MonthPeriod[]`. Replaces the hand-rolled
before/after loops in the month- and week-calendar blocks.

**advance(period, steps): Self** — step a period by signed `steps` (negative =
`previous`, positive = `next`, 0 = same), Self-preserving. The atomic traversal
`window` is built on; also the primitive behind toolbar "navigate-step".

**SelfWriteGuard** — the echo-suppression concept between note creation and
auto-attach, named. When the plugin creates a journal note it must ignore the
vault `created` event its own write triggers (the note isn't in `JournalsIndex`
until Obsidian's `metadataCache` re-parses the freshly-written frontmatter —
`VaultSubscriptionService` indexes on `metadata-changed`, which lags the write by
an async, unobservable amount). `SelfWriteGuard` is a small DI service both
`NoteCreationService` (`mark`/`release`) and `AutoAttachService` (`suppresses`)
inject: `mark(path)` opens a time-boxed suppression window (5s — a conservative
cover for the metadata-cache indexing lag, **not** an arbitrary constant);
`AutoAttachService.#handle` bails on `suppresses(path)`. This replaced a hidden
`#expected` map + public `expects()`/`clearExpected()` bolted onto
`NoteCreationService` — note creation no longer owns auto-attach's suppression
concern. (A deterministic clear-on-`JournalsIndex.entryChanged "added"` is
possible and was deliberately deferred — the 5s window was kept byte-for-byte.)

> **Don't fuse by shape.** `periodForJournal(write, anchor)` maps a _journal
> write config_ to a period and carries a real domain rule (`custom → day`). It
> shares the _shape_ of `periodOfKind` but not the _concept_ — it keeps its own
> `match(write)`, with arms delegating to `periodOfKind`, rather than collapsing
> into the factory.

**JournalIndex / JournalsIndex (two-layer split — deliberate, decided 2026-06-08
not to merge).** `JournalIndex` (inner) is a **deep** per-journal data structure:
a `Map<anchor, path>` plus a binary-search-maintained `sortedAnchors` array,
giving ordered `getRange` / `findNext` / `findPrevious` / `findClosestAnchor` /
ordered iteration a plain map can't. It is performance-critical (see
`journal-index.bench.ts`). `JournalsIndex` (outer) is a **composite with its own
responsibilities** — a second index `#byPath`, the `entryChanged`/`journalDirty`
emitter, microtask dirty-batching, and the coordinating mutations
`register`/`transferPath`/`clearJournal`. Its `get`/`has`/`findNext`/… are not
pass-throughs but **parameterized adapters** (`journalName → its index`, `?? none`
= no such journal).

> Do not merge the two layers. The inner sorted-map can't be inlined without
> re-creating it per journal (per-journal `findNext` needs per-journal ordering,
> not a global composite key), and merging would fuse two distinct concerns. The
> separate `journal-index.test.ts` / `journals-index.test.ts` test each layer at
> its own interface — correct, not coupling.

## Views

**View block** — a registered, config-bearing entry in a `View`'s `blocks[]`
(`{ id, key, config }`). Block kinds are an **open DI registry**
(`ViewBlockDefinitionToken`): `key → config schema` is resolved at runtime, so a
view's stored `block.config` is typed `Record<string, unknown>` and **cannot** be
statically typed by `key`. Reaching a block's real config shape therefore requires
a runtime parse against that block kind's own schema — that parse, and the
config's invariants, belong in **that block kind's own module**, not in
`ViewsService`. (Don't re-suggest "just type the block configs" — the open
registry forbids it.)

**ToolbarItemsService** — owns the toolbar block's items concern end to end.
Injects the toolbar-item registry (`ToolbarItemDefinitionToken`); is the single
home for parsing a toolbar block's `config.items` (validated against the toolbar
block's `itemSchema` — the source of truth for `ToolbarItemInstance`, which is
`v.InferOutput`-ed, not re-declared), validating item config on update, and the
add/remove/move mutations (storage-free `View → blocks` transforms). `ViewsService`
delegates its five `*ToolbarItem*` methods to it (`repo.get → toolbarItems.op →
repo.update`) and no longer holds the item registry or the untyped `config.items`
casts; `ToolbarItemsList.vue` reads via `itemsOf`. The leak it closes: the
`config.items as …` + `Array.isArray` cast was hand-rolled in six places.

> **Don't fuse by shape (views).** `BlocksList` (manages a view's blocks) and
> `ToolbarItemsList` (manages a toolbar block's items) share a resolve-definition +
> move/remove/add row shape but are different concepts — kept separate. Likewise a
> `ToolbarItemInstance` is structurally identical to a `ViewBlockInstance`
> (`{ id, key, config }`) but is not (yet) treated as one type.

## Shelves

A journal belongs to **at most one shelf** — `ShelvesService.assign` enforces it by
removing the journal from every shelf before adding it to the target. Membership
_mutations_ live in `ShelvesService` (`assign` + the rename/delete cascade event
handlers). The membership _query_ "which shelf holds this journal" is
**`ShelvesService.shelfOf(journalName): string`** (`""` = on no shelf — `""` is a
safe sentinel since shelf names are non-empty). It is the single home for the
`find(s => s.journals.includes(name))?.name ?? ""` logic that was duplicated in
`PlaceJournalFlow` and `JournalShelfSection.vue`; both now call it (the component
inside a `computed`, reactive because the repo reads the reactive settings record).

> Reading a shelf's _own_ `journals` array (e.g. `ShelfEditSubpage`,
> `JournalsDashboardBlock` aggregation, `command-registry` write-type filtering) is
> legitimate entity access, **not** scattering — left as direct reads. Listing shelf
> names for a picker is plain repo enumeration and stays on the repository.

## Decorations

**Decision (decided against, 2026-06-08): decoration-condition dispatch stays as
exhaustive `match` per concern — not consolidated into a per-kind registry.** The
`JournalDecorationCondition` union is dispatched in four places: the engine's
`#check` (evaluate → boolean), `bulk-add`'s `#checkFilter`, `describeCondition`
(→ i18n string), and the settings UI (`ConditionItem.vue` component routing +
`conditionTypeOptions` allowed write types). A registry was considered and
rejected because:

> 1. Three of the four are already **compile-exhaustive** (`match().exhaustive()`)
>    and live in the right layer — adding a condition type fails to compile until
>    handled. The duplication is tedium, not drift risk.
> 2. `bulk-add` dispatches a **different union** (`FilterCondition` =
>    title/tag/property) for a different concept (filter notes, not decorate
>    cells); the shared check logic is already factored into `engine-checks`. Folding
>    it in would couple note-filtering to `date`/`weekday`/`offset`. Don't fuse by shape.
> 3. A full registry including the engine's evaluate would couple the decoration
>    **engine (domain)** to **UI** concerns (describe/component) or force two
>    parallel registries plus a uniform eval context most arms ignore.
>
> Known soft spot, deliberately accepted: `conditionTypeOptions` is a
> hand-maintained `Record<WriteType, ConditionType[]>` with no exhaustiveness — a
> new condition type is not forced into it. Low-traffic; revisit only if condition
> types start changing often.

## Journals

**JournalWrite / JournalConfig** — `JournalConfig` is the persisted,
schema-validated definition of one journal; `JournalWrite` is the discriminated
union at its core declaring _how often the journal produces an entry_: a **fixed**
interval (`day`/`week`/`month`/`quarter`/`year`) or a **custom** one (`every` unit
× `duration`, anchored at `anchorDate`). The config bundles the cadence with
`timeline`, `dateFormat`, `numbering`, `nameTemplate`, `folder`, `templates`,
`frontmatter` key names, `decorations`, and the `navBlock`/`intervalBlock`
definitions. A journal's identity key is its `name` (both `idKey` and `nameKey`);
renaming mutates the key in place and emits a dedicated `renamed` event.

**anchor / `anchorOf`** — an **anchor** is the `YYYY-MM-DD` string that uniquely
names _the period a date falls in_ for a given journal. It is the universal join
key — the index, numbering, timeline, note paths, and the calendar all key off it.
`CycleService.anchorOf(name, date)` maps any date to its owning period's anchor:
for fixed cycles via `periodOfKind` (the period's owning year/month matters, not a
naive `startOf` — the v2 cross-year week bug); for custom cycles by walking from
`config.anchorDate` in `duration`-sized steps. `""` is the sentinel for an unset
anchor (legitimately empty for `timeline.start` and `numbering.anchorDate` until
the user picks a date).

**`JournalCycle` / `CycleService`** — the stepping engine over a journal's periods:
`nextAnchor`, `previousAnchor`, `startOf`, `endOf`, `countRepeats` (signed),
`offsets`. Fixed cycles delegate boundary math to `periodOfKind`; custom cycles
compute it themselves.

> Custom intervals are **extensible**: a custom period can be manually grown or
> shrunk, recorded as the note's stored `endDate`. Stepping therefore **consults
> the index** (`#customNext`/`#customPrevious`) so `anchorOf`/`nextAnchor`/
> `previousAnchor` agree on irregular boundaries instead of computing phantom
> anchors from the nominal duration. Custom monthly stepping also preserves
> distance-from-month-end (Jan-31 → Feb-28 → Mar-31).

**`JournalNumbering` / `assignNumbers`** — assigns one or more named integer
sequences (`NumberingSource`: `variable` + `frontmatterKey` + `anchorValue` +
`reset` rule) to each period by counting cycle repeats from an anchor. Sources form
an **odometer**: an inner source's `reset: { kind: "after", count }` wrap propagates
a carry to the next-outer source ("week within month, resetting each month").
Numbers are computed relative to the nearest _previously stored_ entry's numbers
when available (so manual renumbering propagates forward), else from the global
`numbering.anchorDate`; `allowBefore: false` gives dates before the anchor no
numbers. Memoized per journal, invalidated on the index's `journalDirty` event.

**`JournalEntry` vs `JournalMetadata` vs _candidate_** — three layers of "what's in
this note", deliberately not fused:

> **`JournalEntry`** is _observed reality_ — what a note on disk claims
> (journalName, anchor, **path**, optional endDate/numbers), produced by
> `FrontmatterService.parseEntry` and stored in the index. **`JournalMetadata`** is
> _computed intent_ — what a period's frontmatter _should_ be, with **no path**,
> produced by `buildMetadata` from config + numbering. **candidate metadata** is the
> _reverse-parse_ — `NotePathService.candidateFor` runs the name/folder template
> backwards to recover an anchor from a file path, for auto-attach matching.
> `parseEntry` trusts frontmatter numbers as ground truth; `buildMetadata`
> recomputes them.

**connect / disconnect / `attachNote` / `ensureNote`** — the verbs binding notes to
periods. **connect** binds an _arbitrary existing_ note to a journal+anchor; the
anchor slot is exclusive (`AnchorOccupiedError` unless `override`). **disconnect**
strips the journal-owned frontmatter keys (falling back to
`DEFAULT_FRONTMATTER_KEYS` for orphans whose config is gone). **`attachNote`** writes
frontmatter and renders the template _only if the body is empty_ — the
non-destructive sibling of creation. **`ensureNote(name, metadata)`** is the single
idempotent materialization entry point, returning `{ path, created }`, every
self-initiated write wrapped in `SelfWriteGuard.mark` before writing and released on
failure. Bulk operations (`disconnectAll`/`deleteAll`/`reconnectAll`) are
best-effort: they snapshot paths up front and discard per-note failures.

**name-template round-trip (`NotePathService`)** — owns the bidirectional
period↔path mapping: `pathFor` renders `nameTemplate` + `folder` (forward);
`candidateFor` parses a path back to metadata (inverse). Folder and filename are
parsed **independently** because the template engine can't reconcile two date
bindings at different resolutions (`{{date:YYYY}}` in the folder vs `{{date}}` in
the filename) — the filename is canonical and wins on overlap.

**`JournalTimeline` / `TimelineService.contains`** — a journal's overall active
span: a `start` anchor plus an `end` of `never` | `date` | `repeats(count)`.
`contains(name, anchor)` is the gatekeeper for create/open/auto-attach/bulk-add,
gating on the period's **last day** (not its anchor) so a week straddling a
mid-week start stays in-bounds.

**auto-create vs auto-attach** — the two reactive automations, easily conflated.
**`AutoCreateService`** is a _timer_ firing at local midnight, creating today's
entry for every journal with `autoCreate: true`. **`AutoAttachService`** is a
_vault-event_ listener (created/renamed) that reverse-parses the path via
`candidateFor`, checks timeline bounds, and attaches — but **only when exactly one**
journal matches (ambiguity is logged and skipped), never for self-writes
(`SelfWriteGuard.suppresses`) or already-indexed paths. **`VaultSubscriptionService`**
keeps the index in sync with the vault and **fully rebuilds on the settings
`reloaded` event**, because an external settings sync changes configs with no vault
event.

**bulk add (`plan` → resolve → `apply`)** — a three-phase batch importer for
connecting a folder of existing notes. `plan` produces a `PlannedNote` per file —
either a `PlannedSkip` (typed `SkipReason`) or a `PlannedAction` carrying the
anchor, optional occupant, and per-axis dispositions that may be `"ask"` (deferred
to the user). `apply` consumes the now-concretized `ResolvedAction`s, supports
`dryRun` and a distinct **merge** mode, and _never rejects_ — failures land in the
`BulkLogEntry`.

**`JournalUriRequest` / `journal_link`** — the two cross-boundary addressing forms.
A `JournalUriRequest` is the `obsidian://` deep-link contract parsed into
`{ target, date, openMode }` (target = named journal or write-type; date =
`today`/absolute/relative `±N[dwmqy]`). `{{journal_link:other}}` is the
granularity-aware template cross-link to another journal's note for the same period:
when the target is _finer-grained_ than the host it bases off the host period's
`start_date`, otherwise off the anchor so cross-year periods resolve to their owning
year/month/quarter.

> The `JournalIndex`/`JournalsIndex` two-layer split and `SelfWriteGuard` are
> documented above under **Calendar periods** (they predate this section).

## Templates

The throughline of the whole feature: **render is total and forgiving; parse/invert
is partial and strict.**

**template / token / `TokenStream`** — a template is just a `string` of `{{…}}`
placeholders mixed with literal text; it is never a first-class type. `tokenize`
lexes it into a `TokenStream` of `Token`s — a discriminated union of `literal`,
`variable` (`{{name…}}`), and `function` (`{{name(arg)…}}`), each carrying
`modifiers`, optional `:format`, and its `raw` source slice. **Tokenization never
fails**: malformed or unclosed `{{` falls through to literal text, and an unresolved
token renders its `raw` verbatim, so an unknown `{{foo}}` survives untouched.

**`VariableSpec` vs `BoundValue`** — opposite-direction value unions that look
fusable but aren't:

> **`VariableSpec`** is a _render input binding_ — `string` | `number` | `date`
> (with `defaultFormat`, optional `invertible`) | `clock`. **`BoundValue`** is a
> _parse output_ — `string` | `number` | `date` only. The asymmetry is the point: a
> `clock` variable renders but **cannot** be recovered, and a `date` with
> `invertible: false` renders but matches as a wildcard. `Bindings`
> (`ReadonlyMap<string, BoundValue>`) is the result of a successful inversion.

**`TemplateContext` / `TemplateEngine`** — `TemplateContext` is an immutable
name→`VariableSpec` environment built fluently (`.string()/.number()/.date()/
.clock()`), the single resolution point for both render and parse. `TemplateEngine`
holds the `FunctionHandlerToken` registry and exposes `renderString`/`renderStream`
(total), `validate` (collects `ValidationProblem[]` without throwing), and `parse`
(inverts to `Bindings`, returns a `Result`).

**Modifier (shift & boundary)** — a `shift` (`+1w`, `-3d`) or `boundary`
(`<startOf=month>`). `applyModifiers` always applies **all shifts first, then all
boundaries**, regardless of written order (v2 semantics); `unapplyModifiers`
reverses shifts and treats boundaries as identity, which is what makes parsing
invertible. `Unit` (`y/q/m/w/d/h`) and `BoundaryUnit` (`year…decade/hour`) are two
distinct vocabularies.

**FunctionHandler** — a `{{name(arg)}}` token invokes a named, DI-registered
`FunctionHandler` (the `FunctionHandlerToken` multi-token). `src/templates` defines
the protocol; consuming features supply behavior — the only real handler is
journals' `journal_link`. A function token makes a template **not-invertible**, as
do unknown variables and clock variables (`TemplateParseError{kind:"not-invertible"}`).
`formatToRegexp` converts a moment-style date format into the matcher `parse` uses,
capturing locale data (month/weekday names) **once at module-import time** (v2
fidelity — runtime locale changes don't affect compiled patterns).

## Commands

**Command (`CommandConfig`)** — a user-authored, palette-invokable entry that opens
a journal note for a date computed relative to a reference date. It is
_configuration_, not a hard-coded plugin command: persisted as a settings
collection and materialized into real Obsidian commands (and optional ribbon
buttons) by the registry. Shape: `name`, `icon`, `showInRibbon`, `openMode`,
`target`, `type`, `context`.

**`CommandTarget` / `CommandType` / `CommandContext`** — the three selectors.
`CommandTarget` picks which journals open: `all` + `writeType`, `journal` +
`journalName` (its own write type authoritative), or `shelf` + `shelfName` +
`writeType`. `CommandType` is the temporal verb relative to the reference date:
`same`/`next`/`previous`, plus compound cross-period shifts (`same_next_week`,
`same_previous_month`…) decoded into a `CompoundShift {amount, unit}`.
`CommandContext` is the reference date: `today`, `open_note` (the active journal
note's date, else today), or `only_open_note` (which additionally _gates
availability_ — hidden unless a matching journal note is open). **`supportedTypes`**
is the write-type → allowed-`CommandType` filter (day allows all nine; month/quarter
add only year-shifts; week/year/custom only `same/next/previous`); unsupported
shifts are silently filtered, not errored.

**`DynamicCommandRegistry`** — the eager reconciliation engine keeping the host's
live command set in sync with the persisted collection. There is no imperative "add
this command" path: everything flows through persisted config → `#reconcile`, which
diffs against a serialized registration cache and re-registers only on change. It
re-reconciles on the settings `reloaded` event (external sync rewrites collections
silently) and cascades journal/shelf rename and delete onto dependent commands.

> **Availability and execution share one resolver** (`#plan`): the palette entry is
> visible iff a `CommandPlan` (a concrete `anchor` + `journalNames`) can be
> produced, and `#run` re-derives the same plan and returns early if none — a
> command never executes when its `check` would have hidden it.

## Notes-calendar

`notes-calendar` is **not** a view or leaf — it is the shared **calendar-grid
rendering primitive** consumed by `views/blocks/*-calendar` and `code-blocks/
timeline` alike. It owns the grid components, the cell behavior contract, the
active-entry marker, the write-type scope, and the today/active cosmetic appearance
— and it _feeds_ the decorations engine its visible periods without owning
evaluation.

**`NotesMonthView` / `NotesWeekView`** — a grid of period cells rendering **five
period kinds simultaneously** (day/week/month/quarter/year), each cell scoped to the
journals that _write_ that period. The container (which months/weeks, the
`refDate`/window) lives in each consumer; the grid takes a single `month`/`week`
period plus a `shelf`. Outside-month days are inert when `hideOutsideDates` is set.

**`NotesCellApi` (`useNotesCell`)** — a cell's verbs (`open`, `openContextMenu`,
`openPreview`, `isActive`, `isActionable`), all keyed by a `Period`. The calendar
reasons in **anchors, not paths**: date→note is `period.anchor` →
`JournalsIndex.entryByAnchor`. **`isActionable`** = some in-scope journal's timeline
`contains` the anchor (the "can a note exist here" predicate); `open` delegates to
journals' `OpenDateFlow`, never opening files directly — the date→note mapping is
owned by `journals`. **`ShelfScope` (`useShelfScope`)** partitions a shelf's (or all)
journals by which period each **writes** (`day`/…/`custom`/`all`) — this is why one
grid can independently scope its day, week, and header cells. **`ActiveEntryViewModel`**
is the reactive pointer to the open journal entry (`{ journalName, anchor }`) so the
matching cell renders active.

**appearance/ (distinct from decorations)** — a _separate, global, cosmetic_ concept
covering only the **today** and **active** cell highlights. `CalendarAppearanceBridge`
watches a settings slice and writes CSS custom properties onto the active document
body.

> **Don't fuse by shape.** Appearance reuses the decorations feature's
> `colorSchema`/`ColorSettings` primitives and surfaces as a dashboard block, so it
> _looks_ like a decoration — but it is a single global aesthetic, not
> journal-scoped, not condition-driven, applied as CSS vars rather than per-cell
> styles. Deliberately accepted: a popout opened after the last change won't pick up
> new colors until the next change.

## Code blocks

**`CodeBlockDefinition`** — a registered renderer for a fenced markdown language
(`{ keys, schema, component, cssClass }`, under `CodeBlockDefinitionToken`). Config
is parsed from the **fence body** against a valibot `schema`; the component receives
`{ path, config }` including the **host file path** the block lives in.

> **Don't fuse with View blocks.** A code block is keyed by markdown language
> string(s) and parses config from fence text; a `View block` is a stored
> `{ id, key, config }` entry resolved through `ViewBlockDefinitionToken`. Different
> registries, different concepts. (`keys` is a list because one renderer answers to
> several legacy v2 aliases — `journal-nav`/`calendar-nav`/`interval-nav`.)

**the `home` block (`journals-home`)** — a compact "jump to today's notes" link
strip, one `HomeItem` per configured period entry. Effective shelf is inferred from
the journal owning the host file when unset.

> **Don't fuse by shape (home items).** A _fixed_ period entry collapses **all**
> matching journals into **one** item labeled by a relative phrase ("Today", "This
> week") opening them together; a `"custom"` entry expands to **one item per custom
> journal**, labeled by the note's basename — custom journals have no shared
> relative vocabulary. Same `HomeItem` shape, two genuinely different build rules.

## Infrastructure primitives

Cross-cutting vocabulary the whole codebase reasons in. (Conventions for _using_
these — DI lifetimes, `attempt.in` idioms, the `errors.ts` rule — live in the
engineering notes, not here; this section names the concepts, not the house style.)

**`Result<T, E>` / `AsyncResult<T, E>` / `Option<T>`** — railway error handling: no
exceptions cross domain boundaries, failures are values. `Result` is `Ok | Err`;
`AsyncResult` is a `PromiseLike<Result>` that **never rejects** (every constructor
maps a rejection into `Err`); `Option` is `Some | None`, bridged to `Result` via
`okOr`/`okOrElse`. **`tap` is ok-only; `tapErr` is err-only** — branch dispatch
lives in the API, callers never inspect `kind` to fork.

**`attempt` / `attempt.in` (do-notation)** — generator-based do-notation linearizing
Result pipelines. `attempt.in(self, function* () { … })` binds `this` to `self` so
the body reaches `this.#field` without shadowing; `yield*` unwraps an ok value or
**short-circuits** the whole block on the first `Err`. Sync vs async is
auto-dispatched on the generator kind (sync → `Result`, async → `AsyncResult`), and
the error channel widens to the union of every `yield*` site. `InvariantError` is
thrown only if a short-circuited iterator is wrongly resumed — a "this is
impossible" guard, not a domain error.

**`Flow<P, R, E>` / `Flows`** — a flow is a single user-initiated, multi-step
operation as one class with one `execute(parameters): AsyncResult<R, E>` entry
point, living in a `.flow.ts` file. A _service_ owns persistent state and exposes
many methods; a _flow_ is a one-shot orchestration whose body is typically one
`attempt.in(this, async function*)` that injects services + modals and `yield*`s
through them. Flows compose by `yield*`-ing operations, not by nesting flow classes.
The **`Flows`** runner invokes a flow through DI and centralizes logging keyed off
error type — `UserAborted` (carrying its `source`) is logged as a benign outcome,
not a failure.

**`TypedEmitter<E>` / `Subscribable<E>`** — the typed event primitive (a thin
structural facade over `nanoevents`). A service holds a private `#emitter:
TypedEmitter<X>` and exposes `events: Subscribable<X>` (read-only `on`) so
collaborators subscribe but only the owner emits. `on` returns an unsubscribe
disposer. Event maps are defined per-owner, never centrally.

**DI: `Container` / `Module` / token / `Lifetime` / `inject` / `autoLoad`** — the
wiring layer. A `Module` (`register(c)`) contributes bindings; zero-arg modules are
a plain `const xModule: Module` value, a `createXxxModule(args)` **factory** is used
only when construction needs arguments (e.g. `createHostModule(plugin)`). Tokens are
opaque branded keys; a `MultiToken` resolves to an array (empty, never throws) while
an unregistered single token throws. `Lifetime` is `Container` (default, one per
container — never spelled out), `Scoped`, or `Transient`. `inject(token)` is
field-level injection valid **only during construction/resolution** (it reads an
ambient resolver stack) — DI is a boot/wiring tool, not a runtime service locator.
`.eager()` bindings are force-instantiated by a **separate `autoLoad()` step**, not
at container build. Vue components reach services only through `useService(token)`.

**Host (the Obsidian boundary)** — the layer wrapping Obsidian's runtime so feature
code never imports `obsidian` directly. Only host internals touch `TFile`/`App`/
`Plugin`; `obsidian-bridge` translates them into domain nouns (`Note`, `VaultPath`,
`OpenMode`, `NoteMetadata`). Each Obsidian-facing concern is a host service
(`NotesService`, `WorkspaceService`, `ModalService`, `CommandService`,
`CodeBlockService`, …). Two patterns recur: a **`defineXxx(input)`** builder returns
a plain definition object separate from the `XxxService` that registers/renders it
(modals use the curried `defineModal<TResult>()(input)` with a phantom `__result`
witness); and **imperative-with-`Disposer`** — a `register`/`attach`/`render` call
returns a `Disposer` the caller invokes to tear down (the idiom behind v3's dynamic
views). The unit suite fakes this boundary via `__mocks__/obsidian.ts`; the
**real** boundary (metadataCache timing, vault events, migration, interop) is the
job of e2e — see [`docs/e2e-testing-strategy.md`](docs/e2e-testing-strategy.md).

**Repository (`BaseRepository`)** — the persistence abstraction over a keyed entity
collection. Its `storage` is an **externally-owned reactive object** injected from
`SettingsService.recordOf(collection)` (a live Vue `reactive` slice handed out by
reference, mutated in place on settings refresh) — so repo reads/writes are reactive
and survive external syncs. Every mutation emits a `RepositoryEvents` event
(`created`/`updated`/`deleted`); `update` rejects changing the id key. `find()`
returns a **single-use lazy `RepositoryQuery`** over `[id, entity]` pairs (terminal
ops `first`/`list`/`options`/… consume the source — call `find()` again for a fresh
query). Concrete repos extend the events shape (journals adds `renamed`) and add
domain writes (`create`, `rename`).
