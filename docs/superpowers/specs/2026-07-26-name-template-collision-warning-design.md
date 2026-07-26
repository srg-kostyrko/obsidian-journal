# Note-name collision warning

## Problem

A journal's name template can render the same note path for two different entries.
The user then edits what looks like a fresh entry but is really the previous one,
and the two periods silently share a single note.

The existing check (`nameTemplateCollides`, issue #175) only catches templates that
contain no per-entry variable at all. It misses every template that _has_ a date
variable but throws the distinguishing part of it away:

- boundary modifier — `{{date<endOf=month>}}` on a Day journal collapses each month
  of entries onto one name
- shift plus boundary — `{{date+1w<endOf=month>:YYYY-MM-DD}}`, the same collapse
  shifted by a week
- coarse inline format — `{{date:YYYY}}` on a Day journal
- coarse journal date format — plain `{{date}}` with `dateFormat = YYYY-MM` on a
  Day journal

The property that matters is not "the template is constant". It is **two distinct
periods render the same note path**.

## Scope

Warn on any collapse, whatever the cause: boundary, shift, inline format, or the
journal's own date format.

A collision is judged on the **full vault path**, folder plus filename. Name
`{{date:YYYY}}` under folder `Journals/{{date:MM}}` produces one note per month
and must stay silent.

The warning is advisory. Journal settings edit live, so there is nothing to block.

Out of scope: any notice at note-creation time, an auto-fix link, and preventing
the user from saving the template.

## Detection

Sampling, not static analysis: resolve a run of consecutive periods through the
real note-path code and look for a repeat.

Two alternatives were rejected.

_Static granularity analysis_ — deriving the finest field a format string emits and
comparing it to the journal's period — would mean a second implementation of moment
format semantics alongside `src/templates/format-regex.ts`, and it cannot produce a
concrete example of the collision without extra work.

_Render-then-parse round-trip_ is unsound here. `unapplyModifier` in
`src/templates/modifiers.ts` treats a boundary modifier as the identity, so a
round-trip reports `<endOf=month>` as lossless and misses the motivating case
entirely.

Sampling tests the exact property through the exact code path that creates notes,
and yields the colliding pair as a by-product.

### Window

Up to 40 consecutive periods from the walk's origin, cut short at the journal's
timeline end.

That covers every realistic collapse: a month boundary repeats after 2 day-periods,
a weekday name after 7, a day-of-month format such as `{{date:DD}}` after 28–31.
Only a format whose sole varying field cycles more slowly than 40 periods escapes,
which is not a shape users write by accident.

Adjacent-period sampling would not be enough on its own: `{{date:DD}}` renders
distinct names for Jan 1 and Jan 2 but collides Jan 1 with Feb 1.

## Components

### `findPathCollision` — pure, in `src/journals/settings/ui/name-template-collision.ts`

```ts
export interface PathCollision {
  readonly first: AnchorString; // earlier anchor
  readonly second: AnchorString; // the anchor that lands on the same path
  readonly path: string; // the shared vault path
}

export function findPathCollision(
  anchors: readonly AnchorString[],
  pathFor: (anchor: AnchorString) => string | undefined,
): PathCollision | null;
```

Walks the anchors in order against a `Map<string, AnchorString>` and returns the
first repeat. An anchor whose `pathFor` yields `undefined` is skipped, never treated
as a match. No services and no Vue, so it is testable with a fake renderer.

### `useCollisionCheck(config)` — composable, sibling file

Mirrors `use-invertibility-check.ts` and returns
`ComputedRef<PathCollision | null>`:

1. return `null` when the config is missing or `nameTemplate` is empty
2. pick the walk's origin: the journal's `timeline.start` when it is set, otherwise
   today. Resolve it to an anchor via `CycleService.anchorOf`
3. collect up to 40 anchors, stepping with `CycleService.nextAnchor` and stopping as
   soon as `TimelineService.contains(name, anchor)` is false
4. render each through `NotePathService.pathForDate`, discarding `Err` results
5. hand both to `findPathCollision`

Bounding the walk with `TimelineService` is not optional. Neither `nextAnchor` nor
`anchorAtOffset` respects timeline limits — both return `None` only for a journal
that does not exist — so an unbounded walk would sample periods past a journal's
end and warn about collisions between notes that can never be created.

Anchoring the walk at `timeline.start` rather than today also makes the result
deterministic. A walk from today could warn on one day and stay silent the next.

Stepping with `nextAnchor` keeps the walk linear; `anchorAtOffset` re-steps from the
origin on every call and would make it quadratic.

### Known limit, accepted deliberately

`pathForDate` builds metadata through `FrontmatterService.buildMetadata`, which
reads stored end dates from the journals index. The result is therefore not a pure
function of the config. This makes sampling more faithful to what will actually
happen in the vault, not less, but a test asserting on it must control the index.

## Replacing the existing check

`nameTemplateCollides` is subsumed. A template with no per-entry variable renders
the same path for samples 0 and 1, so the sampler catches issue #175 as its trivial
case and reports it more usefully — naming the two dates instead of restating a
rule. The two checks describe one concept (two entries, one file), so they merge.

Delete `nameTemplateCollides`, replace its cases in `name-template-collision.test.ts`
with the `findPathCollision` cases below, and drop the `templateCollides` computed
and its call site in `NoteCreationSection.vue`. Keep the empty-template
guard, now inside the composable: an empty name template is a separate validation
concern and does not warn here.

`useInvertibilityCheck` is unaffected and continues to render alongside.

## Copy

Reuse the key `journal_edit_name_template_collision_warning`, changed from zero-arg
to parameterized over `first`, `second`, and `path`:

> Entries for 2026-07-01 and 2026-07-02 both resolve to Journals/2026-07-31.md.
> They will share one note.

Sentence case and en-US, per §A of `docs/2026-07-13-ux-text-audit.md`. Edit
`messages/en.json` and run `compile:i18n`; `src/i18n/paraglide` is generated and
never staged.

## UI

An inline `.journal-hint` under the name-template field in
`src/journals/settings/ui/sections/NoteCreationSection.vue`, in the position the
current collision warning occupies, above the invertibility hint.

## Testing

Unit, `name-template-collision.test.ts`:

- returns the first repeat as the witness pair
- returns `null` when every path is distinct
- skips anchors that fail to render rather than matching them

Composable, `use-collision-check.test.ts`:

- `{{date<endOf=month>}}` on a Day journal warns
- plain `{{date}}` with a `YYYY-MM` journal date format on a Day journal warns
- plain `{{date}}` on a Day journal stays silent
- name `{{date:YYYY}}` with folder `{{date:MM}}` stays silent
- a template with no date variable warns (the issue #175 case, via the sampler)
- an empty name template stays silent
- a journal whose timeline ends before the colliding period stays silent

Component, `NoteCreationSection.test.ts`: the warning renders under the
name-template field, queried through `@testing-library/vue`.

One behavior per test; scope expressed with nested `describe` blocks.

## Manual checklist

Add an entry to §2 of `docs/manual-testing-checklist-v3.md`, next to the existing
shift-and-boundary item — `{{date+1w<endOf=month>:YYYY-MM-DD}}` is exactly the
config that should now warn.
