# Decoration inspector

## Problem

A decorated cell is the product of every decoration that matched it, resolved through the
cascade in [decoration composition semantics](2026-08-03-decoration-composition-semantics-design.md).
Nothing in the product shows that product. Each settings row previews its own decoration in
isolation, and the three scopes are authored on three separate screens — the journal edit
page, the shelf edit page, and a dashboard block. Answering "why is this Tuesday orange?"
means opening three screens and running the cascade by hand.

The rules list is equally silent in the other direction. A decoration whose tag is misspelled
looks exactly like a decoration whose day has not come up yet: a row with a preview and a
condition summary, matching nothing, saying nothing.

## Scope

A breakdown of one cell, reachable from every surface that renders a decoration and from
settings, plus a per-decoration badge answering whether a rule fires at all.

Authoring does not move. The three edit surfaces stay where they are; this adds a diagnostic
over them.

Out of scope: a unified decorations page, editing from inside the breakdown, and any change
to how decorations are stored.

## The three scopes are not interchangeable

Any design here has to respect an asymmetry that is easy to miss.

| Owner                             | Conditions available                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| Vault-wide                        | `date`, `weekday`                                                                 |
| Shelf                             | `date`, `weekday`                                                                 |
| Journal — day                     | title, tag, property, has-note, has-open-task, all-tasks-completed, date, weekday |
| Journal — week/month/quarter/year | title, tag, property, has-note, has-open-task, all-tasks-completed                |
| Journal — custom                  | title, tag, property, has-note, has-open-task, all-tasks-completed, offset        |

Vault-wide and shelf decorations paint day cells only (`engine.ts`, `period.kind !== "day"`);
a journal's paint whatever period kind it writes. Storage differs too — journal config, shelf
config, settings slice.

Decorations are therefore not portable between scopes, and the scopes can never present as one
flat list. This spec never asks them to.

## One matcher, two projections

`evaluateRange` runs on every reseed, metadata change and index change, and returns
`Map<cellKey, JournalDecorationStyle[]>`. Explanation is asked for on demand. Widening the
render path to carry provenance would tax every render for a feature used occasionally;
writing a second matcher beside it would recreate the two-paths-encoding-one-rule failure the
composition spec exists to fix.

The engine builds attributed contributions once and projects them two ways:

```ts
interface DecorationSource {
  readonly owner: DecorationOwner; // journal / shelf / global
  readonly index: number; // position in that owner's list
}

interface Contribution {
  readonly source: DecorationSource;
  readonly style: JournalDecorationStyle;
}
```

`evaluateRange` keeps its signature and projects contributions down to styles. `explainRange`
returns the contributions. Matching, timeline gating and metadata caching are written once.

`CalendarDecorationBinding` is currently `{ kind: "calendar", decoration }` and carries no
owner identity, so a shelf decoration cannot be told from a vault-wide one after gathering.
The binding gains its `DecorationOwner`; `useCellDecorations.gatherDecorations` already knows
which it is pushing.

Attribution is a pure function over `Contribution[]`, not engine work. It reports, per
exclusive property, the winning contribution and the ones it overrode, and the mark slots in
cascade order. Defining it in terms of `resolveCell` is what keeps it from disagreeing with
`resolveCell` — the composition spec's commitment that winners stay derivable by re-running
the resolver over prefixes is what this spends.

The badges are the same query read the other way: for a decoration, the periods whose
contributions include it. No second capability.

## The breakdown modal

A `defineModal<void>()` viewer taking an optional `Period`.

Behaviour does not vary by entry point. For a date, the modal shows every decorated cell that
date belongs to. A date belongs to up to six cells — day, week, month, quarter, year, custom
interval — but only kinds some journal writes exist, and only cells with at least one
contribution are shown, so it is usually one or two sections with no empty rows. The entry
point sets the initial date and highlights the cell it came from. Opened from a week cell, the
day cell beneath it is still shown.

