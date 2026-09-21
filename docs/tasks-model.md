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

**Nothing here keeps plugin-private state.** The marker, the copied line and the
statuses all live in the notes, so a second device reading the same vault reaches
the same conclusions from the same bytes. The only store this model adds is the
phase-4 index, which is a cache derived from notes and rebuilt from them on boot.

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
  _Which_ date is the `date` role below; a task line can carry five.

**Scope.** One shape shared by every surface that asks "which items belong to
this period":

```
{ source: "note" | "notelets" | "both", depth: "literal" | "rollup" }
```

`source` selects the period note, its notelets, or both. `depth` selects the
period's own notes (`literal`) or **those plus** every journal in shelf scope
whose periods fall inside the target period (`rollup`), so a month can show its
days. Rollup **widens** `literal` rather than replacing it: a month listing that
dropped the month note's own items while showing all thirty days' would surprise
anyone who writes tasks in their monthly note.

`selection` resolves **per journal, as the walk reaches each note** — day notes
by the day journal's headings, week notes by the week journal's. A single value
cannot serve a rollup, because the journals it spans have different templates:
given a daily template with `## Tasks` and a weekly one with `## Week focus`,
either value silences one of them entirely. A `selection` given on the fence
overrides, for the single-journal case where one value is correct.

Listings take both axes. **Decoration conditions take `source` only.** Rollup
stays listing-only: the decoration engine evaluates per cell across a whole grid,
and a rolled-up year cell would walk hundreds of notes per render.

**`Scope` is what containment means.** Both its axes decide which notes to read,
and the date relation does not reach a period through notes at all — it asks
whether an item's date falls inside the period. Rolling up a date query is a
no-op at best and a double-count at worst, and `source` has nothing to bite on: a
note-property item scheduled for the 21st lives in its own note, neither the
21st's period note nor its notelets, so `note` cannot include it and `notelets`
cannot exclude it. Filtering date-related items by where they live would
contradict the relation's own definition.

So a listing asking for date-related items takes neither axis. Its options are
`provider`, `status` and `selection` alone.

An item matching a period by **both** relations is yielded **once**, deduplicated
by provider identity — path and position for a checkbox, path for a note —
carrying which relations matched, so a surface can tell them apart without
listing the item twice.

**Capability.** Three, and they do not travel together. What separates them is
what an item _is_ — a span inside a note, or a whole note:

- **movable** — its bytes relocate into another note. Only a span can: cut those
  bytes, paste them elsewhere, and it is the same task in a new home.
- **stampable** — our marker is written onto it. Same requirement, same reason.
- **retargetable** — the date it answers by is changed. Needs a _writable date_:
  an anchored token already present in the line, or a frontmatter property.

So the checkbox item is movable and stampable always, retargetable only when its
line already carries a date signifier. The note-property item is the inverse —
never movable, always retargetable. Nothing can be cut out of it: excising
`scheduled: 2026-09-21` from one note's frontmatter and pasting it into another
destroys one task and corrupts the other note. Changing that value is the whole
of moving it to another period.

The test is deliberately not "does the provider yield a position". Obsidian does
expose `frontmatterPosition` (since 1.4.0), and `FrontMatterCache` is a plain
record with no per-property spans — but even a span on the `scheduled:` line
would not make the item movable. Day Planner's split lands in the same place from
the other side: its `RemoteTimeBlock` carries neither `path` nor `position`,
beside the vault-sourced branch's comment that "its position in the file is
always known".

## Providers

Two providers. Closed set, **open-shaped**: the registry is internal, but its
boundary is drawn as though it were public, so exposing it through
`docs/plugin-api.md` later is a documentation change rather than a rewrite.
Nothing third-party registers a provider today.

Three rules make that claim falsifiable rather than aspirational:

1. **A provider's inputs are only what an external plugin could obtain** — a
   path, a period, its own settings. No reaching into DI for internal services.
2. **A provider yields plain data and declares its capabilities. Consumers branch
   on the declaration, never on the provider's identity.** No
   `provider.id === "checkbox"` anywhere: the move refuses an item because the
   item says it is not movable, not because the move knows which providers are.
   This is the load-bearing rule — without it, opening the seam means auditing
   every consumer for identity checks, which is the rewrite the phrase promises
   to avoid. It is also what makes "open" survivable, since a third-party
   provider's items would flow into listings, decorations and moves alike.
3. **Registration is a DI multi-token** — `createMultiToken<TaskProvider>`, the
   same idiom as `CodeBlockDefinitionToken` and `JournalEditSectionToken`.
   Adding a provider touches its own module and nothing else.

