# v3 Calendar — Design

**Stage:** Calendar (date/time) infrastructure for the v3 plugin rewrite
**Date:** 2026-05-13
**Status:** Draft for review

## Purpose

Give v3 an immutable, period-aware date layer. v2 used moment.js directly
across the codebase, which caused four recurring pains:

1. **Mutation leaks.** ~38 `.clone()` calls scattered through the code, and
   at least two places that skip cloning and mutate caller state
   (`journals/fixed-interval.ts:29, 36` mutates `baseDate` before passing
   it on; `utils/template.ts:24-55` mutates its `date` parameter).
2. **No enclosed-period concept.** Week/month/quarter/year ranges are
   reconstructed from `(startOf, endOf, contains?, iterate)` at every call
   site. Same pattern duplicated across `use-month.ts`, `use-week.ts`,
   `use-year.ts`, `use-quarter.ts`, `use-decade.ts`, `calendar.ts:106-170`.
3. **Cross-year week-anchor bug** (see [[project_v2_week_anchor_bug]]).
   `{{date:YYYY}}` for a Dec-30 → Jan-5 week rendered the start's year,
   ignoring locale week-owner semantics.
4. **Locale-as-global-state.** `moment.updateLocale()` mutates global moment
   state; tests and feature code couldn't isolate calendar configuration.

This stage delivers the date primitives only. Journal-period semantics
(fixed-interval / custom-interval resolution, frontmatter date fields,
journal active-range constraints) are Layer B and ship with the journal
feature module.

The deliverables are `CalendarDate`, the `Period` union with six
granularity-tagged subtypes, `Clock`, `Interval`, `OpenInterval`, the
`Calendar` eager class, and a `CalendarModule`. Each type wraps a private
moment instance configured against a custom locale; consumers never see a
raw moment.

## Non-goals

- No Layer B. Fixed-interval, custom-interval, week-anchor template
  resolution, and frontmatter date fields belong to the journal feature
  module's own spec.
- No range algebra: no `Interval.overlaps`, no `Interval.union`/`intersect`,
  no `Period.contains(Period)`. v2 doesn't exercise any of these.