Each section renders the resolved cell through `DecorationPreview`, then the exclusive
properties with their winning decoration — scope badge and condition summary — then the
overridden contributions struck through beneath. Marks are listed separately in slot order
with no winner or loser, because marks are additive and framing them as a contest would teach
the wrong rule.

A date with no decorated cells says so rather than rendering an empty table.

### The shelf selector

Shelf decorations apply only while that shelf is in view, so "what decorates this cell" has
different answers under different shelf scopes, and from settings there is no shelf in scope
at all. There is no single true answer to give.

The modal carries a shelf selector mirroring the calendar toolbar's, seeded from the entry
point — the surface's current shelf, or all journals from settings. Changing it re-resolves.
The conditional becomes something visible and pokeable instead of an invisible rule, which is
part of the explanation rather than chrome around it.

### Deliberately absent

An "edit this rule" jump to `EditDecorationFlow`. The owner and index are both known, so it is
cheap, but it opens a modal from a modal and `ModalService` stacking is not a hazard worth
discovering inside a diagnostic. The breakdown names the scope and the rule well enough to
find it by hand.

## Reach

All four decorated surfaces already have a `@contextmenu` handler with a `Period` in hand, and
all four funnel into `workspace.openPathsMenu(paths, event)`:

| Surface                                              | Route                              |
| ---------------------------------------------------- | ---------------------------------- |
| `NotesCalendarCell` (calendar view + timeline block) | `useNotesCell.openContextMenu`     |
| `NavBlockRow` (navigation block)                     | `onContextMenu`                    |
| `PeriodButtonsItem` (toolbar period buttons)         | `openContextMenu(badge, …)`        |
| `CustomIntervalsBlock`                               | renders `NavBlock` → `NavBlockRow` |

Custom intervals need no work of their own. The item is added at the one shared seam.

`WorkspaceService` lives in `infrastructure/host` and must not learn about decorations, so it
takes generic items — `openPathsMenu(paths, event, extraItems?)` where an item is a title, an
icon and a callback. Each call site supplies the decorations item.

Three behaviours inside it change:

- `if (first === undefined) return;` bails with no menu when there are no notes. It must bail
  only when there are also no extra items. Otherwise the item is missing on exactly the
  note-less cells that vault-wide and shelf rules decorate — every `date` and `weekday`
  condition paints regardless of notes, and those are the only conditions those two scopes
  have.
- The single-path case delegates to `openFileMenu`, which builds its own `Menu`. `openFileMenu`
  gains the ability to populate a menu it is handed. Replacing Obsidian's file menu with ours
  instead would lose Obsidian's file actions.
- The multi-path case already builds our own `Menu` and simply gets the items prepended.

The item appears only when the cell has at least one contribution. Each surface can answer
that because the style map is already injected there — `CellDecoration` performs the same
lookup. A composable reading that map, taking the optional `CellDecorationScope` so the
navigation block's two independently-scoped grids each consult their own, keeps the check
identical across call sites.

`NavBlockRow` keeps its `preventNavigation` early return, so the settings-side navigation block
preview stays inert.

### Settings entry point

A button in `DecorationsSection`'s header beside "Add decoration". That component serves all
three owners, so one change yields three entry points — journal page, shelf page, dashboard
block — and the button sits where decorations are edited. It opens the modal with no period,
so the modal starts on today's date with its own picker.

The button inside "Journal decorations" opens a cross-scope view. That is the point — the
journal's rules are not the whole story — so the label says "Inspect a date" rather than
naming the journal.

No command-palette entry. Four decorated surfaces plus three settings buttons is generous for
a diagnostic, and a command is trivial to add once the feature has users.

## Match badges

One badge per row in `DecorationsSection`, answering whether a rule fires at all.

### The window looks backward

Most conditions can only match notes that already exist — `has-note`, `tag`, `property`,
`has-open-task`, `all-tasks-completed`. Over the next 90 days they match nothing, because
those notes are not written yet. A forward window would mark the majority of healthy
note-based rules as dead, which is worse than no badge: it teaches users to ignore the signal.