**Every provider carries an identification rule**, not just `note-property`. The
checkbox provider's is optional and defaults to "every list item with a task
marker", but it exists — which is where a vault-wide filter like the Tasks
plugin's `globalFilter` belongs. Without one, a shopping list or a meeting
checklist lights a day that the user's own task queries deliberately ignore.
Deciding which lines count is the provider's job, not a special case bolted to
the checkbox reader.

| Provider        | Item is                                                                | Relations         | Movable                              |
| --------------- | ---------------------------------------------------------------------- | ----------------- | ------------------------------------ |
| `checkbox`      | a list item with a task marker                                         | containment, date | yes                                  |
| `note-property` | a note matching an identification rule, dated by a configured property | date              | no — it is a note, not a span in one |

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

## One extractor

**The provider is the only thing that turns a note into items.** Every surface —
the listing, the decoration conditions, the move — asks the provider. Nothing
re-derives items from `metadataCache` on its own.

Whether the provider answers from `metadataCache` on demand or from a persistent
index sits **behind that seam**. That is what keeps the index a performance
decision rather than a fork in the model: the provider ships computing on demand,
later gains an index as a cache, and no consumer changes.

So `NoteMetadata.tasks` **goes**. It is read in exactly four lines, both of them
in `hasOpenTask` / `allTasksCompleted` (`src/decorations/engine-checks.ts:195`),
and keeping it would leave a second extractor answering the same question a
different way — the failure this model exists to prevent, reintroduced inside it.
The engine keeps `metadataFor` for title, tag, property and size; the task
conditions take items from the provider instead.

This is also what makes the `rolled` marker work everywhere. The tag sits in the
line body, and `NoteMetadata.tags` is `getAllTags(cache)` — flattened, positions
discarded — so nothing downstream of it can tell which line a tag is on. The
provider matches `cache.tags` positions against each `listItem.position` (both
extend `CacheItem`, so both carry one), with no text read. A decoration that went
on reading `metadata.tasks` would show a rolled line as open work.

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

> **Filtering is structured data the user never writes as an expression. It
> reuses the decoration condition shape.**

`{ mode: "and" | "or", conditions: TaskCondition[] }` — the same shape
`decorationSchema` already has (`src/decorations/config.ts:256`), and the same
one `bulk-add` already reuses through `filterConditionSchema`. Each condition is
a tagged-union object, the list is **flat** with one combinator, and negation is
an enumerated field inside a typed condition rather than a mechanism of its own,
exactly as `stringPropertyCondition` handles it today.

That is what settles include-versus-exclude, which is otherwise the first crack
in any "no query language" rule. It was never a second axis:

```
{ type: "heading", condition: "under" | "not-under", heading: "## Habits" }
```

There is no string for anyone to put `and not` into, so the slide from one
negation to a predicate language has nowhere to start.

**The flat keys stay, as sugar.** A fence is hand-typed YAML and nobody wants a
conditions array to say `status: open`, so each named key desugars **one to one**
into a single condition — it _is_ a condition, not a shorthand that gets parsed —
with `conditions:` available when someone needs more. Two spellings, one model,
no parser anywhere.

The line this holds is about **who owns the grammar**, not how many options
exist. Named keys and typed condition objects are a schema: they validate, they
autocomplete, they have no error messages of their own. A string the user
composes is a language, needing a parser, a precedence table and documentation.
Dataview and the Tasks plugin each own one; this plugin does not become the
third.

The condition types, and their sugar keys, are `provider`, `source`, `depth`,
`date`, `status` and `selection`. Anything
outside them is answered by handing the resolved path set to Dataview, which is
the supported form of the "use Dataview for that" answer — a DQL query cannot
resolve which notes are September's journal notes without the user hand-encoding
their folder and date-format conventions, and handing over paths the plugin
resolved makes any DataviewJS query over them correct by construction.

What this refuses is a **written expression**, not expressiveness: a priority
comparison or a text search typed as a string, a predicate with its own
precedence, anything needing a parser. More condition types are permitted and
have to be, because a surface that cannot express what a neighbouring surface can
will disagree with it about the same day.

**`date` — which date the relation reads.** A task line can carry five:

```
- [ ] Ship the release ➕ 2026-09-01 🛫 2026-09-18 ⏳ 2026-09-20 📅 2026-09-25 ✅ 2026-09-24
```

So the relation names a **role** — `due`, `scheduled`, `start`, `done`,
`created` — defaulting to `due`. Each provider resolves a role its own way: the
checkbox provider to a signifier, an emoji or a Dataview inline field; the
note-property provider to a configured property name, which is what TaskNotes'
own `FieldMapping` already is.

The same role names the **retarget** target, so dragging and filtering speak one
vocabulary. Without the axis the two providers do not mean the same thing by
"date" at all — note-property is implicitly role-based through its configured
property, while the checkbox provider would have no role whatsoever.

A single globally configured role would be simpler, and it would make "what is
due this week" and "what did I plan to start this week" mutually exclusive in one
vault.

