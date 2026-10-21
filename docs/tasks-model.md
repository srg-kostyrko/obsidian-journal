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
dated line in a note a journal **does** own takes that owner's full stored filter
however it is reached — by its note or by its date, from its own period or from
any other journal's — so the date relation never re-admits a line the owner's
`selection` excludes, unless the surface names its own `heading` condition, which
replaces the owner's by type exactly as it does for containment. A
`note-property` item has no headings at all, so the condition drops out for it
entirely, per the rule below.

Listings take both axes. **Decoration conditions take `source` and `date`, never
`depth`.** Rollup stays listing-only: the decoration engine evaluates per cell across a whole grid,
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
The old `has-open-task` condition worked with no configuration at all, so a checkbox provider
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

**Identification is owner-scoped; per-journal visibility of dated items is
asker-scoped.** The two are easy to conflate (see "Which settings live where").
Identification asks what a note _is_, and a note has one owning journal, so it
answers the same whoever asks. A `note-property` item usually has no owner at
all — a task note lives wherever the user keeps it, not in a period note — so
the per-journal layer cannot apply to it, and `note-property` identification is
global only. What a journal can still decide is which dated task notes **it**
shows: the journal _asking_ decides, and two journals legitimately give
different answers about the same note. Without that, a Work and a Personal daily
journal would both list every task due that day.

Each journal's **Task notes** setting is that choice: **All** (the
default, and what a journal with no stored rule does) admits every identified
task note; **Matching…** narrows them by tag, folder, or property equals value,
combined with and/or; **None** admits none. A tag condition matches the note's
frontmatter tags as Obsidian's tag search does — `#work` finds `#work/project`,
never `#workshop` — and a property condition is link-aware, so `[[Website]]` in
the note matches a condition naming `Website`. It is stored on the journal's config
entry under `tasks.providers["note-property"]`, so a rename carries it along. It
can only narrow the global identification, never widen it: a journal never sees
a note identification rejected.

The asker-scoped rule has a second provider: `checkbox`. Each journal's **Dated
tasks** setting takes the same three answers and conditions for dated checkbox
lines, with a tag condition reading the line's own tags plus its note's
frontmatter tags, and folder and property conditions reading the containing
note. It is stored as `dated` on the journal's `tasks.providers.checkbox` entry,
a field separate from the owner-scoped identification rule there. It gates
**only date-relation matches**: a journal always sees the lines in its own
period notes by containment, whatever its rule says, while a line one of its own
notes reaches by date alone — Monday's note, dated Friday, asked by Friday — is
gated like any other.

