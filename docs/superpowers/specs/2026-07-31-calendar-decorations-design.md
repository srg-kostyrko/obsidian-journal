# Calendar decorations

## Problem

Every decoration is owned by a journal. It lives in that journal's config, it is edited
on that journal's settings page, and `evaluateRange` paints it only on cells whose period
kind matches the journal's `write.type`.

Two of the nine conditions read nothing from the journal. `date` and `weekday` test
`period.anchor` and nothing else — no note, no metadata, no cycle. For a decoration built
only from those, the journal contributes nothing but a place to be stored and a period
kind to paint.

That has a cost. "Weekends are grey" or "mark 25 December" is a property of the calendar,
not of a journal, but today it can only be expressed by attaching it to a daily journal —
so a vault with no daily journal cannot express it at all, and a vault with two daily
journals must pick one arbitrarily and gets a rule that disappears when that journal
leaves the shelf being viewed.

## Scope

Two new decoration lists that no journal owns: one vault-wide, one per shelf. They accept
only the journal-independent conditions and paint only day cells.

This is purely additive. Journals keep all nine conditions, including `date` and
`weekday`, so a decoration that combines a weekday with a note tag stays expressible and
no stored configuration changes meaning. Nothing is migrated.

Out of scope:

- A global condition meaning "any journal has a note that day". It reads as a natural
  companion to `has-note`, but it needs journal resolution, which is exactly what these
  lists do without.
- Period kinds other than day. A global rule cannot paint a week, month, quarter or year
  cell.
- Toolbar period badges. They render week/month/quarter/year only, so a day-scoped
  decoration would be invisible there regardless.

## The decoration type

```ts
CalendarDecoration = {
  mode: "and" | "or";
  conditions: (JournalDecorationDateCondition | JournalDecorationWeekdayCondition)[];
  styles: JournalDecorationStyle[];
};
```

Same styles, same mode, narrower conditions. `and`/`or` stays meaningful — "25 December
and a Saturday" is a sensible rule.

The condition union is a structural subset of `JournalDecorationCondition`, so
`CalendarDecoration` is assignable to `JournalDecoration` and the preview component, the
style derivation in `derive-styles.ts`, and `describe-condition.ts` all take it unchanged.

The seven excluded conditions are excluded because each needs something a journal
supplies:

| Condition                                                                      | Needs                              |
| ------------------------------------------------------------------------------ | ---------------------------------- |
| `title`, `tag`, `property`, `has-note`, `has-open-task`, `all-tasks-completed` | the journal's note for that period |
| `offset`                                                                       | a custom journal's cycle           |

## Storage

**Global** — a settings slice, registered like `calendarSlice`:

```ts
const decorationsSliceSchema = v.object({ decorations: v.array(calendarDecorationSchema) });

export const decorationsSlice = defineSlice("decorations", decorationsSliceSchema, { decorations: [] });
```

**Shelf** — a `decorations` field on `shelfConfigSchema`, defaulting to `[]`. It is read
with a fallback so a shelf saved before this change (field absent) parses instead of
failing and resetting the whole shelf to defaults.

## The owner seam

`DecorationsSection.vue`, `EditDecorationFlow` and `DeleteDecorationFlow` currently take a
`journalName` and reach for `JournalsRepository`. They take an owner instead:

```ts
type DecorationOwner =
  { kind: "journal"; journalName: string } | { kind: "shelf"; shelfName: string } | { kind: "global" };
```

A `DecorationsStore` service resolves an owner to its list and writes it back, dispatching
to `JournalsRepository`, `ShelvesRepository` or the settings slice. The section component
and both flows talk only to the store; one component and one pair of flows serve all three
owners.

`EditDecorationFlow`'s `UnknownJournalError` branch becomes owner-shaped: a journal owner
that no longer exists, a shelf owner that no longer exists. The global owner cannot fail
to resolve.

## Evaluation

`DecorationBinding` becomes a discriminated union:

```ts
type DecorationBinding =
  | { kind: "journal"; journalName: string; decoration: JournalDecoration }
  | { kind: "calendar"; decoration: CalendarDecoration };
```

A journal binding evaluates exactly as today. A calendar binding skips the journal config
lookup and the metadata cache entirely, and matches only periods of kind `day`.

The `day`-kind gate is not sufficient on its own: a custom interval is also a `day`-kind
period at its start anchor, which is why the day grid already filters custom journals out.
Calendar decorations are kept off interval rows the same way the existing split works — by
the consumer not asking for them (see Surfaces).

### Precedence

`backgroundFrom` and `textColorFrom` use `.find()`, so the first matching style in a
cell's bucket wins; borders are last-wins; shapes, corners and icons all stack. Order in
the bucket is the order bindings are gathered, so precedence is decided by gathering
order:

