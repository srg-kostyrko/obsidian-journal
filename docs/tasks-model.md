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

**Native filtering is status only** — `open` / `done` / `all` over the normalized
vocabulary. Anything richer is answered by exposing the resolved note paths so
Dataview can query them correctly, never by growing fence options into a query
language.

**Document structure is not task syntax.** Headings, tags and properties are
already in `metadataCache` and reachable without interpreting a single task line,
so scoping a move by heading does not breach the rule above. The distinction is
what is being read, not how expressive the result is.

The Dataview escape hatch is also unavailable to a **move**: a listing can hand a
richer query to Dataview, but a move has to decide for itself which lines to cut.

## Status normalization

Each provider maps its native status into a shared type set — `todo`, `done`,
`in-progress`, `cancelled`, `on-hold`, `non-task` — and **an unrecognised status
normalizes to `todo`.**

That default is the decisive one, and it matches the Tasks plugin (4.2M
installs). What ships today is the opposite. `NoteMetadataService` maps
`{ completed: item.task !== " " }`, so any marker other than a space counts as
completed and a note whose tasks are all `- [/]` reports `has-open-task` false
and `all-tasks-completed` **true** — a day holding only in-progress work
decorated as finished. Adopting `todo` as the unknown default is therefore a
behavior change, not a clarification.

Which markers mean what is configurable, as a marker→type map rather than a flat
list of done markers, so a vault where `[/]` means in-progress agrees with both
plugins at once.

**Changing this changes existing vaults**: a decoration reading "all tasks
completed" stops matching notes that use `[/]`, `[-]` or `[>]`.

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
