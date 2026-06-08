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
