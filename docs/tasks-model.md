# Tasks model

This document owns the vocabulary, the write rule and the filtering boundary for
everything task-related in the plugin. [Epic #344](https://github.com/srg-kostyrko/obsidian-journal/issues/344)
and its children are the **work queue**; this file is the **model**. Where a
ticket and this file disagree, this file wins and the ticket is stale.

The model exists because four independent requests — tasks integration (#130),
rollover (#73), moving tasks between periods (#218) and CalDAV (#70) — read as
one feature and are not. What they share is a single relation: **which period
does a task belong to, and where does that period's note live.** That mapping is
the thing no task plugin has and this plugin already owns.

**The plugin does not become a task manager.** It answers the period question and
renders the result.

## Vocabulary

**Item.** Not _task_. The noun is deliberately wider, because a task is a
checkbox line to one user and a whole note to another, and the plugin does not
get to pick. An item is whatever a provider yields.

**Provider.** Decides what counts as an item, and normalizes that item's native
status into the shared status vocabulary below. This is where "the plugin never
decides what a task is" actually lives: the user enables a provider, and the
provider carries the definition.

**Relation.** Exactly two ways an item relates to a period:

- **containment** — the item lives in a note belonging to that period. Needs no
  parsing and works for every setup.
- **date** — the item carries a date falling in that period, wherever it lives.

**Scope.** One shape shared by every surface that asks "which items belong to
this period":

```
{ source: "note" | "notelets" | "both", depth: "literal" | "rollup" }
```

`source` selects the period note, its notelets, or both. `depth` selects the
period's own notes (`literal`) or gathers from every journal in shelf scope whose
periods fall inside the target period (`rollup`), so a month can show its days.

Listings take both axes. **Decoration conditions take `source` only.** Rollup
stays listing-only: the decoration engine evaluates per cell across a whole grid,
and a rolled-up year cell would walk hundreds of notes per render.

`depth` pairs with **containment only**. It decides which notes to read, and the
date relation does not reach a period through notes — it asks whether an item's
date falls inside the period, which already spans all of it. Rolling up a date
query is a no-op at best and a double-count at worst.

An item matching a period by **both** relations is yielded **once**, deduplicated
by provider identity — path and position for a checkbox, path for a note —
carrying which relations matched, so a surface can tell them apart without
listing the item twice.

**Capability.** An item is movable and stampable only if its provider yields both
a path and a position. Day Planner reached the same split independently — its
`RemoteTimeBlock` has neither field, under the comment that vault-sourced blocks'
"position in the file is always known". An item with no position is render-only,
structurally rather than by policy.

## Providers

Closed set, **open-shaped**: the registry is internal, but its boundary is drawn
as though it were public, so exposing it through `docs/plugin-api.md` later is a
documentation change rather than a rewrite. Nothing third-party registers a
provider today.

**Every provider carries an identification rule**, not just `note-property`. The
checkbox provider's is optional and defaults to "every list item with a task
marker", but it exists — which is where a vault-wide filter like the Tasks
plugin's `globalFilter` belongs. Without one, a shopping list or a meeting
checklist lights a day that the user's own task queries deliberately ignore.
Deciding which lines count is the provider's job, not a special case bolted to
the checkbox reader.

| Provider        | Item is                                                                | Relations         | Movable                      |
| --------------- | ---------------------------------------------------------------------- | ----------------- | ---------------------------- |
| `checkbox`      | a list item with a task marker                                         | containment, date | yes                          |
| `note-property` | a note matching an identification rule, dated by a configured property | date              | no — its date is frontmatter |
| `remote`        | an event or VTODO from an external calendar                            | date              | no — no path                 |

`note-property` is what makes the plugin work for TaskNotes (1.4M installs),
where a task is a note tagged `#task` or identified by a property, carrying
`due` / `scheduled` in frontmatter. Without it the compatibility claim above is
false for those users: a TaskNotes task contributes no list item, so a
checkbox-only listing returns nothing and their calendar stays unlit.

`src/views/blocks/day-notes/day-notes.ts` is prior art for the lookup
`note-property` needs — configurable property name and format, falling back to
`ctime`/`mtime`. It is **not** shared: it resolves one hardcoded date role
(created) for one view block, and it iterates `allMarkdownNotes()` per call. A
provider feeding decorations cannot do that, so `note-property` carries its own
date→paths index. Generalizing day-notes into a shared capability was considered
and declined — it costs a migration on a shipped settings slice and buys one
index.

## The write rule

> **We add only tokens the user named; we overwrite only tokens we found.**

Four clauses, all binding:

1. **Never re-emit a line from a parsed model.** Parsing a task line into
   `{ status, title, tags, dates }` and rebuilding it imposes the model's
   ordering and silently drops everything the model has no field for.
2. **Overwrite only an anchored token that is already present** — a Tasks emoji
   signifier, or a Dataview inline field. The role being retargeted is named by
   the user, not inferred from a line carrying several candidates.
3. **Never insert a signifier that was not there**, unless the user has declared
   it and opted in. Default off. Inserting one guesses the vault's dialect, and
   it also authors a semantic change: an undated task that gains a due date
   enters queries it was never in, and becomes overdue.
4. **Added tokens are ours and user-named** — a tag the user configured, placed
   before any trailing `^blockid` so incoming block links survive.

A whole-line **move** satisfies all four trivially: bytes are cut and pasted
verbatim, so no dialect can be corrupted in transit.

### Why the rule is shaped this way

Time Ruler (64,073 installs) is the worked example of getting it wrong. Its
`taskToText` rebuilds every line from a parsed model on each drag, re-sorting
inline fields alphabetically and guessing the dialect per line. Twelve confirmed
reports across three years: tags stripped, a recurrence rule pushed into the
description, custom statuses lost, a due date removed on every reschedule, link
display text broken, the wrong dialect written back, tags relocated inside users'
notes — that last one open since April 2026, because it is not a bug but what
`taskToText` structurally does.

**Eleven of those twelve are clause 1**, not the matcher. The single matcher
failure was a loose pattern: a Day Planner time regex ate a leading number, so
`2.6 Title` became `.6 Title`. It happened inside a user-configured dialect,
which is why letting the user declare their format is not by itself a defence —
and why clause 2 requires an unambiguous anchor rather than any configured
pattern.

### What the rule permits that "never rewrite a task line" did not

The earlier wording was absolute and was already contradicted by its own tickets.
It also had a perverse consequence: it forbade **marking** a left-behind line
while permitting **deleting** it, pushing the design toward the more destructive
default.

Under the current rule:

- A copied task's source line is stamped with a configured tag, **on by
  default**. A copy that leaves the original as a live `- [ ]` is counted twice
  by every task query in the vault, forever, and that is the single largest
  cluster on Obligator's tracker — the only copy-by-default rollover plugin that
  exists. The marker is not a trailing nicety.
- A task may be dragged to a new date where its line already carries a date
  signifier, and always for a `note-property` item, whose date lives in
  frontmatter that `processFrontMatter` rewrites structurally.
- A line with no signifier is not retargetable; a drag falls back to moving the
  item between period notes, which is byte-preserving.

This is a **revisable ruling**, not a founding constraint. Re-run it if the
splice turns out to cost more than it buys.

## Filtering

> **Filtering is a fixed set of named axes with enumerated values. Never
> operators, never expressions.**

The axes are `provider`, `source`, `depth`, `status` and `selection`. Anything
outside them is answered by handing the resolved path set to Dataview, which is
the supported form of the "use Dataview for that" answer — a DQL query cannot
resolve which notes are September's journal notes without the user hand-encoding
their folder and date-format conventions, and handing over paths the plugin
resolved makes any DataviewJS query over them correct by construction.

What this refuses: priority comparisons, recurrence, text search, `AND` / `OR`,
sort and group clauses — anything that composes. What it permits is more named
axes, and it has to, because a surface that cannot express what a neighbouring
surface can will disagree with it about the same day.

**`selection` — which lines inside the notes.** Its inputs are headings and tags,
both of which `metadataCache` already resolves without interpreting a single task
line. Both include and exclude forms have demand upstream: roll only what sits
under one heading, and roll everything _except_ what sits below a given header —
the second from a reporter keeping habits and trackers in the daily note.

The axis is shared by listings and moves, not reserved to moves. A user who
scopes a rollover to `## Tasks` expects the month listing to agree; two surfaces
in the same plugin answering "what is open on this day" differently is the same
failure that adding `source` to the decoration conditions exists to prevent.

It also earns its place on a rollup listing independently. A daily template
carrying `## Tasks`, `## Habits` and `## Log`, rolled up across a month, produces
a listing in which habit and log checkboxes outnumber the tasks.

**A move cannot delegate.** A listing that wants something outside the axes can
hand its path set to Dataview; a move has to decide for itself which lines to
cut. So `selection` is not optional for moves the way it is for listings — an
unscoped rollover over a template that seeds recurring checkboxes duplicates
those checkboxes every day, which is the single most common support thread on
every incumbent.

## Status normalization

Each provider maps its native status into a shared type set — `todo`, `done`,
`in-progress`, `cancelled`, `on-hold`, `non-task`, `rolled` — and **an
unrecognised status normalizes to `todo`.**

That default is the decisive one, and it matches the Tasks plugin (4.2M
installs). What ships today is the opposite. `NoteMetadataService` maps
`{ completed: item.task !== " " }`, so any marker other than a space counts as
completed and a note whose tasks are all `- [/]` reports `has-open-task` false
and `all-tasks-completed` **true** — a day holding only in-progress work
decorated as finished. Adopting `todo` as the unknown default is therefore a
behavior change, not a clarification.

### The map

Which markers mean what is **configurable**, as a `symbol → type` map rather than
a flat list of done markers, so a vault where `[/]` means in-progress agrees with
both plugins at once.

That map is a strict subset of the Tasks plugin's `StatusConfiguration`, which is
`symbol → { name, nextSymbol, type }`. `nextSymbol` is what clicking a checkbox
cycles to; the plugin never toggles a task, so it carries symbol and type and
nothing else.

**We do not read their settings.** Their `apiV1` is three methods and exposes no
statuses, so reaching the map would mean walking
`app.plugins.plugins["obsidian-tasks-plugin"]` — an optional dependency on
undocumented internals, which silently changes our behavior when they ship a
release. The model's "no dependency on any task plugin" is exactly this case.

**The shipped default is a middle ground across the popular themes**, not the
Tasks minimum. A themed vault registers a dozen custom symbols, and a default
covering only `' '`, `x`, `/`, `-`, `h` and `Q` would type all of them unknown.
The table is **derived, not guessed**: take the union of symbols across the
status collections Tasks ships (ITS, Minimal, AnuPpuccin, Aura, Ebullientworks,
LYT Mode, Things, SlRvb), assign each the majority type, and record the symbols
where collections disagree rather than silently picking one.

`X` carries `done` alongside `x`. Many themes render capital X as complete, and
today every non-space marker counts as done — so omitting it turns those days
from done to open, which is the one regression this change would otherwise cause.

**A symbol whose meaning is decorative rather than a state of work maps to
`non-task`, not `todo`.** A `[!]` important callout or a `["]` quote typed as
`todo` lights its day as having open work **forever**: nothing completes it, so
the dot never clears. That is worse than the bug being fixed, because it is
unclearable rather than merely wrong. The rule also makes the default err toward
silence on symbols we are unsure about, which is the right direction for a
behavior change landing on vaults people already run.

**Changing this changes existing vaults**: a decoration reading "all tasks
completed" stops matching notes that use `[/]`, `[-]` or `[>]`.

### `rolled`, and why the marker is both a tag and a type

A line the move left behind carries a marker, and the marker does **two jobs that
are not alternatives**.

The complaint it exists to answer is that a copied task is counted twice by every
task query in the vault, forever. That complaint lives in the user's _own_
queries, so the marker has to be excludable there: an appended tag is, natively,
in Dataview, Tasks and core search alike, with nothing registered anywhere. A
type cannot do that job — Tasks resolves an unknown symbol to `TODO`, so a line
we consider rolled still counts as open to them.

But a tag alone leaves our own surfaces wrong: the line is still a plain `- [ ]`,
so the listing shows it as open, the calendar lights the day, and the move's
eligibility check needs a second rule of its own to avoid picking it up again on
a re-run.

So both. **The provider reads the marker and normalizes it to `rolled` rather
than `todo`.** The tag serves the user's queries, the type serves ours, and the
marker is **one setting owned by the provider** — the move writes it, the
provider reads it. Two settings would drift, and the day they did, every
previously rolled line would silently turn open again.

`>` maps to `rolled` by default too, for vaults already using that convention,
and it is already common across the theme collections above — so the type
arrives with an established symbol rather than needing one invented.

The cost: this is the one type the Tasks plugin does not have. A user reconciling
both has to register the status on their side as well.

## Build order

Cut by **provider**, not by relation. The expensive thing is not the date
relation — it is the checkbox provider's implementation of it.

1. `checkbox` provider, **containment** only; the listing and its surfaces;
   `source` on decoration conditions; the path-set API.
2. `note-property` provider with its date→paths index — small, `metadataCache`
   only, no text cache, no `cachedRead`, and it covers TaskNotes plus every
   hand-rolled `due:` / `scheduled:` convention.
3. Moving items between periods.
4. `checkbox` provider, **date** relation: a vault-wide index over every checkbox
   in the vault, with its own extracted-text cache because `ListItemCache` carries
   no text. The only piece with unmeasured memory and cold-boot cost.

The index in step 4 stores items **flat**, with a parent reference at most. Any
nesting is derived at render time behind a visited set. Time Ruler's indefinite
hang was not volume — it was a 2,000-note vault whose tasks formed a link graph
its `descendants()` recursion walked with no cycle guard, and their fix was to
remove the capability. Measure that step against realistic **link density**, not
note count.

## Open questions

- Recurring lines are refused for retargeting until the interaction with Tasks'
  recurrence generation is verified. Rolling one forward is already checked —
  Tasks creates the next instance in the same file, so it starts generating in
  the new note.
- Whether the left-behind marker's default belongs to the journal rather than
  being global. A daily note is a record of what was written that day for some
  users and a capture surface for others, and the two want different defaults.
- How far back a rollover may reach. `JournalIndex.findPrevious` spans gaps by
  construction, so "the previous note" is not "yesterday" — unbounded, previous
  period only, or bounded and reported.
- Whether a moved item lands under the heading it came from when the target has a
  matching one, falling back to a configured target heading. That folds
  `selection` and target placement into one rule, and it is the shape five voices
  upstream sketched. Also unanswered: what happens to an item that `selection`
  excluded but that is otherwise unfinished — silently left, or reported.
