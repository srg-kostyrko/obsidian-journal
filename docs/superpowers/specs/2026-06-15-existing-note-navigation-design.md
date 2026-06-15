# Navigate to existing journal notes (#150, #215)

## Problem

Today every way to open a journal note moves by a fixed period and **creates**
the note when it is missing. "Open yesterday's note" creates yesterday; the
per-journal command's `previous` type creates the prior period; the calendar has
no control for hopping between notes that already exist. Two requests ask for the
missing capability — jumping to the note that is actually _there_, skipping empty
periods, without creating anything:

- **#150** wants a command that opens the last **available** note (the user reads
  the config dropdown's "Last … note" as "open the last one", but it creates).
- **#215** wants **previous/next "defined"** buttons on the calendar that step
  through notes that exist, the way an old WikidPad plugin did: list matching
  notes, sort, find the current one, open the neighbour.

Both are the same capability — _find the nearest note that exists, in a
direction, from a reference point_ — surfaced as a command and as a toolbar item.

## Behavior

### Shared rule

From a reference date and a set of candidate journals, "available/defined"
navigation finds the nearest **already-indexed** entry strictly before (previous)
or strictly after (next) the reference. The nearest one wins — the closest date
going backward for previous, the closest going forward for next. Nothing is ever
created. When no such entry exists, the action reports it and opens nothing.

### #150 — command

Two new command types join the existing per-command configuration: **previous
available** and **next available**. They reuse the existing command settings
unchanged:

- `target` — all journals of a write type, a specific journal, or a shelf's
  journals of a write type.
- `context` — the reference date: today, the open note's date, or the open
  note's date only when it belongs to the target.
- `open mode` — active pane / tab / split / window.

The command opens the nearest existing note in its direction and never creates.
The command stays listed in the palette whenever its target has at least one
journal; when there is no note to open in that direction it shows a notice
("No previous available note" / "No next available note") rather than hiding
itself — matching the global _Open previous/next note_ commands. Both types are
available for every write type (day, week, month, quarter, year, custom).

### #215 — calendar toolbar item

A new toolbar item renders a **previous** and/or **next** arrow on a journal
view's toolbar. Its configuration is:

- `target` — the write type it walks (day/week/month/quarter/year), resolved to
  journals within the view's current shelf context.
- `previous` / `next` — which arrows to show.

Clicking an arrow takes the **active note** as the reference: if the open note is
an entry of the target, it steps from that note's date; otherwise it falls back
to **today**. It then opens the nearest existing note in that direction. An arrow
is disabled when the target resolves to no journals, and shows a notice when no
note exists in that direction.

## Scope

- No change to the existing `same` / `next` / `previous` / compound command types
  or to note creation.
- The toolbar item walks one write type per item; multiple items cover multiple
  write types (mirrors how `period-buttons` is configured).
- "Nearest" is by date only. When two journals in the target share the nearest
  date, both notes at that date open (consistent with the existing multi-journal
  open at one anchor).

## Acceptance scenarios

- A _previous available_ command with target "all day" and context "today", run
  against daily notes seeded with gaps, opens the most recent existing daily note
  before today and does not create any note.
- The same command shows a notice and opens nothing when no earlier daily note
  exists.
- A _next available_ command opens the closest existing note after the reference,
  skipping empty periods.
- A _previous defined_ toolbar arrow, with a daily note open, opens the nearest
  earlier existing daily note (not the immediately prior calendar day when that
  day has no note).
- A _previous defined_ arrow with no matching note open steps back from today.
- A toolbar arrow whose target has no journals is disabled.

## Design notes

- **Finder.** `JournalsIndex.findNearestExisting(journalNames, from, direction)`
  returns `Option<AnchorString>`. It calls the existing per-journal
  `findPrevious` / `findNext(journal, from)` for each candidate, resolves each hit
  to its anchor via `entryByPath`, and keeps the max anchor (previous) or min
  anchor (next). This is the only new domain logic; both surfaces consume it.

- **Command integration.** `previous_available` / `next_available` join
  `commandTypeSchema` and `supportedTypes` (all write types). In
  `DynamicCommandRegistry`, `#plan` resolves these types' anchor through the
  finder over `#candidates(command)` (rather than the period-math `#anchor`
  branch), and `#run` invokes `OpenDateFlow` with `existingOnly: true`. The
  command's `check` for these types reports applicable whenever the target has a
  candidate journal (decoupled from "a note was found"), so an empty result
  surfaces as a notice on execute instead of removing the command.

- **Toolbar item.** A new `defineToolbarItem` (`key: "defined-navigation"`) with
  schema `{ target: writeType, previous: boolean, next: boolean }`, a render
  component (the arrows), and a config component. The component resolves its
  candidate journals from the target write type within the view's shelf context,
  derives the reference anchor from the active entry (else today), calls
  `findNearestExisting`, and opens via the shared open flow / `defineOpenMode`
  (so modifier-click open modes from #194 apply). Registered through
  `ToolbarItemDefinitionToken` in `src/views/module.ts`.

- **Testing.**
  - Unit: `findNearestExisting` (nearest across multiple journals, both
    directions, none-found, shared-date tie); `supportedTypes` includes the two
    new types; `DynamicCommandRegistry` plans an available type to the nearest
    existing anchor, runs with `existingOnly: true`, and reports applicable with
    no note found; toolbar item config schema; toolbar component
    (@testing-library/vue) opening the found note, disabled with no journals,
    notice with no neighbour.
  - e2e: a configured _previous available_ command over gap-seeded daily notes
    opens the most recent existing note and creates nothing; a _previous defined_
    toolbar arrow opens the nearest earlier existing note relative to the active
    note.