**`status` — which item states.** It takes any type name, or a list of them, plus
two aliases so the common fence need not enumerate:

- `open` — `todo`, `in-progress`, `on-hold`
- `done` — `done`, `cancelled`
- `all` — everything left after exclusions

`rolled` is in **neither** alias. Not open, which is the whole point of it, and
not done. It is reachable only by naming it, which is what makes "show me what I
rolled forward" expressible without putting rolled work back into every open
listing.

The raw types are exposed alongside the aliases so nobody is stuck with this
document's ruling on where `on-hold` belongs.

**`non-task` is not a value you filter by.** It is an exclusion, applied before
filtering: a `non-task` item never appears in a listing, never lights a
decoration and is never picked up by a move, whatever `status` says. Naming it in
a fence means nothing.

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

## Moving items

A move copies by default: the source line stays, so the previous note remains a
record of what was actually written that day, and nothing needs a bespoke undo
spanning two files.

In move mode, where the source line is removed, **a failure between the two
writes leaves a duplicate, never a gap.** The target is written first for that
reason.

### Items nest, so movement is per subtree

Eligibility defaults to `status: open` and is set through the same axis as a
listing's. But an item can nest, and then what moves is not the item:

```
- [x] Shopping
    - [ ] milk
    - [x] bread
```

`milk` is eligible and `Shopping` is not. Moving `milk` alone lands a bare
`- [ ] milk` in the target, stripped of what it was for; moving `Shopping` too
contradicts eligibility. Dropping every `[x]` line is the naive rule and this is
where it breaks — Rollover Daily Todos #174 is that bug reported against the
incumbent.

1. **Children travel with their parent.** A subtree is indivisible when it moves.
2. **Eligibility picks _roots_, not items.** An item is a root when it is
   eligible and no ancestor of it is also being moved.
3. **An ineligible ancestor of an eligible item is carried as context** — copied
   into the target so the child keeps its meaning, **not stamped** in the source
   because it did not move, and **not counted** in the report.

So the target gets `Shopping` with `milk` under it and nothing else. `bread`
stays behind; it is done and nothing needs it. `Shopping` appears in both notes,
unstamped in the source, because it is context in one and a record in the other.

**`movable` is therefore a property of a subtree, not of an item.**

### Block references

`ListItemCache` carries `id`, so a line's `^blockid` is always visible to us, and
it needs handling in both directions:

```
- [ ] Draft the proposal ^abc1234
```

**The copy loses the id.** A block id is a **note-scoped anchor**, not part of the
task, so carrying it does not preserve a property of the item — it forges a
second claim to one anchor, and Obsidian resolves an ambiguous one arbitrarily.
That makes copy mode the worse of the two by default: links silently start
pointing somewhere the user never chose. Dropping it leaves every existing link
resolving to the source line, which in copy mode is still there.

**Move mode warns when a line carries one**, because removing it breaks every
`[[note#^abc1234]]` that pointed at it. The warning cannot say how many:
`resolvedLinks` is `Record<path, Record<path, number>>` with no anchor
information, `getBacklinksForFile` is not in the public typings, and reading
`LinkCache.link` for every note is the whole-vault walk this plugin criticises
other plugins for. So it says what is true and no more.

**Reach is unbounded, and reported.** `JournalIndex.findPrevious` binary-searches
the anchors of notes that _exist_, so it already spans gaps — after a two-week
break it finds the note from two weeks ago, which is exactly when a rollover
matters most. Bounding it by a distance strands that work to prevent a surprise a
notice prevents just as well: _"rolled 6 tasks forward from 2026-08-30, 12 days
ago"_. A number is arbitrary and will be wrong for somebody; a report is not.

The one upstream case cited against unbounded reach does not transfer. Obligator
#45 — a 2024 note used as the basis for a 2025 daily note — was caused by
**path-based sorting**: the reporter had changed their date format a year earlier
and moved the old notes into a subfolder, which broke the sort, and moving that
folder elsewhere fixed it. We resolve a note's period from its frontmatter claim
and sort resolved anchors, so a folder reorganisation cannot make an old note
sort as yesterday. The reach was not what failed there.

### What the move reports

An item `selection` excluded is **left silently**. It is sitting in the source
note under the heading the user configured it to stay in, so nothing is hidden,
and a notice belongs where the outcome is otherwise invisible.

The failure worth catching is not that some items were excluded — it is that
`selection` matched **no heading at all**, which means the heading was renamed in
the template or misspelled in settings, and which is otherwise indistinguishable
from having nothing to roll. Both produce zero. So the roll's own report carries
it, and there is no second notice and no exclusion count:

- _"rolled 6 tasks forward from 2026-09-20"_
- _"no unfinished tasks in 2026-09-20"_
- _"no `## Tasks` heading in 2026-09-20"_ — a configuration error, not an outcome

