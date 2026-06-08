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
