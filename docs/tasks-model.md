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
task index, which arrives in phase 1 as a cache derived from notes and rebuilt
from them on boot.

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

`selection` (defined in Filtering, below) resolves **per journal, as the walk reaches each note** —
day notes by the day journal's headings, week notes by the week journal's. A single value
cannot serve a rollup, because the journals it spans have different templates:
given a daily template with `## Tasks` and a weekly one with `## Week focus`,
either value silences one of them entirely. A `selection` given on the fence
overrides, for the single-journal case where one value is correct.

Per-journal resolution needs a journal, and the date relation reaches items no
journal owns — a checkbox in a project note, dated next Friday. For those the
fence's explicit `selection` applies if one was given, and **nothing is filtered
if none was**, because there is no template whose headings could be meant. A
`note-property` item has no headings at all, so the condition drops out for it
entirely, per the rule below.

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

**`checkbox` is enabled by default; `note-property` is not.** The sentence above
— the user enables a provider — is true of the second and false of the first.
`has-open-task` works today with no configuration at all, so a checkbox provider
that shipped off would silently stop every decoration anyone already has from
matching the moment they upgrade. It ships on, with an empty identification rule,
which reproduces today's behavior exactly. `note-property` cannot ship on: it
has no meaning until someone names a date property, and enabling it blind either
matches nothing or sweeps in every note carrying a stray `due:`.

The same reasoning bounds the status map's default. It may move any symbol except
`' '` → `todo` and `x` → `done`, which is what every existing vault relies on.

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

**The mapping is per provider, and its shape is the provider's own.** The model
says each provider normalizes its native status; what follows specifies the
checkbox provider's version, not the model's.

- **`checkbox`** — a `symbol → type` map, configurable, rather than a flat list
  of done markers, so a vault where `[/]` means in-progress agrees with both
  plugins at once.
- **`note-property`** — a configured status _property name_ plus a
  `value → type` map. Its statuses are hand-typed strings rather than single
  characters, so matching is case-insensitive, and the defaults mirror what
  TaskNotes ships. The property name is configurable for the same reason the date
  property is: `FieldMapping` makes `status` a settable key there.
- **Unknown → `todo` in both.** An unrecognised state is not a finished one.

**Recognition is many-to-one; writing is one-to-one.** Several symbols map to
`done` — `x` and `X` in the default map alone — so a map read backwards does not
name what ticking should write. Each type therefore carries one **canonical**
value, configurable, and every other entry mapping to that type is
recognise-only.

Ticking is then symmetric: the checkbox provider writes the canonical symbol for
`done`, the note-property provider writes the canonical value for `done` into the
configured property. A third provider brings its own shape and nothing else
changes.

That map is a strict subset of the Tasks plugin's `StatusConfiguration`, which is
`symbol → { name, nextSymbol, type }`. `nextSymbol` is what clicking a checkbox
cycles to; the plugin never toggles a task, so it carries symbol and type and
nothing else.

**We do not read their settings.** Their `apiV1` is three methods and exposes no
statuses, so reaching the map would mean walking
`app.plugins.plugins["obsidian-tasks-plugin"]` — an optional dependency on
undocumented internals, which silently changes our behavior when they ship a
release. The model's "no dependency on any task plugin" is exactly this case.

**The shipped default is Tasks' own core mapping**, and nothing more:

```
' '      → todo
'x' 'X'  → done
'/'      → in-progress
'-'      → cancelled
anything else → todo
```

Those five cases are `Status.getTypeForUnknownSymbol`
(`obsidian-tasks/src/Statuses/Status.ts`) verbatim, so `X` needs no separate
justification — it is done to them already, and today every non-space marker
counts as done here, so omitting it would turn those days from done to open.