When several journals ask at once — a tasks view block over a list of journals,
`tasksFor` with a selector matching several — a dated item is admitted if **any**
asking journal admits it, and appears once, deduplicated by item identity. The
`journal` and `date` it reports are those of the **first admitting journal in
the selector's resolution order**, which is deterministic and documented, not
"whichever came first". A rollup listing is asked by its host journal alone:
rollup does not apply to the date relation, so siblings contribute containment
items only.

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

  The shipped defaults are TaskNotes' own statuses: `none` → `todo`, `open` →
  `todo`, `in-progress` → `in-progress`, `done` → `done`, with canonical `todo`
  `open` (TaskNotes' `defaultTaskStatus`) and canonical `done` `done`. An
  unknown value is `todo`, and so is a **missing** status property: TaskNotes
  always writes one, and a hand-rolled `due:` note without a status is still
  something to do. TaskNotes also stores a status whose value is the string
  `"true"` or `"false"` as a YAML boolean, so the value is stringified before
  matching and the same coercion is applied on write, which keeps a vault using
  boolean statuses round-tripping.

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
widens that fill set to the vault; it does not change the seam. For notes the
plugin does not own, the checkbox provider stores dated items only and keeps no
text: an undated checkbox in a project note can be reached by no relation, so
storing it is waste. Obsidian's Excluded files bound the walk of non-owned notes
only; an owned note in an excluded folder keeps its items. Obsidian announces no
change to Excluded files, so the walk runs again on every checkbox settings change
and every full refill, reading only the notes it has not read yet. Nothing is read
before the journals index is ready: the walk that readiness starts covers every
note a boot-time change touched, one read at a time.

The index stores two tiers. Structure — status, position, tags, capabilities —
fills synchronously from `metadataCache`, so a decoration is correct on first
paint. Line text hydrates lazily, keyed by `(path, mtime)`, which is why
`display.markdown` is `null` until something asks for it. Dates are the one
exception to "structure fills synchronously": `ListItemCache` carries no text, so
they are extracted when the provider fills, from the note's text, and follow the
synchronous publish in a second one.

So `NoteMetadata.tasks` **goes**. It is read in exactly four lines, all of them
inside the two checks the `tasks` condition replaced, `hasOpenTask` and `allTasksCompleted`
(since deleted from `src/decorations/engine-checks.ts`),
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
`created`. Each provider resolves a role its own way: the
checkbox provider to a signifier, an emoji or a Dataview inline field; the
note-property provider to a configured property name, which is what TaskNotes'
own `FieldMapping` already is.

**With no role named, an item belongs to a period when its `scheduled` _or_ `due`
date falls inside it.** An earlier draft defaulted to `due` alone; that leaves a
TaskNotes user who plans with `scheduled` looking at empty daily notes, which is
the setup failure the provider exists to prevent. A task scheduled Monday and due
Friday therefore appears in both days' listings and once in the week's. Naming a
role narrows it to that one.

Dated items belong to **every** period whose range contains the date — the day,
its week, its month — which is the date relation's own definition. Rollup does
not apply to them, as above, so nothing is counted twice. A task note's `done`
and `created` roles are readable and filterable by naming them, but are not part
of the default.

A recurring task note shows on its **stored** dates only. Nothing expands a
recurrence rule into later occurrences; that is a separate feature, not a gap in
this one.

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

`status` applies to everything. `heading` applies only to an item with a
position inside a note. `tag` applies to everything too, because `tagsOf()` folds
in the note's frontmatter tags: for a note item it matches **the note's own
frontmatter tags** and does not drop. The rule is stated generally so the next condition type
inherits it, and the escape for someone who wants line items only is the
`provider` scope key, which is the right place to say which kind of thing you are
looking at.

The cost is that `mode: and` with a heading condition does not narrow note items,
so "under `## Tasks` and open" returns open note-tasks whatever their headings.
That reads loose; the alternative silently removes an entire provider's items,
which is an evening of debugging before someone files "the listing is broken".

**A journal's stored filter reaches task notes, and dated lines no journal owns, by its `status` axis only.** The
journal's `tasks.filter` was written for that journal's own checkbox lines: its
`heading` conditions name headings in its template, and its `tag` conditions
select lines. Applied to a task note found by date, a stored `tag` condition
would silently hide notes the user never meant it for. So a journal that shows
open work hides done task notes too, and its stored `tag` and `heading`
conditions are skipped for task notes and for dated lines in notes no journal owns. A `tag` condition a **surface** names
itself — a fence `tag:` key, a view block's or decoration's own filter — does
apply, matching frontmatter tags; `heading` still drops. The tag axis for a
journal's task notes is its dated-task-notes setting, not its stored
filter.

In `composeFilters` terms this is a per-item decision on the journal side of the
merge, taken before the query side replaces by type. The "a query condition
replaces the journal's of the same type" rule stays intact for containment items.

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

**This is the one exception to the write rule's clause 1.** Clause 1 bans
re-emitting a line from a parsed model because _our_ model has no field for
everything a dialect can carry, so rebuilding from it drops or reorders bytes
the user wrote. That harm is about the model doing the rebuilding, not about
where the resulting bytes come from — and `executeToggleTaskDoneCommand`
doesn't hand us a model to rebuild from at all. It hands back the line (or
lines) Tasks's own parser already produced, dialect-complete, which is exactly
the recurrence signifier's own owner writing its own syntax. We may splice that
text in **unmodified**, and unmodified is the whole permission: nothing here
authors, reorders or drops a single byte of what Tasks returns.

