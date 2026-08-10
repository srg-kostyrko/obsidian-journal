# Decoration breakdown: cell readout vs date explorer

Supersedes part of [decoration inspector](2026-08-03-decoration-inspector-design.md).

## Problem

`DecorationBreakdownModal` has two entry points and implements one of them.

| Entry point                                            | Passes       | Question                               |
| ------------------------------------------------------ | ------------ | -------------------------------------- |
| Settings — "Inspect a date" (`DecorationsSection.vue`) | `{}`         | What decorates this **date**?          |
| Cell context menu — "Explain decorations"              | `{ period }` | Why does **this cell** look like this? |

The inspector spec chose this deliberately: "Behaviour does not vary by entry point... Opened
from a week cell, the day cell beneath it is still shown." In use the second question is the
common one, and answering it with the first question's screen reads as a defect.

Right-click a day cell and the modal lists sections for the week and month cells the date also
belongs to. Those cells cannot influence the day cell, by three separate mechanisms:
`periodMatchesWrite` gates a journal's decorations to periods of its own write kind; calendar
decorations paint `day` cells only; and winner/override resolution happens inside a single
`cellKey(kind, anchor)` bucket, kind included precisely so a week and its anchor day stay
apart. Yet the sections render identically, with the same winner and "Overridden here"
framing — the vocabulary of composition — about rules that never meet.

Two further defects sit behind it.

The shelf selector was spec'd to seed "from the entry point — the surface's current shelf" and
never did; `shelf` is `ref(null)`, so a cell right-clicked in a shelf-scoped calendar is
explained as if unscoped. The explanation can name a winner the cell does not render, and can
list rules from journals absent from that shelf. This is an unimplemented spec line, not a
design question.

A custom-interval row passes a `day`-kind period at the interval's start anchor, so `period`
alone cannot distinguish it from a real day cell. The modal renders both sections and
hard-codes `isEntry: false` on the interval one, which means right-clicking an interval badges
the **day** section as "Opened from here".

## Scope

Split the modal in two: a static readout of one cell for the context-menu entry, and the
existing date explorer for settings. Fix the shelf seeding and the interval mislabel, both of
which the split forces.

Out of scope: the engine, attribution, `resolveCell`, the match badges, storage, and the date
explorer's own behaviour.

## Why two screens, not two modes

After the split the screens differ in their controls (a date picker or none) and their section
count (many or exactly one). The "Opened from here" badge stops meaning anything in both: the
readout has one section to badge, and the explorer no longer has an entry point. That is two
screens. A mode flag inside a component already doing two
jobs makes the doubling permanent and taxes every later change with "which mode?".

The date explorer gets smaller than it is today: settings becomes its only caller, so the
`period` prop and everything downstream of it is deleted rather than made conditional.

## The entry descriptor

A `Period` does not identify a cell. Kind plus anchor collide between a day cell and a custom
interval starting that day, and the modal cannot resolve one without knowing which it is.

```ts
export type BreakdownEntry =
  | { readonly kind: "fixed"; readonly period: Period }
  | { readonly kind: "interval"; readonly period: Period; readonly journalName: string };
```

`useDecorationMenuItems` carries it, and the shelf alongside:

```ts
useDecorationMenuItems(
  cells: ReadonlyMap<string, CellStyleRef> | null,
  shelf: MaybeRefOrGetter<string | null>,
): (entry: BreakdownEntry) => readonly MenuItemSpec[]
```

The decorated-cell existence check is unchanged — still `cellKey(period.kind, anchor)` against
the surface's own map — because each surface provides the map its own cells were drawn from,
and a day grid and an interval list never share one. Only what reaches the modal changes.

| Surface                                        | Entry                                                           |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `useNotesCell` (calendar view, timeline block) | always `fixed`                                                  |
| `PeriodButtonsItem`                            | always `fixed` — week, month, quarter and year only             |
| `NavBlockRow`                                  | `interval` when `journal.write.type === "custom"`, else `fixed` |

All four surfaces already know their shelf: `NotesMonthView` from `props.shelf`,
`NavigationCodeBlock` from its `decorationShelf`, `CustomIntervalsBlock` and
`PeriodButtonsItem` from `context.shelf`. `NavBlockRow` holds the menu item but not the shelf,
so it gains a `shelf` prop threaded through `NavBlock` from its two parents.