A larger default was specified earlier and the derivation **refuted it**. The
eight status collections Tasks ships — AnuPpuccin, Aura, Border, Ebullientworks,
ITS, LYT Mode, Minimal, Things — carry **57 distinct symbols between them and
disagree about exactly one** (`d`, todo in four and in-progress in one). Of those
57, **43 map to `TODO`**, which is already the unknown default, so listing them
changes no behavior at all. What is left is `x`/`X`/`/`/`-`, which core already
covers, and AnuPpuccin's speech-bubble digits `0`–`9` as `NON_TASK` — one collection out
of eight, not a majority. Deriving a middle ground across all of them yields a
single entry core does not already have.

**A "decorative symbols map to `non-task`" rule was also specified, and it is
wrong.** Each theme status carries a `nextSymbol`, the marker clicking it cycles
to, and **all 43 of those `TODO` symbols cycle to `x`** — `!` Important, `?`
Question, `*` Star, `"` quote, `i` Information, `b` Bookmark, every one. Their own
model says these are tasks you complete, not annotations. The rule's premise —
that a `[!]` line lights its day forever because nothing completes it — is false:
it ticks like any other box. The only statuses that do not cycle to done are the
speech bubbles, which cycle to themselves, and the terminal `x`/`X`/`-`.

A user whose vault uses a themed symbol set registers it in the map, as they
already do in Tasks.

**Changing this changes existing vaults**: a decoration reading "all tasks
completed" stops matching notes that use `[/]`, or any marker the default map
does not name — `[>]` among them. `[-]` is unaffected: it still maps to
`cancelled`, which is still in the done alias, the same as before this map
existed.

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

**`>` does not map to `rolled` by default.** It is "Rescheduled" and typed
`TODO` in all eight collections, and cycles to `x` like any other — so defaulting
it to `rolled` would diverge from every theme and from core at once. Only the
configured marker produces `rolled`; a user who wants `>` to mean it says so in
the map.

The cost: this is the one type the Tasks plugin does not have. A user reconciling
both has to register the status on their side as well.

**Changing the marker orphans every line already stamped.** They stop normalizing
to `rolled`, so they read as `todo` again — reappearing in open listings,
relighting the calendar, and becoming eligible for the next rollover. That is
accepted, with the consequence stated at the point of change, the same way the
recurring confirmation works. It needs no accumulating list of historical
markers, and it is reversible: change the setting back and the lines read as
rolled again, because nothing was ever written to a note.

What must **not** happen is an offer to rewrite. Re-stamping every previously
rolled line across a vault to repair a settings change would be the most
destructive operation in the plugin.

## One extractor

**The provider is the only thing that turns a note into items.** Every surface —
the listing, the decoration conditions, the move — asks the provider. Nothing
re-derives items from `metadataCache` on its own.

How the provider fills the index sits **behind that seam**. A central index sits in
front of the providers from phase 1: providers push item sets into it and every
consumer reads it synchronously, so no two surfaces can disagree. Phase 1 bounds
the fill set to notes the plugin owns — period notes and their notelets. Phase 4
widens that fill set to the vault; it does not change the seam.

The index stores two tiers. Structure — status, position, tags, capabilities —
fills synchronously from `metadataCache`, so a decoration is correct on first
paint. Line text hydrates lazily, keyed by `(path, mtime)`, which is why
`display.markdown` is `null` until something asks for it.

So `NoteMetadata.tasks` **goes**. It is read in exactly four lines, all of them
inside `hasOpenTask` and `allTasksCompleted`
(`src/decorations/engine-checks.ts:195`),
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

A query has **three parts**, and only the middle one is a condition list:

- **scope** — `provider`, `source`, `depth`, `date`. Flat, named, enumerated.
  These decide _what gets gathered_, not which items survive, so they are never
  conditions: `mode: "or"` over a `source` is meaningless, and an array would
  make `source` and `date` expressible together, which "Scope is what containment
  means" rules out. Flat keeps that combination unwritable rather than merely
  discouraged.
- **filter** — `{ mode: "and" | "or", conditions: TaskCondition[] }`, holding
  `status`, `heading` and `tag`. This is the part that mirrors decorations.
- **sort** — flat.

