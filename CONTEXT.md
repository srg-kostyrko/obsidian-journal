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