Backward, the window covers periods where notes exist, so the badge measures the rule against
real data. `date` and `weekday` rules fire on schedule and read the same either direction. A
finished journal stops being a special case, because backward is its natural direction.

A journal whose timeline lies entirely in the future has no past to check, and looks forward
instead.

### Unit and horizon

The unit is the owner's period kind, since that is what the engine evaluates against: days for
vault-wide and shelf rules, the journal's write type otherwise. The window is clipped to the
journal's timeline, so a journal with twelve weeks of history reports against twelve.

Horizons are a fixed table, tuned rather than derived: 90 days, 26 weeks, 12 months, 8
quarters, 5 years, 20 custom intervals. Not user-configurable.

### Three states

| State         | Shown when                          | Reads as                              |
| ------------- | ----------------------------------- | ------------------------------------- |
| Fires         | matched at least once               | `matched 23 of the last 90 days`      |
| Cannot tell   | no evidence in the window           | `no history yet` / `no notes yet`     |
| Does not fire | matched none, with evidence present | `matched nothing in the last 90 days` |

The alarming state requires evidence, so two suppressions apply. Both are cheap, because the
periods and the index are already being walked.

A window of zero periods reports no history yet. This catches a journal created today, whose
every rule would otherwise report as dead the moment it is set up. A journal younger than its
horizon gets a correspondingly small denominator rather than a false alarm.

A window containing no notes reports no notes yet, for a decoration that needs notes. Whether
a decoration needs notes depends on its mode: under `and` it needs notes if any condition is
note-based, since every condition must hold; under `or` only if all of them are, since a
single `date` or `weekday` condition can fire without a note.

One soft edge is exposed rather than engineered away. A journal with three days of history and
a weekday rule honestly reports `matched 0 of the last 3 days`. The denominator is the
evidence indicator — `0 of the last 3 days` reads differently from `0 of the last 90 days` —
which is better than a fuzzy history threshold needing its own tuning table.

### Cost

Badges compute when the section renders. Twenty decorations over 90 periods is 1800
evaluations, each potentially touching the index and metadata cache, in a synchronous
computed. It is all in-memory maps, but the expensive case is the interesting one: a
zero-match rule cannot early-exit and must scan its whole window. Memoize per section mount
rather than per render. If that proves insufficient, compute on expand instead of on mount.

## Testing

The structural test: for a given set of periods and bindings, projecting `explainRange`'s
contributions down to styles equals `evaluateRange`'s output. That is what stops the two
projections drifting.

Attribution tests need no DI or Obsidian: each exclusive property resolves to the last
declaring contribution; overrides are reported in cascade order; a border side with
`show: false` never appears as an override because it never competed; marks come back with no
winner or loser.

Badge tests, one behaviour each: matched count over a backward window; a future-only timeline
flipping the window forward; the denominator clipping to a short timeline; no history yet for
a zero-period window; no notes yet for a note-needing decoration over a note-free window; and
the mode rule both ways.

Modal tests use `@testing-library/vue`: only decorated cells produce sections, the entry-point
period is highlighted, changing the shelf selector re-resolves, and a date with nothing
decorated shows the empty state.

The menu seam needs e2e, because it manipulates Obsidian's real `Menu` and the `file-menu`
workspace event — `__mocks__/obsidian.ts` is our own stand-in, so a passing unit test there
proves nothing. Two journeys:

- Right-clicking a decorated day cell with no note opens a menu carrying "Explain decorations".
  Today that cell produces no menu at all, so the journey fails against current code.
- Right-clicking a decorated cell that has a note opens a menu carrying both "Explain
  decorations" and Obsidian's own file entries, guarding the `openFileMenu` refactor against
  silently replacing Obsidian's menu.

The same journey asserts that an undecorated, note-less cell still produces no menu, since
that behaviour is deliberately preserved.

## Rollout

No migration. `CalendarDecorationBinding` gains an owner field, but bindings are constructed
per evaluation and never persisted; no schema changes, no stored-data changes.