The filter is the same shape
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
conditions array to say `status: open`, so each filter key desugars **one to
one** into a single condition — it _is_ a condition, not a shorthand that gets
parsed — with `conditions:` available when someone needs more. A scope key sets a
scope field and has no condition form at all. Two spellings, one model, no parser
anywhere.

**The filter reuses identification's condition types.** `tag` and `heading`, exactly as
`src/tasks/conditions.ts` defines them for a provider's identification rule, plus a `status` arm in
the same shape. There is no separate `selection` type.

An earlier draft merged headings and tags into one `selection` condition so that a single fence key
could desugar one to one. That constraint was self-inflicted: it followed from choosing one key
first. Two keys — `heading:` and `tag:` — each desugars into one condition of a type that already
exists, and `identifies`' own `headingsOf` and `tagsOf` answer both without a second implementation.

Where this document says "selection", read "the filter's heading and tag conditions". The per-journal
default those sentences describe is real and is stored on the journal, under `tasks.filter`.

The line this holds is about **who owns the grammar**, not how many options
exist. Named keys and typed condition objects are a schema: they validate, they
autocomplete, they have no error messages of their own. A string the user
composes is a language, needing a parser, a precedence table and documentation.
Dataview and the Tasks plugin each own one; this plugin does not become the
third.

The keys are `provider`, `source`, `depth` and `date` in scope, `status`,
`heading` and `tag` in the filter, plus `sort`. Anything
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

**`sort` — one key, enumerated:** a date role, `status`, or `document` for the
order the lines are written in, which is the default. It needs no parser and
refusing it would push people to Dataview for something trivial.

**A sort reorders siblings, never the nesting.** It is applied level by level —
across the roots, then within each parent's children — so a subtree stays
contiguous and below its parent whatever the key. A flat re-sort would separate a
context row from the child it was pulled in to anchor, which is the only reason
that row exists. For `status` the order is `todo`, `in-progress`, `on-hold`,
`rolled`, `done`, `cancelled`: `rolled` sits between the open statuses and the
done ones because it is neither, and a listing sorted by status is asking what
still needs the user. For a date role, an item carrying no date of that role
sorts last, so naming a role never buries the items that answer it.

**The listing is flat, and a sort reaches across the whole of it.** One row per
item, each carrying the note it came from; there is no period → source → item
tree of the kind the notelets listing builds. A rollup therefore does **not**
group by source note — under `document` the rows happen to come out note by note,
because document order is the order the notes were walked in, but under `status`
or a date role the rows of every source note interleave freely. That is the
point: "everything still open this month, by due date" is exactly the question a
rollup exists to answer, and it cannot be asked of a listing that sorts only
within each note.

This binds anything that renders these rows. A renderer must **not** derive
groups by scanning consecutive runs of `row.source` — under any non-default sort
that yields fragmented groups, the same note opening several times down the page.
The source belongs on the row, beside the item, rather than folded into a
heading above a run of rows.

**`group` is deferred**, not refused — and on the honest ground that **nothing
groups today**. A user-chosen grouping has to say how it composes with the sort,
which currently owns the whole ordering, and nobody has asked yet. When someone
does, the question is how grouping and a global sort interact, not whether
grouping is allowed.

**A condition that cannot apply to an item is _dropped_ for that item**, before
the filter is evaluated. Not false, and **not true** — removed from the set, so
it neither excludes the item nor votes for it. An item every condition drops out
of matches, the way an empty condition set does.

Evaluating it as **false** returns **zero** note-property items for a fence
saying `heading: "## Tasks"`, saying nothing about why — the user asked about
their daily notes' internal structure and did not ask to drop a provider.
Evaluating it as **true** is worse, and only under `or`: `heading under ## Tasks`
_or_ `status done` would return every open note task, because the inapplicable
heading condition alone would carry them. Dropping is the only reading that
behaves under both combinators.

`status` applies to everything. `selection` applies only to an item with a
position inside a note. The rule is stated generally so the next condition type
inherits it, and the escape for someone who wants line items only is the
`provider` scope key, which is the right place to say which kind of thing you are
looking at.