## `decorationCellModal`

Props: `entry: BreakdownEntry`, `shelf: string | null`. One section, no date picker.

The shelf ref seeds from the prop and stays changeable. A changeable shelf inside a static
readout can drift off the clicked cell; the section heading names the cell and the dropdown
sits directly above it, so the drift stays legible. Keeping it pokeable is what answers "why
isn't my shelf rule showing?", which is a question the readout should not have to send
elsewhere. "Static" therefore describes the date, not the resolution.

Resolution is one computed with two branches and no loops:

| Entry      | Journals                    | Calendar rules | Decoration filter                                     |
| ---------- | --------------------------- | -------------- | ----------------------------------------------------- |
| `fixed`    | the shelf scope's journals  | included       | custom journals contribute offset-carrying rules only |
| `interval` | `[entry.journalName]` alone | excluded       | non-offset rules only                                 |

Either branch then reads `explainRange([entry.period])` at
`cellKey(entry.period.kind, entry.period.anchor)`. "The shelf scope's journals" is the
selector's current value resolved the way the explorer already resolves it: every journal when
the selector reads all journals, otherwise that shelf's list.

This is the offset/non-offset split production already makes between the day grid and the
interval list. Previously the modal rendered both sides and guessed which one the user meant;
the descriptor now says.

No period-kind filtering is needed in the modal. `periodMatchesWrite` already excludes
wrong-kind journals and calendar decorations already restrict themselves to `day`, so passing
the shelf's journals wholesale resolves to exactly the contributing ones.

The empty state stays reachable: the menu item only appears on a decorated cell, but changing
the shelf can empty it. New string `decoration_breakdown_cell_empty` — "Nothing decorates this
cell."

## `decorationBreakdownModal`

Unchanged in behaviour, smaller in code. It loses the `period` prop, `initialPeriod`,
`entryKey`, `isEntry`, the `decoration_breakdown_entry_badge` string and its CSS rule. Its date
picker, shelf selector, multi-kind section list and interval loop stay: showing every cell a
date belongs to is right for "what decorates this date", which is the only question it is now
asked.

## `DecorationBreakdownSection`

Both modals build cells, so the renderer moves out: heading, `DecorationPreview`, exclusive
properties with winner and struck-through overridden contributions, then mark groups in slot
order. `cellId`, `headingOf`, `clausesOf`, `ownerLabel` and `decorationOf` move with it;
`formatPeriod` and `PERIOD_FORMAT` move to a sibling module both modals import.

The section keeps rendering its own heading in both screens. The cell readout could put the
cell's identity in the modal title instead, but the interval form — journal name and interval
label together — is too long for a title, and a conditional heading prop buys nothing.

## Testing

`DecorationBreakdownSection.test.ts` takes the five tests that exercise the renderer rather
than the composition: the winning decoration for a resolved property, a contribution listed
under the overridden heading, the mode word interleaved between an OR decoration's conditions,
marks listed without a winner, and an interval section's accessible name surviving a journal
name containing a space.

`DecorationBreakdownModal.test.ts` keeps its composition tests — which cells appear, the
offset/non-offset split across the day cell and the interval list, the timeline exclusion, the
shelf re-resolve, and the empty state — and deletes the two that assert entry-point
highlighting.

`DecorationCellModal.test.ts` covers the split, one behaviour each: only the clicked cell's
section renders when the date also belongs to a decorated week cell; an interval entry resolves
against the interval's decorations rather than the colliding day cell's; a day entry resolves
against the day cell's when that day starts an interval; the shelf selector seeds from the
entry point; changing the shelf re-resolves; and a shelf change that leaves the cell
undecorated shows the empty state.

`NavBlockRow` gets one test for the branch it owns: a custom journal's row opens an interval
entry. `useDecorationMenuItems` only forwards the descriptor, and forwarding is wiring.

No new e2e. The menu seam the inspector spec sent to e2e — Obsidian's real `Menu`, the
`file-menu` event, the note-less cell still producing an item — is untouched. Same item, same
visibility rule, same `openPathsMenu` plumbing; only the payload changed, and that is
unit-visible.

## Rollout

No migration. `decoration_breakdown_entry_badge` is removed from `messages/en.json` and every
locale, `decoration_breakdown_cell_empty` added, then `npm run compile:i18n`.