**journal, then shelf, then global.**

For background and text colour, most specific wins: a journal's own "has-note → blue"
beats a shelf rule, which beats a vault-wide "weekends are grey". Global decorations act
as a backdrop each journal can override.

Borders do not get this guarantee — they are last-wins, so with the journal → shelf →
global gathering order it is the _least_ specific owner's border that wins on a shared
cell: a vault-wide border rule beats a journal's own border rule. Shapes, corners and
icons stack instead of competing, so every owner's gets drawn. "Most specific wins" is
therefore a claim about background and text colour only, not a property of the mechanism
as a whole.

## Surfaces

`useCellDecorations` takes four positional parameters today and callers already pass
`undefined` for the scope slot. It moves to an options object and gains
`calendarShelf?: MaybeRefOrGetter<string | null>`. Passing the option opts the surface in:
a shelf name means global plus that shelf's list, `null` means global plus every shelf's
list, in settings order.

The global list therefore always applies wherever calendar decorations apply at all, and a
shelf's list adds to it whenever that shelf is in scope — including "all journals", which
scopes to no shelf and so unions them all.

`null` reaches the gatherer for two different reasons — the user picked "all journals", or
the surface's owning journal is on no shelf — but both already widen the _journal_ scope to
every journal, so both widen the shelf scope the same way. A rule owned by one shelf is
extra paint, not a filter, so unioning cannot hide anything; the cost is that two shelves
with conflicting background rules resolve by settings order, which the breakdown modal
attributes per binding.

| Surface                                   | Opts in                                      |
| ----------------------------------------- | -------------------------------------------- |
| `NotesMonthView`, `NotesWeekView`         | yes, with the view's `shelf` prop            |
| `NavigationCodeBlock` — row scope         | yes, shelf resolved from the current journal |
| `NavigationCodeBlock` — whole-block scope | no                                           |
| `CustomIntervalsBlock`                    | no                                           |
| `PeriodButtonsItem`                       | no                                           |

This table is not exhaustive on its own: `TimelineCodeBlock` renders `NotesMonthView` /
`NotesWeekView` internally and passes them a derived shelf (the host note's journal's own
shelf, or the block's configured `shelf` override), so it inherits the opt-in from those
two views. A timeline fence embedded in a note owned by a journal on a shelf paints that
shelf's calendar decorations too.

The nav block's row scope is where a calendar decoration belongs, because each row is a
different date; the whole-block scope decorates the block from the current journal's own
rules. The shelf for a nav block is the first shelf containing the current journal — the
resolution `rowJournalNames` already performs — and `null` when the journal is on no
shelf.

Only rows whose period kind is `day` are affected. A weekly journal's nav block renders
week rows, so a weekend rule is invisible there. This is correct but non-obvious, and is
worth a comment at the call site.

Reading the global slice and the shelf config inside `gatherDecorations` keeps the
existing `watchEffect` reseed reactive, using the same array-touching the journal path
uses to register a dependency on mutations of the decorations array.

## Settings UI

**Global** — a collapsible dashboard block titled "Calendar decorations", registered
alongside the existing calendar blocks, wrapping the shared `DecorationsSection` with the
`global` owner.

**Shelf** — the same component registered as a `ShelfEditSection`, with the `shelf` owner,
so it appears on the shelf edit page next to the journal list.

**Editor** — `conditionTypeOptions` is keyed by journal write type today. It gains a
`calendar` key mapping to `["date", "weekday"]`, and the modal takes the key from its
owner rather than from a `writeType` prop. `EditDecorationModal`'s `journalName` prop is
declared but never read; it goes away.

New user-facing strings follow the copy rules in `docs/2026-07-13-ux-text-audit.md` §A.
Both lists are called "Calendar decorations".

## Testing

Unit:

- A calendar binding paints a day cell.
- A calendar binding does not paint a week, month, quarter or year cell.
- Evaluating a calendar binding never reads the note metadata service.
- A journal decoration's background wins over a shelf decoration's on the same cell.
- A shelf decoration's background wins over a global decoration's on the same cell.
- A shelf saved without a `decorations` field loads with an empty list.
- The condition editor offers only date and weekday for a calendar owner.
- Each flow reads and writes the list its owner names.

E2E: seed a vault-wide decoration in the journeys fixture and assert the computed
background of the day cell it matches. Colors are read via `getCSSProperty` parsed hex with
a custom hex value, not a theme variable, per the established rules for editor zoom and
computed style. The decoration is seeded rather than built through the modal because the
behavior under test is that a journal-free decoration reaches a real calendar cell; the
editor's condition set is covered by unit tests.