The cost is that `mode: and` with a heading condition does not narrow note items,
so "under `## Tasks` and open" returns open note-tasks whatever their headings.
That reads loose; the alternative silently removes an entire provider's items,
which is an evening of debugging before someone files "the listing is broken".

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

**What still differs.** Identification carries the same `tag` and `heading` condition types the
filter does, but with no fence sugar to keep one-to-one — it is configured in settings, not
hand-typed YAML — and a different empty-list meaning: identification's empty condition list means
_everything_, where an empty decoration condition list means _nothing_.

## Ticking an item

A listing renders items and lets them be ticked. That is a write into a task
line, and it clears the rule: the status character is always present, so it is a
token we found, and the user named the value by clicking. The symbol written is
whatever the status map assigns to `done`.

**A recurring line is the exception, and it is silent if missed.** The Tasks
plugin generates the next instance when the checkbox is toggled through _its own_
handler. A programmatic file write does not go through it, so ticking
`- [ ] Water plants 🔁 every week` in our listing would mark it done and never
create next week's — the series just stops, with nothing failing loudly.

Their `apiV1` is `createTaskLineModal()`, `editTaskLineModal(line)` and
`executeToggleTaskDoneCommand(line, path)`. There is no read API, which is why
this model reads markdown itself — but the one thing they do publish is exactly
this toggle.

So:

- **no `🔁` on the line** — write the status character ourselves. No dependency,
  works for everyone.
- **`🔁` present** — delegate to `executeToggleTaskDoneCommand` when Tasks is
  loaded. When it is not, do not toggle silently: the recurrence syntax is theirs
  and inert without them, so refuse or say that the series will not advance.

Nothing requires Tasks and everything works without it, which is what "no
dependency on any task plugin" has to mean in practice. The capability check and
fall back is the discipline `TemplaterService` already applies to
`parse_commands`.

Rendering is verbatim. A line is shown as written, dialect signifiers included;
nothing is prettified away, for the same reason nothing is re-serialized.

**But items are not uniform in what they render**, because a note-property item
has no line at all. So the item **declares its display form**:

```
display:
  | { kind: "line", markdown }
  | { kind: "note", path, title }
```

The listing branches on `kind` — data the item carries — never on which provider
produced it. That is the first real test of the rule that consumers read declared
capabilities rather than provider identity, and it is where the obvious
implementation would have broken it: `if (item.provider === "checkbox")` in the
very first consumer.

A `note` item renders as a link, so clicking opens the task note, and its
`title` comes from the provider's configured title property where one is mapped —
TaskNotes' `FieldMapping` has `title` as a settable key — falling back to the
basename. Ticking it writes its status **property**; there is no status character
to overwrite.

## Decorations ask the same question

`has-open-task` and `all-tasks-completed` are hardcoded points in a space that is
no longer small — seven statuses, two providers, a `date` role, `source`. A
listing can ask whether there are in-progress items in the notelets; those two
conditions cannot. Two surfaces that cannot express the same question will
disagree about the same day, which is what this whole model is built to avoid.

So both are replaced by one condition carrying a scope and a filter:

```
{ type: "tasks", quantifier: "any" | "all" | "none", scope: {…}, filter: {…} }
```

- `has-open-task` becomes `any` over `status: open`
- `all-tasks-completed` becomes `all` over `status: done`
- `none` becomes expressible for the first time — "this day has no open work" as
  a condition rather than a decoration someone has to invert

Two details are load-bearing:

- **`all` means non-empty and every.** `allTasksCompleted` returns `false` for a
  note with no tasks today (`engine-checks.ts:201`). Vacuous truth would light
  every empty day in the calendar.
- **The scope inside the condition still refuses `depth`.** The rollup ban on
  decorations is unchanged — the engine evaluates per cell across a whole grid.

This is a schema change to configs people already run, so it carries a
**deterministic rewrite** of the two old condition types into the new one, not a
release note.

## What the API exposes

