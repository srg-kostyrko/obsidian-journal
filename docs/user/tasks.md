# Tasks

::: v-pre

A **task**, here, is a checkbox list item — `- [ ] Buy milk` — in any note. Journals reads them to
answer two things about a period: [does it have an open task, and are its tasks all
done](/decorations#tasks). This page covers turning that reading on, what status each checkbox marker
means, and which checkbox items count as tasks in the first place.

## Turning tasks on

On the main settings page, expand the **Tasks** section: it lists one row per way Journals has of
finding tasks, checkbox items being the only one so far. **Checkbox tasks**' toggle turns checkbox
reading on — it is on by default — and its gear icon opens checkbox tasks' own settings: the status map
and the vault-wide identification rule, both covered below. The row's own description names the current
identification rule in one sentence, so you can see it without opening anything.

## Status symbols

Every checkbox marker — the character between the brackets — reads as one of seven statuses: **To-do**,
**In progress**, **On hold**, **Done**, **Cancelled**, **Not a task** or **Rolled over**. **To-do**,
**In progress** and **On hold** are open; **Done** and **Cancelled** are done; **Not a task** is
excluded from both counts entirely, and **Rolled over** counts toward neither — a note whose only task
is rolled over satisfies neither [decoration condition](/decorations#tasks).

Click **Checkbox tasks**' gear icon to open its settings modal. **Status symbols**, at the top, maps
markers to statuses:

| Marker | Status      |
| ------ | ----------- |
| ` `    | To-do       |
| `x`    | Done        |
| `X`    | Done        |
| `/`    | In progress |
| `-`    | Cancelled   |

Any marker not listed here reads as **To-do** — open — until you add it. That is what changed in this
release: every marker used to count as done except a plain space, so a note whose only tasks were
`- [/] …` read as "all tasks completed". Now `/` reads as In progress, which is open, and the same goes
for any other unmapped marker, such as a theme's `[>]`.

Type a marker and click **Add symbol** to map it; the new row starts at To-do, and its dropdown offers
all seven statuses. A marker is the single character between the brackets, so **Add symbol** stays
disabled until exactly one is typed — one emoji counts as one character. The delete icon on a row removes that mapping — a marker no longer listed falls
back to To-do, same as one you never added.

Every row carries a **Written back** icon: it marks the marker Journals writes into the note when a
task's status changes to that value. A status with only one marker still shows it filled in, since that
marker is the one that gets written; where two or more markers share a status — `x` and `X` both read as
Done by default — only one of them is filled in at a time, and clicking a grey icon makes that row's
marker the written-back one instead.

**Save** at the bottom of the modal applies both the status map and the identification rule below it;
**Cancel** discards edits to either.

## Which checkbox items count as tasks

Not every checkbox line has to count. The same modal's **Identification rule** is a list of conditions
a checkbox item must meet to be read as a task at all, combined by **Match all conditions** or **Match
any condition**. With no conditions — the default — every checkbox item in every note counts.

Two condition types, each addable more than once:

- **Tag** — **Has** or **Lacks** a comma-separated list of tags. Checked against tags on the item's own
  line and the note's frontmatter tags, wherever the item sits; a body tag elsewhere in the note does
  not count. Write each tag with or without its leading `#`; the field adds one either way, so the
  row settles on `#task` whichever you typed.
- **Heading** — **Under** or **Not under** a comma-separated list of headings. Checked against every
  heading enclosing the item, from its immediate section up through the note's outline — not only the
  nearest one. Write the heading's text, not its `#` markers — those are dropped if you include
  them, so `## Work` and `Work` both mean the same heading.

**Add condition** adds a row; the delete icon next to a row removes it. A new row starts with no
value, and **Save** stays disabled until every row has at least one — leave one empty and, once
you have clicked into its field and left it, the row explains why.

### A journal's own rule

A journal's settings page has its own collapsible **Tasks** section, matching the one on the main
settings page. Expand it and click **Checkbox tasks**' **Edit** button to open a modal scoped to this
journal, with **Relation to the vault-wide rule**:

- **Inherit** (default) — the vault-wide rule alone; this journal adds nothing.
- **Narrow** — a checkbox item must satisfy both the vault-wide rule and this journal's own rule.
- **Replace** — this journal's own rule alone; the vault-wide rule does not apply to it.

Choosing **Narrow** or **Replace** reveals the same condition editor as the vault-wide rule, scoped to
this journal. The row's own description names which relation is active and, once narrowed or replaced,
summarizes the rule itself, so you can see it without opening the modal.

## Listing tasks in a note

A `journal-tasks` code block lists the tasks of the period the note it sits in belongs to — the note's
own tasks, its notelets', or both. In a note connected to no journal it lists nothing and says so.

````markdown
```journal-tasks
sort: status
```
````

A bare fence, with no keys at all, defaults to `source: both`, `depth: literal`, `status: open` and
`sort: document`. A listing only reads notes, where a move or a rollover would write into them, so it
can afford to default wider than those do: a bare fence in a day note that showed everything the note
held would just mirror the note it already sits in, telling you nothing you could not see by opening
it. The `status: open` default gives way to the journal's own, where [it has
one](#a-journal-s-own-listing-filter).

There is no `date` key yet. A task line can carry up to five dates — due, scheduled, start, created,
done — and filtering a listing by any of them is a later addition. Today a listing finds tasks by where
they live, a period's own note, its notelets, or both, never by a date the task itself carries.

### Fence keys

| Key          | Default    | Names                                                                                                                                                                                                                                                                      |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`   | every one  | which providers to read tasks from, by id. **Checkbox tasks** (`checkbox`) is the only one that ships, so there is nothing to narrow yet.                                                                                                                                  |
| `source`     | `both`     | `note`, `notelets` or `both`.                                                                                                                                                                                                                                              |
| `depth`      | `literal`  | `literal` (this period's own note and notelets) or `rollup`, which widens to every other journal in the host's shelf (or every journal, when it is on none) whose periods fall inside this one — a month can list its days' tasks alongside its own.                       |
| `status`     | `open`     | `open` (to-do, in progress, on hold), `done` (done, cancelled), `all`, or any single status name — `on-hold`, `rolled` — to show just that one. The default gives way to [the journal's own **Status** condition](#a-journal-s-own-listing-filter) where it has one.       |
| `heading`    | none       | one or more headings; only tasks sitting under one of them are shown. Write it as it looks in your note, `## Tasks`, or as bare text, `Tasks` — both mean the same heading.                                                                                                |
| `tag`        | none       | one or more tags; only tasks carrying one of them are shown. Write it with or without its leading `#` — `task` and `#task` both mean the same tag.                                                                                                                         |
| `sort`       | `document` | `document`, `status`, or a date role (`due`, `scheduled`, `start`, `done`, `created`).                                                                                                                                                                                     |
| `conditions` | none       | more conditions, of any of the three types above, for anything the flat keys cannot say — see below. Values here are taken **exactly as written**, unlike `heading:` and `tag:`: a heading must be its bare text, `Tasks`, never `## Tasks`, and a tag must carry its `#`. |

`status`, `heading` and `tag` are each sugar for one condition of that type. `conditions:` adds more —
it never replaces what the flat keys already added, even one of the same type — which is how a fence
reaches something a single key cannot say one to one, such as "under one heading and not under another":

````markdown
```journal-tasks
conditions:
  - type: heading
    condition: under
    headings:
      - Work
  - type: heading
    condition: not-under
    headings:
      - Habits
```
````

All of a fence's conditions, however they got there, are combined with **and** — there is no `mode` key
to switch a fence to matching any one condition instead.

Name it to list something other than what is still open, such as a weekly review of what got done:

````markdown
```journal-tasks
status: done
```
````

See [Code blocks](/reference/code-blocks).

### Ticking a task

Clicking a row's own checkbox ticks it — the row is the whole rendered line, but only the checkbox
itself responds. Ticking writes the status character your [status map](#status-symbols) assigns to
**Done** (or, for a row that is already done, back to **To-do**) at that one position; nothing else on
the line changes.

A **recurring** line — one carrying `🔁` anywhere on it, not only as part of a due-date signifier — is
the one case that refuses. The [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin
owns the recurrence syntax, and only its own toggle command creates the next instance; writing the
status character ourselves would mark the line done and never create next week's, ending the series with
nothing failing loudly. So a recurring line is delegated to Tasks's own toggle when Tasks is installed,
and refused, with a notice, when it is not.

Two things worth knowing if your status map assigns Done to something other than `x`: Tasks's own
toggle writes its own hardcoded `x` on the recurring line it completes, regardless of your map, so a
vault mapping Done to another symbol still gets `x` on recurring lines and its own symbol everywhere
else. And a line does not need real recurrence syntax to count as recurring — a task whose text merely
mentions `🔁` still needs Tasks installed to be ticked.

### What renders

Each row shows the whole line, exactly as written — dialect signifiers, inline fields, trailing tags and
block ids all included, nothing prettified away — through Obsidian's own markdown, the same renderer a
note itself uses. That is also why your theme's own styling for a marker such as `[/]` or `[x]` looks
the same in the listing as it does in the note. A task inside a blockquote or a callout renders, and
ticks, the same as one at the top level.

Below the line, a small link names the note (or notelet) the task lives in; click it to open that note.

### Nesting

A checkbox nested under another checkbox stays nested in the listing, indented to match. If a filter
excludes the parent — the default `status: open` excluding a `- [x]` parent, say — the parent still
appears above its matching child, dimmed and not clickable, so the child does not lose the line that
gives it its meaning. A checkbox nested under a plain bullet, rather than under another checkbox,
appears at the top level instead: a plain bullet is not a task, so it is never shown as one, dimmed or
otherwise. See [A completed parent, an open child](#a-completed-parent-an-open-child) below.

### Sorting

`sort: document` (the default) shows each note's tasks in the order they are written, and — since notes
are read one at a time — that also reads as note by note. `status` or a date role instead reorders
every row of the whole listing together, not within each note: on a rollup, or on a [tasks view
block](#the-tasks-view-block) spanning several journals, a note's tasks no longer sit together as a
block once sorted that way. A sort never pulls a nested pair apart, whatever the key — it reorders
siblings at each level, never the tree itself — and a date role sorts a task carrying no date of that
role last, rather than losing it from the listing.

### A journal's own listing filter

A journal's settings page has its own **Listing filter** row, in the same **Tasks** section as
**Checkbox tasks**' own settings. **Edit** opens the same condition editor `conditions:` writes by hand,
restricted to `tag`, `heading` and `status`, scoped to this journal. Leave it empty, the default, and a
listing reads this journal with no filter of its own.

A journal contributes **conditions** only, not a way of combining them: its conditions join the
surface's own — a fence's, or a tasks view block's — and the combined list is matched under **that
surface's** **Match all conditions** or **Match any condition** setting. That is why this editor has no
such control of its own, while the [tasks view block](#the-tasks-view-block)'s **Filter** does. A fence
always matches all of its conditions.

Where the two name the same kind of condition, **the surface's replaces the journal's** rather than
adding to it. A journal scoped to heading `Tasks` and a fence asking for `Log` shows `Log`, not the
intersection of the two — ANDing them instead would make anything the journal's own filter excludes
unreachable from any fence.

The `status: open` default is the one thing that applies last rather than first. A journal's own
**Status** condition therefore does reach a fence that named no `status:` of its own — set a journal to
**All** and a bare fence in its notes lists everything, done items included. The default only fills in
where neither side named a status at all.

The editor's own **Status** control offers only three groupings — **Open**, **Done**, **All** — the same
three names the `status:` fence key accepts as aliases. A fence, or the `conditions:` escape hatch, can
instead name one status directly, such as `on-hold`, which the settings editor has no button for.

### One thing to expect right after startup

For a moment after Obsidian starts, before it has finished reading your notes, a listing filtered by
`heading:` or `tag:` can briefly show a task it should not — one outside the named heading, say — and
then settle down once indexing catches up. That is deliberate: the alternative is showing nothing until
indexing finishes and then having items pop into a listing you are already looking at.

## The tasks view block

A **Tasks** block, added to a [view](/views), lists tasks the same way the fence does above, scoped to
the view rather than to the note it sits in:

- **Window** — **Selected day**, **Selected week**, **Selected month**, **Selected quarter** or
  **Selected year**, around the view's own selected date.
- **Journals** — leave all off, the default, to include every journal in the view's own
  [shelf scope](/shelves#scoping-a-view); turn specific ones on to narrow it further.
- **Source** and **Sort by** — the same `source` and `sort` this page covers above.
- **Filter** — the same condition editor [a journal's own listing filter](#a-journal-s-own-listing-filter)
  uses, scoped to this block instead of to a journal.

The block has no **Depth** control. Unlike the fence, which is literal about one host note unless you
ask it to roll up, the block already walks every journal its window and its shelf scope name — there is
no narrower "just this one note" state for it to be literal about, and nothing beyond that configured
scope for a rollup to widen into.

## Examples

### An in-progress day

A daily journal with a **Check if note has open tasks** decoration and the default status map. A day's
note holding:

```markdown
- [/] In progress
```

decorates that day: `/` reads as In progress, which is open, so the note has an open task even though
its only checkbox is marked, not empty.

### All tasks completed

A monthly journal with a **Check if all tasks are completed** decoration and the default status map. A
month's note holding:

```markdown
- [x] done
```

decorates that month: `x` reads as Done by default, and the note's only task is Done, so every one of
its tasks is completed.

### A narrowed vault-and-journal rule

The vault-wide **Identification rule** is **Has** tag `#task`, so a plain checkbox only counts once it
carries that tag. The daily journal's own **relation to the vault-wide rule** is **Narrow**, with a rule
of its own: **Under** heading `Work` — on top of the vault's tag requirement, a daily journal's task
must also sit under a "Work" heading.

A day's note:

```markdown
## Work

- [ ] #task Plan the day
- [ ] Sort the mail

## Personal

- [ ] #task Buy milk
```

Only "Plan the day" is read as a task: it carries `#task`, satisfying the vault rule, and sits under
Work, satisfying the journal's narrowed rule. "Sort the mail" sits under Work but carries no tag, and
"Buy milk" carries the tag but sits under Personal — narrow needs both rules to hold, so Journals reads
both as ordinary checkbox lines, not tasks. That single recognized task is To-do, which is open, so the
day satisfies **Check if note has open tasks** and not **Check if all tasks are completed**.

### A completed parent, an open child

A daily journal with the default status map and default identification rule. A day's note holding:

```markdown
- [x] Shopping
  - [ ] Buy milk
```

and a bare `journal-tasks` fence in that note:

````markdown
```journal-tasks

```
````

The default `status: open` excludes "Shopping" — it is Done — but "Buy milk" is To-do and matches. The
listing shows both: "Shopping" first, dimmed and not clickable, because it is the context that gives
"Buy milk" its meaning, then "Buy milk" indented under it, clickable as normal. Ticking "Buy milk" writes
its Done marker; clicking "Shopping" does nothing.

:::