- No `daysBetween(d1, d2)` / interval length. Add when a caller needs it.
- No arithmetic on `CalendarDate`. v2 audit shows every `.add`/`.subtract`
  call site maps to `Period` operations: iteration via `Period.days()`,
  adjacency via `period.next().start`, multi-unit navigation via the
  appropriate `Period.next`/`previous` (including `DecadePeriod.previous()`
  for the picker's "subtract 10 years" case).
- No `Period.shift(n)`. Every v2 navigation is ±1 of some granularity;
  `DecadePeriod` covers the only multi-year-step case.
- No `OpenInterval.unbounded()`. Both-ends-open is degenerate.
- No `OpenInterval.days()`. Iterating an unbounded interval is undefined.
- No `format(pattern)` on `Interval` or `OpenInterval`. There is no canonical
  anchor to format against; callers that want pretty-printing format
  `interval.start` / `interval.end` directly.
- No `Clock` arithmetic, parsing, or comparison. Templates need
  `Clock.now()` and `format(pattern)`; nothing else.
- No settings-driven calendar config. Settings push to `Calendar` when
  that module lands; the contract is one-way ("settings → Calendar"), not
  "Calendar pulls from settings."
- No timezone API. Plain dates have no TZ; `Clock.now()` uses local time.
- No serialization beyond `toAnchor()`. JSON/plugin-state concerns belong
  to whichever feature stores the value.
- No locale auto-follow. v3 default is `"custom-journal-locale"` with ISO
  8601 week (Mon-start, doy=4). User-locale follow is a future settings
  toggle.

## Architecture

### Layout

```
src/calendar/
├── index.ts              # public barrel
├── types.ts              # AnchorString brand
├── errors.ts             # DateTimeError, ParseError, IntervalError
├── calendar.ts           # internal: localMoment helper, Calendar class
├── calendar-date.ts      # CalendarDate
├── clock.ts              # Clock
├── interval.ts           # Interval
├── open-interval.ts      # OpenInterval
├── period.ts             # Period union + PeriodBase interface
├── period-day.ts         # DayPeriod
├── period-week.ts        # WeekPeriod
├── period-month.ts       # MonthPeriod
├── period-quarter.ts     # QuarterPeriod
├── period-year.ts        # YearPeriod
├── period-decade.ts      # DecadePeriod
├── module.ts             # CalendarModule
└── testing.ts            # test helpers — separate test-only barrel
```

Tests are colocated (`calendar-date.test.ts`, `period-week.test.ts`, etc.).
No `index.test.ts`, no `module.test.ts`, no `types.test.ts` (per
[[feedback_no_wiring_tests]]).

### Locale ownership

`Calendar` is bound eagerly via `.eager()` and instantiated during
`container.autoLoad()`. Its constructor:

```ts
import { moment } from "obsidian";

export const CUSTOM_LOCALE = "custom-journal-locale"; // same name as v2

export class Calendar {
  constructor() {
    const systemLocale = moment.locale();

    if (!moment.locales().includes(CUSTOM_LOCALE)) {
      moment.defineLocale(CUSTOM_LOCALE, moment.localeData()._config);
    }
    moment.updateLocale(CUSTOM_LOCALE, { week: { dow: 1, doy: 4 } });

    moment.locale(systemLocale); // never disturb global moment state
  }
}
```

The global `moment.locale()` stays whatever the user (or Obsidian) has
configured. The module never overrides it.

Date types reach the custom locale through a single internal helper:

```ts
// calendar.ts
import { moment, type Moment } from "obsidian";

export function localMoment(input?: Parameters<typeof moment>[0]): Moment {
  return moment(input).locale(CUSTOM_LOCALE);
}
```

`CalendarDate`, every `Period` subtype, `Clock`, `Interval`, and
`OpenInterval` use `localMoment(...)` exclusively. Raw `moment(...)` calls
inside this module are a smell.

Future settings-driven retuning will call
`moment.updateLocale(CUSTOM_LOCALE, { week: {...} })` to swap `dow`/`doy`;
the global locale is still left alone. Layer B / settings handle the
push; nothing in this module subscribes to settings.

### `CalendarDate`

Immutable plain calendar date (no time). The canonical type for "the date
a journal note is for."

```ts
class CalendarDate {
  readonly kind: "CalendarDate";

  static today(): CalendarDate;
  static parse(input: string, format?: string): Result<CalendarDate, ParseError>;
  static fromAnchor(s: AnchorString): CalendarDate;

  readonly year: number;
  readonly month: number; // 1–12
  readonly day: number; // 1–31

  toAnchor(): AnchorString;
  format(pattern: string): string; // arbitrary moment format

  isBefore(other: CalendarDate): boolean;
  isAfter(other: CalendarDate): boolean;
  isSame(other: CalendarDate): boolean;
  compareTo(other: CalendarDate): -1 | 0 | 1;
}
```

- `today()` returns the current local calendar date.
- `parse` returns `Result<CalendarDate, ParseError>`. Format defaults to
  ISO `YYYY-MM-DD`.
- `fromAnchor` is infallible: `AnchorString` is only produced via
  `toAnchor()`, so well-formedness is type-system-guaranteed.
- No arithmetic, no period factories. All "advance/retract" goes through
  `Period`.

### `AnchorString` brand

```ts
// types.ts
declare const anchorBrand: unique symbol;
export type AnchorString = string & { readonly [anchorBrand]: true };
```

Only `CalendarDate.toAnchor()` produces an `AnchorString` in production
code. `testing.ts` exports an unsafe `anchor(s)` cast for fixtures.

### `Period`

Discriminated union of six granularity-tagged subtypes. Each subtype is
its own class, dispatch via `ts-pattern.match()` (per
[[feedback_ts_pattern_over_switch]]).

```ts
type Period = DayPeriod | WeekPeriod | MonthPeriod | QuarterPeriod | YearPeriod | DecadePeriod;

interface PeriodBase<Self> {
  readonly kind: "day" | "week" | "month" | "quarter" | "year" | "decade";
  readonly start: CalendarDate;
  readonly end: CalendarDate;

  next(): Self;
  previous(): Self;
  contains(d: CalendarDate): boolean;
  isSame(other: Self): boolean;
  days(): Iterable<CalendarDate>;
  format(pattern: string): string; // formats against start
}
```

Per-subtype shape:

```ts
class DayPeriod implements PeriodBase<DayPeriod> {
  readonly kind: "day";
  static containing(date: CalendarDate): DayPeriod;
  // start === end === its date
}

class WeekPeriod implements PeriodBase<WeekPeriod> {
  readonly kind: "week";
  static containing(date: CalendarDate): WeekPeriod;
  readonly weekOfYear: number; // locale-aware
  readonly year: number; // owning year per locale rule (Thursday for ISO 8601)
}

class MonthPeriod implements PeriodBase<MonthPeriod> {
  readonly kind: "month";
  static containing(date: CalendarDate): MonthPeriod;
  readonly monthOfYear: number; // 1–12
  readonly year: number;
  weeks(): Iterable<WeekPeriod>;
}

class QuarterPeriod implements PeriodBase<QuarterPeriod> {
  readonly kind: "quarter";
  static containing(date: CalendarDate): QuarterPeriod;
  readonly quarterOfYear: 1 | 2 | 3 | 4;
  readonly year: number;
  months(): Iterable<MonthPeriod>;
}

class YearPeriod implements PeriodBase<YearPeriod> {
  readonly kind: "year";
  static containing(date: CalendarDate): YearPeriod;
  readonly year: number;
  quarters(): Iterable<QuarterPeriod>;
  months(): Iterable<MonthPeriod>;
}

class DecadePeriod implements PeriodBase<DecadePeriod> {
  readonly kind: "decade";
  static containing(date: CalendarDate): DecadePeriod;
  readonly decadeStart: number; // e.g. 2020 for the 2020s
  years(): Iterable<YearPeriod>;
}
```

- Single construction path: `XxxPeriod.containing(date)`. No `Period.week`
  namespace duplication.
- `next`/`previous` are self-typed (same granularity). No cross-granularity
  step operations.
- `WeekPeriod.year` is the owning year per the locale's week rule (for
  ISO 8601 / `doy:4`, this is the year of the week's Thursday). Layer B
  uses it when resolving `{{date:YYYY}}` against a weekly journal.
- `isSame(other: Self)` only — different-granularity periods are never
  equal.
- Coarse periods expose iteration into finer ones (`YearPeriod.months()`,
  `MonthPeriod.weeks()`, etc.). All subtypes expose `days()` as the lowest
  common iteration.

### `Clock`

Render-time clock moment for template variables that need time-of-day
(`{{time}}`, `{{now:HH:mm}}`). Deliberately minimal: not a journal date,
not a period.

```ts
class Clock {
  readonly kind: "Clock";

  static now(): Clock;
  format(pattern: string): string; // arbitrary moment format incl. HH/mm/ss
}
```

No arithmetic, comparison, or parsing. The single intended consumer is
the template engine when it sees a clock-time variable. If template code
reaches for `moment()` directly to get current time, that's the smell that
says "use `Clock.now()`."

### `Interval` and `OpenInterval`

Calendar-primitive value types for from-to date ranges without
granularity. Used by Layer B for custom-interval entries, journal active
ranges, and DatePicker min/max constraints — but the types themselves
have no journal semantics.

```ts
class Interval {
  readonly kind: "Interval";
  readonly start: CalendarDate;
  readonly end: CalendarDate;

  static between(start: CalendarDate, end: CalendarDate): Result<Interval, IntervalError>;

  contains(d: CalendarDate): boolean;
  isSame(other: Interval): boolean;
  days(): Iterable<CalendarDate>;
}

class OpenInterval {
  readonly kind: "OpenInterval";
  readonly start: CalendarDate | undefined; // undefined = unbounded below
  readonly end: CalendarDate | undefined; // undefined = unbounded above

  static from(start: CalendarDate): OpenInterval; // [start, ∞)
  static until(end: CalendarDate): OpenInterval; // (-∞, end]
  static between(start: CalendarDate, end: CalendarDate): Result<OpenInterval, IntervalError>;

  contains(d: CalendarDate): boolean;
  isSame(other: OpenInterval): boolean;
}
```

- `Interval.between` returns `Result<…, IntervalError>` when
  `start.isAfter(end)`. Same for `OpenInterval.between`.
- `Interval` and `OpenInterval` are peers, not in a subtype hierarchy.
  Code with an `Interval` knows both bounds exist; code with an
  `OpenInterval` must handle `undefined`.
- No `Interval` ↔ `Period` interconversion. `Period` is granularity-tagged
  and self-navigates; `Interval` is granularity-free. If a Layer B feature
  needs to project one to the other, it adds a thin helper at that site.

### Errors

```ts
// errors.ts
export class DateTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateTimeError";
  }
}

export class ParseError extends DateTimeError {
  constructor(
    readonly input: string,
    readonly format?: string,
  ) {
    super(format ? `Cannot parse "${input}" with format "${format}"` : `Cannot parse "${input}"`);
    this.name = "ParseError";
  }
}

export class IntervalError extends DateTimeError {
  constructor(
    readonly start: CalendarDate,
    readonly end: CalendarDate,
  ) {
    super(`Interval start ${start.toAnchor()} is after end ${end.toAnchor()}`);
    this.name = "IntervalError";
  }
}
```

All declared in `errors.ts` per [[feedback_errors_in_errors_ts]]. Only
`parse` and `Interval/OpenInterval.between` return `Result`; every other
operation is infallible.

### Module

```ts
// module.ts
import type { Module } from "@/infrastructure/di";
import { Calendar } from "./calendar";

export const CalendarModule: Module = {
  register(c) {
    c.register(Calendar).useClass(Calendar).eager();
  },
};
```

Wired in `main.ts` after `LoggerModule` and `FlowsModule`, before
`autoLoad()`:

```ts
container.addModule(LoggerModule);
container.addModule(FlowsModule);
container.addModule(CalendarModule);
await container.autoLoad();
```

No service exposed on `Calendar` for feature code to call — its only job
is to define the locale once at boot. Date types reach the locale via the
module-internal `localMoment` helper. Per
[[feedback_di_constructor_injection]], DI wires `Calendar` once; nothing
resolves it at runtime.

### Testing barrel

```ts
// testing.ts
export function installTestCalendar(opts?: { dow?: number; doy?: number }): { teardown: () => void };

export function date(s: string): CalendarDate; // throws on parse failure (fixtures only)
export function anchor(s: string): AnchorString; // unsafe brand cast for fixtures
```

`installTestCalendar` constructs a `Calendar` (configuring the locale with
the given week settings, defaulting to ISO 8601) and returns a teardown
that restores prior `moment.locale()`. Per
[[feedback_no_mock_fake_tests]], there is no fake/mock for `Calendar`;
tests use a real `Calendar` instance.

## Testing

- **Colocated tests** per file (e.g. `period-week.test.ts` next to
  `period-week.ts`). No `module.test.ts`, no `index.test.ts`.
- **Real `Calendar` in every test file** via `installTestCalendar()` in
  `beforeEach`. Tests that need non-ISO week settings pass `dow`/`doy`.
- **Black-box assertions** ([[feedback_black_box_assertions]]): assert
  observable outcomes (`toAnchor()`, `contains(d)`, `start`/`end`, iteration
  results), not internal moment state.
- **One behavior per test** ([[feedback_one_behavior_per_test]]).
- **Type tests with `expectTypeOf`** ([[feedback_test_hygiene]]) for the
  `Period` discriminated union and the `AnchorString` brand.
- **No tests for mocks, wiring, or barrels**
  ([[feedback_no_wiring_tests]], [[feedback_no_mock_fake_tests]]).
- **Cross-year week regression**: a dedicated `period-week.test.ts` case
  covers a Dec-30 → Jan-5 week and asserts `weekPeriod.year` returns the
  Thursday's year, not `start.year`. This is the type-level fix for the
  v2 `{{date:YYYY}}` bug — Layer B still needs to use `weekPeriod.year`
  rather than `weekPeriod.start.year` when resolving template variables.

## Open follow-ups

- **Settings-driven locale retuning.** When the settings module lands, it
  calls `moment.updateLocale(CUSTOM_LOCALE, { week: {...} })`. The
  contract is settings → Calendar; Calendar does not subscribe to
  settings.
- **User-locale follow.** A future toggle ("use Obsidian's locale for week
  rules") would change which locale `localMoment` returns instances under.
  Out of scope here.
- **Period ↔ Interval projection.** If Layer B repeatedly converts a
  period to an interval (or vice versa), introduce a typed helper. No
  evidence v2 needed this beyond `start`/`end` accessors already on
  Period.
- **`Period.contains(Period)`.** Added when a real caller needs it.
- **Half-open intervals as a third type.** If `OpenInterval` proves too
  loose (e.g., Layer B wants type-level distinction between "from X
  onward" and "until Y"), split into `HalfOpenInterval` variants. Defer
  until evidence.

## Cross-references

- [[project_v2_week_anchor_bug]] — the v2 cross-year week bug this design
  addresses at the type level (`WeekPeriod.year`).
- [[feedback_di_eager_autoload]] — `Calendar` uses `.eager()` and is
  instantiated by `container.autoLoad()`.
- [[feedback_di_constructor_injection]] — DI wires `Calendar` once;
  feature code does not resolve it at runtime.
- [[feedback_di_omit_default_lifetime]] — no `.lifetime(...)` call;
  Container is the default.
- [[feedback_errors_in_errors_ts]] — all error subclasses live in
  `errors.ts`.
- [[feedback_barrel_files]] — `testing.ts` is a separate barrel.
- [[feedback_ts_pattern_over_switch]] — `Period` dispatch uses
  `match().with().exhaustive()`.
- [[feedback_no_wiring_tests]], [[feedback_no_mock_fake_tests]] — no
  tests for module wiring, barrels, or fakes.
- [[feedback_v2_fidelity_default]] — v3 preserves v2's calendar
  configuration (custom locale, ISO 8601 defaults, future global toggle).
- [[v3-flows-design]], [[v3-logger-design]], [[v3-di-foundation-design]],
  [[v3-monadic-foundation-design]] — sibling v3 infrastructure specs.