The path set answers _"which notes are September's"_, which is genuinely
unresolvable in DQL. It does **not** answer _"which items, with what status"_: a
consumer handed thirty paths still parses the task lines itself and still has to
decide what `[/]` means, and it cannot reach the same answer we do, because the
status map is user configuration living in our settings. Their query and our
calendar then disagree about the same day — the failure this model exists to
prevent, leaking into user-written queries.

So the API gains one call, alongside the `noteletsFor` precedent
(`docs/plugin-api.md:53`):

```ts
tasksFor(selector, date, options?): Promise<readonly TaskItem[]>;
```

It returns resolved items — path, `display`, normalized `status`, dates, and
which relation matched. Its options are the **flat sugar keys only**: `source`,
`depth`, `date`, `status`. No `conditions` array, no `mode`, nothing about
providers.

That is deliberate. A consumer gets agreement with our calendar for free, and the
public surface commits to none of the parts still moving — which is what "closed
now, open-shaped" has to mean in practice, and this is the first place it would
have been quietly violated by exposing the whole query model.

It is still a commitment: `docs/plugin-api.md` carries a stability policy, and
this call falls under it.

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

1. **An eligible root's subtree is indivisible.** Everything under it travels
   with it, whatever the children's own statuses.
2. **Eligibility picks _roots_, not items.** An item is a root when it is
   eligible and no ancestor of it is also being moved.
3. **An ineligible ancestor of an eligible root is carried as context** — copied
   into the target so the child keeps its meaning, **not stamped** in the source
   because it did not move, and **not counted** in the report. A context ancestor
   carries **only the branches leading to roots**, not its whole subtree: it is
   there to give the roots their meaning, not to be moved itself.

So the target gets `Shopping` with `milk` under it and nothing else. `bread` is a
sibling of the root under a context ancestor, not part of a root's subtree, so it
stays behind — which is rule 3, not an exception to rule 1. `Shopping` appears in both notes,
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
- _"rolled 4 tasks; 2 note tasks were not moved"_ — see below

### A bulk rollover moves line items only

A note-property item cannot be rolled forward by copying, because there is
nothing to copy: moving it to another period means **changing its date
property**. That is the same command with none of its safety — no copy left
behind, no marker, no recovery by duplicate, and irreversible where the checkbox
path deliberately is not.

So a bulk rollover skips note items, **and says so**. Silently skipping them
makes the report lie: a TaskNotes user would run it, nothing would happen, and
the notice would read "no unfinished tasks" — which is exactly the misconfigured
case the report above exists to distinguish.

Retargeting note items in bulk, if it is ever wanted, is a **separate command**
with its own confirmation, not a flag on this one.

The general rule behind it: **a command whose safety argument depends on a
capability refuses items lacking that capability rather than degrading to a
different operation.** Copy-by-default is what makes bulk rollover acceptable
with no undo; applying the same command to items that cannot be copied quietly
removes the justification.

### Which settings live where

**Global, on the provider** — the marker string and the `symbol → type` map. These are
parsing concerns with no owner to consult: a checkbox in a project note no journal owns
must normalize exactly as one in a day note, and a status cannot have two values.

**Identification is two layers.** A global rule on the provider applies everywhere,
including notes no journal owns. A journal may add its own rule, composed `inherit`
(the default), `narrow` (global and journal) or `replace` (journal alone). This is
deterministic despite the rollup: a note has exactly one owning journal, so the rule
applied is the _owner's_, whoever is reading — a month rollup walking a day note reads
it as a day-journal note. An earlier version of this section ruled identification
global-only by conflating owner with asker.

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

**Locate the heading in the content being written, not in `metadataCache`.** The
move is already a read-modify-write on the target, so it holds that note's text;
scanning it for a whole-line heading match is deterministic and depends on
nothing else. Reading cache positions would be a lag bug: `ensureNote` guarantees
the body is on disk before the frontmatter claim appears, but it guarantees
nothing about when `metadataCache` has **parsed** it, so a move into a
just-created note could see no headings at all and silently append to the end.