That permission is conditional on checking what comes back before it is
spliced in, because the call is a third party's and nothing enforces its return
at runtime. A throw, a value that isn't a string, or a string that no longer
matches a task line — most concretely `""`, which would silently erase the
line — all refuse rather than write. An empty or malformed return crossing this
boundary is exactly the harm clause 1 exists to prevent, just arriving from
Tasks's side of it instead of ours, so it gets held to the same bar the input
line already had to clear.

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
basename.

Ticking a note item is **dispatched to the provider that owns it**: the line path
(`TickService`'s overwrite of one status character) is unchanged, and a note item
goes to its provider, which writes through `processFrontMatter` — there is no
status character to overwrite. It writes the canonical value of the target type
into the status property, the completion date (today on a tick to `done`,
removed on an un-tick to an open type) when a completion-date property is
mapped, and the modified-date property when one is mapped, so TaskNotes' own
bookkeeping is not left stale. Each is a property the user named, so the write
rule's "overwrite only tokens we found, add only tokens the user named" holds.

**A recurring task note is refused with a notice**, the way a recurring line the
plugin cannot advance is. TaskNotes drives a series off its own completion
handling; writing `status: done` onto the single note would end the series
silently, with nothing failing loudly — the same harm as ticking `🔁` through a
bare file write. A note counts as recurring when it carries the recurrence
property or the recurrence-parent property (TaskNotes 4.x materializes
occurrences as separate notes linked to a parent, and those are driven by the
same series). The checkbox stays clickable and gives the notice, so both providers
refuse a recurring item identically on screen. Unlike a line, there is no
delegate to hand it to: the model has no dependency on TaskNotes, so a
recurring task note is read-only here.

## Decorations ask the same question

`has-open-task` and `all-tasks-completed` were hardcoded points in a space that is
no longer small — seven statuses, two providers, a `date` role, `source`. A
listing can ask whether there are in-progress items in the notelets; those two
conditions could not. Two surfaces that cannot express the same question will
disagree about the same day, which is what this whole model is built to avoid.

So both are replaced by one condition that asks the listing's question:

```
{ type: "tasks", quantifier: "any" | "all" | "none",
  status: "listing" | "open" | "done" | "all",
  source: "note" | "notelets" | "both",
  date: "scheduled-or-due" | "due" | "scheduled" | "start" | "done" | "created",
  filter: { mode, conditions: [heading | tag …] } }
```

For a cell (journal J, period P) it runs in four steps, in `answerTaskQuestion`:

1. **Gather.** The source notes for P under `source` (default `both`) — the same `sourceNotes` walk
   the listing uses. Every notelet at P is gathered whatever its items; J's filter applies to the
   items inside it in step 2, so a notelet whose items are all filtered out still counts as existing
   for `none`.
2. **Count.** Each note's provider items minus `non-task`, kept when they pass the heading and tag
   part of J's `tasks.filter` merged with the condition's `filter`. The merge is the listing's: a
   condition type the decoration names **replaces** J's conditions of that type, J's other conditions
   still apply, and the decoration's `mode` combines them. The inapplicable-condition drop rule is
   unchanged, so an item with no `NoteStructure` yet over-matches rather than vanishing.
3. **Ask.** Status is lifted out of the filter as the question. `listing` (**As in listing**, the
   default for a new condition) asks J's stored status condition — `is` or `is-not`, canonical
   names and groups alike, empty meaning every status — and falls back to `open`
   (`DEFAULT_STATUS_CONDITION`), the chain `composeFilters` applies. `open`, `done` and `all` are
   explicit and replace J's status condition, as a fence's `status:` key does. An unrecognized stored
   value parses as `listing`.
4. **Quantify.** `any` needs one counted item with the status. `all` needs **at least one counted
   item and every one with the status** — the old `allTasksCompleted` returned `false` for a note with no tasks, and
   `answerTaskQuestion` (`src/tasks/answer-question.ts`) keeps that, since vacuous truth would
   light every empty day. `none` needs **something at P to exist** — a period
   note, a notelet, or a dated item of any status that J's visibility admits for P — and no
   counted item with the status. A note with no tasks is `true`, a date with neither is `false`,
   and a day with no note whose only dated item is a done task answers "no open work" `true`. A
   dated item counts as existence before the filter, the way a notelet does, so a filter that
   removes it does not turn the day back into an empty one.

   The dated items come from the same date relation the listing uses, on top of step 1's
   containment gather: J's visibility admits them, J's stored filter
   reaches them by `status` only — except a dated line in a note some journal owns, which takes
   that owner's whole filter, as the listing does — and the lookup for a cell is a date-range read against the
   `note-property` index, never a walk of notes. A dot can therefore light a day that has **no
   note**. That is intended: the task is dated there.

- `has-open-task` becomes `any` · `open` · `both`
- `all-tasks-completed` becomes `all` · `done` · `both`
- `none` becomes expressible for the first time — "this day has no open work" as
  a condition rather than a decoration someone has to invert

Details that are load-bearing:

- **Status is not a row in the condition's filter.** In the listing status is one more condition in
  the and/or list; in a decoration it is the question, and heading and tag select who is asked.
  Inside one or-list "all Done OR under `## Work`" has no meaning. A `status` row found in a stored
  filter is stripped on read, never rejected, because a failed condition fails the journal's whole
  `decorations` field and the repair would reset the list.
- **The journal's filter is inherited and its meaning moves with it.** With **As in listing**, or with
  inherited heading and tag conditions, editing J's task filter changes what the dot means, so the
  decoration watcher reads that filter.
- **Deliberate divergence under `or`.** J's stored filter has no mode of its own, so `merge` takes the
  decoration's. Under `or` J's inherited conditions join the decoration's and can admit more than J
  alone does — as a tasks view block with `mode: or` does today. The listing's or-list cannot be
  quantified (status inside it would be a disjunct, not a question), so no mode makes the two agree
  about status there; the editor keeps the and/or control and the divergence is accepted.
- **The scope refuses `depth`.** The rollup ban on decorations is unchanged — the engine evaluates per
  cell across a whole grid. `provider` is not offered; the listing's view block does not expose it.
  `date` **is** offered, as a role picker defaulting to scheduled-or-due, so a dot can mean "due
  here"; an earlier ruling (#346) withheld it only because no provider could answer a date
  question yet. `source` does not apply to the dated items it admits, for the reason given under
  Scope.
- **No text hydration.** The condition reads status and `NoteStructure` only.

This is a schema change to configs people already run, so it carries a **deterministic rewrite**
(settings v6 to v7, `v6-to-v7.ts`) of the two old condition types into the new one, with the status
written out so a migrated condition never starts following a journal filter that shows every status.
It also changes what two surfaces answer on upgrade: dots now honour the journal's task filter, and
now read notelets.

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
providers. Omitting `date` means scheduled-or-due, as everywhere else.

The public `TaskItem` was shaped for containment: `journal` is the journal whose
note holds the task and `date` is that note's period. A dated item has neither, so
for it `journal` and `date` are the journal and period **asked about**, `source`
names where it lives (`"notelet"` when its path is a notelet, `"note"` otherwise —
never how it was reached; #540), `line` and `parentLine` are null, and `relations`
contains `"date"` — consumers tell the two apart by `relations`, which exists for
this. No union is widened, so no consumer's exhaustive switch breaks. When a
selector matches several journals, the reported journal is the first admitting one
in resolution order (see Providers). The doc comments on those fields are reworded
to cover both relations, under the stability policy below.

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

Eligibility is the move's own: an item is eligible when its status is open
(`todo`, `in-progress` or `on-hold`). It does **not** come from the journal's
listing filter, which supplies only `selection` — the filter's heading and tag
conditions, with its status conditions removed. A listing's status condition is
tuned for reading, often to show done items too, and a roll inheriting it would
copy finished work forward. `rolled` is never eligible. But an item can nest, and
then what moves is not the item:

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

The stamp goes on each **root** line only, and so **a line with a `rolled`
ancestor is never eligible**. That is the eligibility mirror of rule 1: without
it, an open child under a stamped root becomes a root of its own on the next run
and rolls again. Stamping every open line in the subtree would also stop that,
but it writes markers the user never sees a reason for, and it breaks the round
trip when the user later removes the root's marker by hand — the children read
as open again together with their root.

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

**Move mode does not remove a line that carries one**, because removing it breaks
every `[[note#^abc1234]]` that pointed at it. A bulk roll in move mode leaves a
root whose subtree carries a block id in the source and reports it; the
single-item commands, where the user picked the line, warn instead. Neither can
say how many links are at stake:
`resolvedLinks` is `Record<path, Record<path, number>>` with no anchor
information, `getBacklinksForFile` is not in the public typings, and reading
`LinkCache.link` for every note is the whole-vault walk this plugin criticises
other plugins for. So the report or warning says what is true and no more.

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

### Look-back

A bulk roll reads a set number of **existing** notes before the target, default
1, any whole number of 1 or more, set per journal. It is counted in notes, not
days or periods: a count of existing notes works the same for days, weeks, months
and custom intervals, and it does not lose Mondays for someone who journals on
weekdays only — the failure a one-day window produced in Nested Daily Todos #1.
Finding each note still spans gaps as above, so with look-back 1 the note before
a two-week break is the one read. The number is bounded on purpose: "everything
not yet rolled" would let a first run over an old journal pull every forgotten
checkbox into today. When automatic rollover arrives it reads the same setting,
because it is the same operation and the two must agree on what "unfinished items
from before" means.

**No fold rule is needed.** Other plugins pick a winner when the same open item
appears in several of the notes they read, because they leave nothing in the
source to say it was taken. Here a taken item is stamped (copy, with stamping
on) or removed (move), so it cannot be eligible twice. Copy with stamping off
leaves nothing behind, and the next roll takes the same lines again. Two _different_ lines with the same text
in different notes are two items, and both roll. In the target, items arrive
oldest source note first, each note's items in their source order, so the same
inputs always give the same text.

### A reference instead of a copy — considered and declined

Review leaves a `![[note#^id]]` embed in the target rather than moving the line.
That is a different feature, not a variant of this one: the target would hold an
embed rather than a checkbox, nobody has established whether a task inside an
embed can be ticked, and listings, decorations and `tasksFor` would all still see
the task in its source period, not in the one it was rolled into.

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

**Identification is two layers for `checkbox`.** A global rule on the provider applies
everywhere, including notes no journal owns. A journal may add its own rule, composed `inherit`
(the default), `narrow` (global and journal) or `replace` (journal alone). This is
deterministic despite the rollup: a note has exactly one owning journal, so the rule
applied is the _owner's_, whoever is reading — a month rollup walking a day note reads
it as a day-journal note. That one verdict serves both relations: the owning
journal's composed rule decides identification whether a journal asks by
containment or by date, so a line its `narrow` rejects is not a task when another
journal asks by date either. For a note no journal owns only the global rule
applies. An earlier version of this section ruled identification
global-only by conflating owner with asker. The rule is owner-scoped; what a
journal chooses to show of notes it does not own is the separate, asker-scoped
setting described under Providers. The journal layer applies to the `checkbox`
provider only: `note-property` identification is global, one rule on the provider
for every note in the vault, matched against frontmatter tags or a property.

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

   Dates are extracted at fill time, which means reading the text of owned notes
   that have checkboxes, and stored on the item — but no **checkbox** date lookup is exposed until step 4. Answering "what is due Friday"
   from journal notes alone would be a half-vault answer wearing a whole-vault face. (The
   `note-property` lookup in step 2 is not that: its index covers the whole vault.)

2. `note-property` provider with its date→paths index — small, `metadataCache`
   only, no text cache, no `cachedRead`, and it covers TaskNotes plus every
   hand-rolled `due:` / `scheduled:` convention. **The date relation's surface work
   lands here**, because the provider is invisible without it: listings (the fence
   and the tasks view block), the `tasks` decoration condition, and `tasksFor` with
   its REST route and MCP tool. Checkbox items carry no date relation until step 4,
   exactly as before. Per-journal visibility and the TaskNotes onboarding card are
   separate pieces of work (PRs 2 and 3 of #503).
3. Moving items between periods.
4. `checkbox` provider, **date** relation: the vault-wide index over every dated
   checkbox in the vault, read once at boot because `ListItemCache` carries no
   text, and keeping none of it. Its memory and cold-boot cost is measured (see
   "Still to establish"). The surfaces already speak the relation by now; this
   step gives them a second provider to ask.

The index in step 4 stores items **flat**, with a parent reference at most. Any
nesting is derived at render time behind a visited set. Time Ruler's indefinite
hang was not volume — it was a 2,000-note vault whose tasks formed a link graph
its `descendants()` recursion walked with no cycle guard, and their fix was to
remove the capability. A flat index never follows links, so link density does not
bear on step 4; the nesting derived at render time is the only walk left, and the
visited set is what bounds it.

## Still to establish

None is a decision — each is work this model is waiting on.

- **The phase-4 index's memory and cold-boot cost — closed.** Measured 2026-10-20
  on real Obsidian (latest stable), no plugins, desktop Linux: a walk over every
  note whose `metadataCache` shows a task, reading with `cachedRead` or
  `adapter.read`, 16 reads in flight, on synthetic vaults with deliberately dense
  tasks (~33 per task-bearing note) and wikilinks.

  |                                                           | 5k notes          | 20k notes            |
  | --------------------------------------------------------- | ----------------- | -------------------- |
  | notes with checkboxes / checkbox lines / dated lines      | 1,513 / 50k / 20k | 7,063 / 224k / 89.5k |
  | Obsidian warm boot (vault already indexed)                | ~2 s              | ~5–6 s               |
  | Obsidian first-ever index, for scale                      | 12 s              | 47 s                 |
  | **walk**                                                  | **0.35 s**        | **1.5 s**            |
  | worst main-thread gap during walk                         | 13 ms             | 23–28 ms             |
  | flat index retained, text dropped, all items              | 6–9 MB            | 27 MB                |
  | same, every note's lines kept                             | 12.5 MB           | 54 MB                |
  | extra text Obsidian retains when reading via `cachedRead` | ~4 MB             | ~22 MB               |

  Keeping every note's lines doubles the retained memory, which is why the index
  drops text and, for notes the plugin does not own, stores dated items only.
  One in flight was no slower than 16. A flat index never follows links, so link
  density does not bear on it; Time Ruler's hang (a 2,000-note vault whose tasks
  formed a link graph) belongs to subtree work, not here. Not measured: mobile;
  a cold OS page cache — the files were freshly generated, so reads were warm;
  and the real index's publish and sort cost, which the spike's walk did not
  include. A review estimate in plain Node on the dense 20k shape puts it at
  ~200 ms for the burst when the walk ends, ~100 ms to re-sort each date role
  after every version bump, and ~190 ms for the `JSON.stringify` unchanged check
  on a settings refill — a real vault is likely 5–10× lower. It wants measuring
  in the spike harness; the closure above covers the walk and memory only.

- **Nesting is unrecoverable from `parent` alone for a note whose list starts at line 0.**
  Obsidian encodes a root item's parent as `-(list's first line)` and a child's parent as its
  parent's `position.start.line`; for a list starting at line 0 both encodings produce the same
  `0`, so a root item and a genuine child of the line-0 item are indistinguishable in that field.
  `NoteStructureService` resolves the ambiguity toward "no parent" — nesting goes missing rather
  than wrong — because the alternative, disambiguating by `position.start.col`, would widen
  `StructureListItem` for every consumer. Open question, not a settled answer.