### Which settings live where

**Global, on the provider** — the marker string, the `symbol → type` map, the
identification rule. These are parsing concerns, and the rollup case forces them:
one note is read in several journals' contexts, so a marker that differed per
journal would normalize the same line to `rolled` in one reading and `todo` in
another. A status cannot depend on who asked.

**Per-journal, on the move** — `selection`, the target heading, copy-vs-move, and
whether to stamp. The first two name headings in that journal's own template, so
a global value is wrong the moment two journals have different templates. The
other two ride along free once a per-journal surface exists, with a global
default.

_"Move task to a period's note"_ takes a line from any note, including one no
journal owns, so there is no source journal to read from: **the target journal's
config applies**, because placement is about the target's template. `selection`
does not apply at all — the user picked the line.

### Where a moved item lands

Placement reuses `selection`. The two are the same list of headings read twice,
so a user who scopes a roll to `## Work` and `## Personal` has already said which
headings matter and needs to configure nothing further. In order:

1. The item came from a heading in the selection and the target has a heading
   with the same text — it lands under that one.
2. Otherwise, the configured target heading.
3. The target has no such heading — appended at the end.

Insert by `metadataCache` heading position, never a string replace. Review
rewrites `previousNoteText.replace(reviewHeading, …)` against the first match,
which is why its settings carry the warning _"BE CAREFUL: it must be unique in
each daily note"_. Real positions make a duplicated heading resolve to the first
occurrence, which is a defensible answer rather than a corrupting one.

The target note need not exist. `ensureNote` writes the rendered template body
and only then the frontmatter claim, so a visible note already has its template
headings — there is nothing to poll for, which is what every incumbent had to do.

**Notelets are both a source and a target, but not for every command.** A move
reads from them when `source` includes them — an action item captured in a
meeting is exactly the kind of thing that should follow you forward, and the
default `source: note` keeps it opt-in.

Writing to one splits by command. A **bulk rollover** targets the period note
only: with zero or three Meeting notelets that day there is no non-arbitrary
choice, and nothing to make one from. The **single-task commands** already put a
picker in front of the user, so that picker offers the period note and the
period's **existing** notelets alongside it. Creating a notelet is
`CreateNoteletFlow`'s work — it picks a type and asks its questions — and a move
does not trigger it.

Placement inside a notelet degrades one step: match the source heading if the
notelet has it, otherwise append at the end. The configured target heading is a
journal-level setting describing the journal's template, and it says nothing
about a notelet type's.

### Recurring lines

Retargeting the date on a line carrying `🔁` is **confirmed, not silently
allowed**. Tasks computes the next instance from the due date unless the rule
says `when done`, so overwriting that date moves the whole series, not the one
occurrence the user dragged.

The occurrence-only outcome they almost certainly want — this week on Thursday,
the series still Tuesdays — needs a second line authored with the recurrence
stripped, which is emitting task syntax rather than overwriting a token we found.
The write rule forbids it, so the choice is between shifting the series and
refusing; there is no third behavior to offer.

The confirmation states the consequence rather than asking for assurance —
_"Water plants repeats weekly. Moving it to Sep 24 will also move every future
repeat to Thursdays."_ — and its **don't ask again** checkbox is the setting,
created at the one moment the user understands what it means.

This is affordable because the case is rare: Tasks generates the next instance in
the _same file_, so a recurring task parked in a period note accumulates there,
and people keep recurrence in a static note instead. It is also a deliberate
exception to the project's rule that a notice is added only when the outcome is
otherwise invisible — it qualifies, because a shifted series stays invisible
until the next instance generates days later.

**Moving the line between notes is never confirmed.** That is containment: bytes
identical, recurrence and due date untouched.

Copy-by-default also makes a deep reach recoverable — nothing was destroyed, a
stale list is merely sitting in today's note — while under-reaching loses real
work. If rollover ever runs automatically on note creation the notice fires
unread, which is an argument for keeping it manual, not for adding a bound.

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
   `source` on decoration conditions. The path-set half of the API already
   shipped in 3.4.0 — `existingNotes(selector)` returns every note the matched
   journals have written and `notesInRange` narrows it to a window, both
   resolving custom intervals and non-obvious week boundaries. What is left is
   `previousNote` / `nextNote` and `depth` handling.
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

## Still to establish

Neither is a decision — both are measurements this model is waiting on.

- **The default status table.** Derived, not guessed: the union of symbols across
  the status collections Tasks ships, each assigned its majority type, with the
  symbols where collections disagree recorded rather than silently resolved.
- **The phase-4 index's memory and cold-boot cost**, measured against realistic
  **link density** rather than note count. Time Ruler hung indefinitely on a
  2,000-note vault, and an anonymised copy of that same vault did not reproduce
  it.