That is not a licence for a string replace. Review rewrites
`previousNoteText.replace(reviewHeading, …)` against the first match anywhere in
the note, which is why its settings carry the warning _"BE CAREFUL: it must be
unique in each daily note"_ — a heading's text appearing inside a task line is
enough to corrupt it. Matching whole lines resolves a duplicated heading to its
first occurrence, which is a defensible answer rather than a corrupting one.

The target note need not exist; `ensureNote` writes the rendered template body
before the frontmatter claim, so a note that is visible already has its template
headings in its **content** — which is exactly what the scan reads.

**Notelets are both a source and a target, but not for every command.** A move
reads from them when `source` includes them — an action item captured in a
meeting is exactly the kind of thing that should follow you forward, and the
default `source: note` keeps it opt-in. **That default is a move's, not a listing's.** A listing
reads and a move writes, so the listing may default wider: reading too much is noise, writing too
much is data loss. A listing defaults to `source: both`, `depth: literal`, `status: open`. The
alternative — every default as stated for moves — makes a bare fence in a day note a mirror of the
note it sits in.

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

## Build order

Cut by **provider**, not by relation. The expensive thing is not the date
relation — it is the checkbox provider's implementation of it.

1. `checkbox` provider, **containment** only; the listing and its surfaces,
   **including ticking**; the single parameterized `tasks` decoration condition
   and the rewrite of the two it replaces; `tasksFor`. The path-set half of the
   API already shipped in 3.4.0 — `existingNotes(selector)` returns every note
   the matched journals have written and `notesInRange` narrows it to a window,
   both resolving custom intervals and non-obvious week boundaries. What is left
   there is `previousNote` / `nextNote` and `depth` handling.

   **This phase is not read-only**, as #345 currently frames it. Ticking needs
   one character overwritten plus the delegation for recurring lines, and shares
   nothing with the move — no target resolution, no placement, no subtree, no
   marker. Holding it back would not avoid the write machinery, only leave a task
   list nobody can act on. Two things therefore arrive here rather than with the
   move: whatever enforces "overwrite only tokens we found", and the Tasks
   capability check.

   Dates are extracted for owned notes as soon as their text is hydrated, and stored on
   the item — but no date lookup is exposed until step 4. Answering "what is due Friday"
   from journal notes alone would be a half-vault answer wearing a whole-vault face.

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

None is a decision — each is work this model is waiting on.

- **The note-property status defaults.** The values TaskNotes ships for its
  status field, mapped to the shared types, matched case-insensitively.
- **Whether `tag` drops for an item with no position, the way `heading` does.** Filtering says
  `status` applies to everything while the heading/tag axis applies only to an item with a
  position inside a note — but `tagsOf()` also folds in `structure.frontmatterTags`, and a
  note-kind item carries those without carrying any position. Whether its `tag` condition should
  drop, the way `heading` does, or match against the note's own frontmatter tags is unsettled.
  For this ticket it drops, matching `heading`: only the checkbox provider ships here, nothing
  yields a note-kind item until the note-property provider arrives, and a rule with no item to
  observe it against is unobservable and untestable today. That is a deferral, not an answer —
  revisit it when the note-property provider lands.
- **The phase-4 index's memory and cold-boot cost**, measured against realistic
  **link density** rather than note count. Time Ruler hung indefinitely on a
  2,000-note vault, and an anonymised copy of that same vault did not reproduce
  it.
- **Nesting is unrecoverable from `parent` alone for a note whose list starts at line 0.**
  Obsidian encodes a root item's parent as `-(list's first line)` and a child's parent as its
  parent's `position.start.line`; for a list starting at line 0 both encodings produce the same
  `0`, so a root item and a genuine child of the line-0 item are indistinguishable in that field.
  `NoteStructureService` resolves the ambiguity toward "no parent" — nesting goes missing rather
  than wrong — because the alternative, disambiguating by `position.start.col`, would widen
  `StructureListItem` for every consumer. Open question, not a settled answer.
