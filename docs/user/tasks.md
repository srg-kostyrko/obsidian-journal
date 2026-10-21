# Tasks

::: v-pre

A **task**, here, is a checkbox list item — `- [ ] Buy milk` — in any note, or, once you turn
[task notes](#task-notes) on, a whole note that stands for one task, with its status and dates in
properties. Journals reads them to list a period's tasks and to answer two things about it: [does it
have an open task, and are its tasks all done](/decorations#tasks). This page covers turning that
reading on, what status each checkbox marker or property value means, and which items count as tasks
in the first place.

## Turning tasks on

On the main settings page, expand the **Tasks** section: it lists one row per way Journals has of
finding tasks. **Checkbox tasks**' toggle turns checkbox reading on — it is on by default — and its gear
icon opens checkbox tasks' own settings: the status map and the vault-wide identification rule, both
covered below. **Task notes** is the second row, off by default; [Task notes](#task-notes) covers it.
Each row's own description names its current identification rule in one sentence, so you can see it
without opening anything.

## Status symbols

Every checkbox marker — the character between the brackets — reads as one of seven statuses: **To-do**,
**In progress**, **On hold**, **Done**, **Cancelled**, **Not a task** or **Rolled over**. **To-do**,
**In progress** and **On hold** are open; **Done** and **Cancelled** are done; **Not a task** is
excluded from both counts entirely, and **Rolled over** counts toward neither — a note whose only task
is rolled over is neither open nor done to a [decoration condition](/decorations#tasks).

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

The same section carries a **Task notes** row, which decides which [task notes](#task-notes) this
journal shows; [Which task notes a journal shows](#which-task-notes-a-journal-shows) covers it. Dated
checkbox lines have their own choice in the **Checkbox tasks** modal, covered under [Which dated lines a
journal shows](#which-dated-lines-a-journal-shows).

## Task notes

Some vaults keep one task per note rather than one per line. The
[TaskNotes](https://github.com/callumalpass/tasknotes) plugin does, tagging each such note `#task` and
keeping its status and dates in properties; a hand-rolled convention of a `due:` property on a note does
the same. A note like this one is a whole task:

```markdown
---
tags: [task]
status: open
scheduled: 2026-03-10
title: Draft the report
---
```

Turn **Task notes** on in the **Tasks** section and each such note becomes one task. A task note lives
in no period note, so it is placed **by its date** instead: the note above appears in the listing of
10 March, of that week and of that month, and counts toward their [decorations](/decorations#tasks) —
whether or not a note for that day exists. See [Which date places a task
note](#which-date-places-a-task-note).

Every journal shows every task note until you narrow it; see [Which task notes a journal
shows](#which-task-notes-a-journal-shows).

### Task notes' settings

The gear icon on the **Task notes** row opens its settings modal. Nothing in it applies until **Save**.
The defaults are TaskNotes' own property names, so turning the row on over a vault TaskNotes manages
finds its tasks without opening the modal at all. If you changed TaskNotes' settings, let Journals
[copy them](#setting-up-from-tasknotes) instead.

- **Identify task notes by** — **Tag**, `#task` by default, or **Property**: a property name, and a
  **Property value** it must hold. Leave the value empty to count every note that has the property at
  all, which is what reaches a `due:` convention whose notes carry no tag. A tag also matches the tags
  nested under it, as TaskNotes does: `#task` finds `#task/work`, never `#taskforce`. The tag and the
  property value compare ignoring case; the property name must match exactly. A list property matches
  when any of its items does, and a `true` or `1` written without quotes matches the value `true` or
  `1`. Only a tag in the note's properties counts: a `#task` written in its body marks a line, not the
  note, and leaves it an ordinary note.
- **Excluded folders** — notes inside these folders are never task notes.
- **Archive tag** — `#archived` by default. A note carrying it, or a tag nested under it such as
  `#archived/2025`, in its properties is left out, the way TaskNotes hides archived tasks from its own
  views; leave it empty to keep such notes.
- **Date properties** — which property holds each of a task's five dates: due (`due`), scheduled
  (`scheduled`), start (none), done (`completedDate`) and created (`dateCreated`). A value is read as a
  date when it starts with one in `YYYY-MM-DD` form; a time after it, as in `2026-03-10T14:00`, is
  ignored, and a value that is not a date counts as no date. Leave a row empty to ignore that date.
- **Status property** — `status` by default — and **Status values**, which map what that property
  holds to a status, in any letter case:

  | Value         | Status      |
  | ------------- | ----------- |
  | `none`        | To-do       |
  | `open`        | To-do       |
  | `in-progress` | In progress |
  | `done`        | Done        |

  Any other value reads as To-do, and so does a note with no status property at all. Each row's
  **Written back** icon works the way it does for [checkbox markers](#status-symbols): it marks the
  value written into the note when a task's status changes, `open` for To-do and `done` for Done by
  default.

- **Title property** — `title` by default. A note that sets it is listed by that title; one that does
  not is listed by its file name.
- **Modified property** — `dateModified` by default, stamped whenever a task note is ticked. Leave it
  empty to skip it.
- **Recurrence properties** — `recurrence, recurrence_parent` by default. A note with any of them set is
  recurring; see [Ticking a task note](#ticking-a-task-note).

### Setting up from TaskNotes

While the TaskNotes plugin is on and **Task notes** has never been turned on, the main settings page
carries a **Set up task notes from TaskNotes** card near its top. **Set up…** copies TaskNotes' settings into
[Task notes' settings](#task-notes-settings), turns **Task notes** on, and opens its settings modal so
you can check the result. The copy is saved before the modal opens: **Cancel** closes it and keeps
what was copied. **Don't show again** hides the card for good.

What is copied:

- how TaskNotes identifies a task — by tag, or by a property and its value — into **Identify task
  notes by**;
- its excluded folders and its archive tag;
- the property it uses for each of the status, title, modified date, due date, scheduled date,
  completed date, created date, recurrence and recurrence parent. The start date has no TaskNotes
  counterpart and is left empty;
- its statuses into **Status values**: a status TaskNotes counts as completed reads as Done, one named
  `in-progress` as In progress, and every other as To-do. TaskNotes' default status is written back for
  To-do, provided it reads as To-do; otherwise its first To-do status is, in TaskNotes' own
  order. Its first completed status is written back for Done, and its `in-progress` status for In
  progress, if it has one.

The copy is made once. Later changes in TaskNotes' settings do not reach Journals; change them here
as well, in the same modal. Once **Task notes** has been on, by this card or by hand, the card does
not come back — not even after you turn **Task notes** off again. Nor does it appear when TaskNotes'
settings cannot be read, or would identify no note — when its task tag is empty, or, identifying by
property, its property name or value is; set **Task notes** up by hand then.

### Which date places a task note

With no date named, a task note belongs to every period its **scheduled or due** date falls in. A task
scheduled on Monday and due on Friday therefore appears in both days' listings, and once in that week's.
A surface can name a single date instead — the fence's [`date` key](#fence-keys), the tasks view block's
**Task date**, the decoration condition's [**Task date**](/decorations#tasks) — choosing among
**Scheduled or due date**, **Due date**, **Scheduled date**, **Start date**, **Done date** and
**Created date**. A task note with none of the chosen dates appears nowhere.

Two of a listing's settings do not reach task notes. `source` picks between a period's note and its
notelets, and a task note is neither. `depth: rollup` gathers the periods inside the host one, and a
task note already belongs to every period holding its date, so a month's listing shows the month's
task notes either way.

A recurring task note appears on the dates it has stored, never on later occurrences computed from its
recurrence rule.

A checkbox line is placed by date the same way, but only when it carries a date: a `📅 2026-03-10` on
the line puts it in the listing of 10 March, whichever note holds it (see [Dated lines from anywhere in
the vault](#dated-lines-from-anywhere-in-the-vault)). The surface's chosen date picks which of the
line's dates counts, and a line with no such date is not placed by date at all — it is listed only in
the period whose note or notelet holds it, so one in a note no journal owns is not listed at all.

### Filters and task notes

- A **tag** condition — the fence's `tag` key, a `conditions:` entry, a view block's or decoration's
  own filter — matches a task note's tags in its properties. A tag only in its body does not count,
  here or for **Identify task notes by**.
- A **heading** condition does not apply to a task note: it sits under no heading, so a fence naming
  one still lists the period's task notes.
- **Status** applies as it does to any task: the default `status: open` hides a task note once it is
  done.
- A [journal's own listing filter](#a-journal-s-own-listing-filter) reaches task notes through its
  **Status** condition only. Its tag and heading conditions were written for the journal's own checkbox
  lines, so they do not hide task notes from it; to narrow a journal's task notes by tag, use
  [its Task notes setting](#which-task-notes-a-journal-shows). In a [tasks view block](#the-tasks-view-block), a
  journal's listing filter does not reach task notes at all; the block's own **Filter** decides, open
  only when it names no status.
- `provider: checkbox` lists checkbox tasks alone, and `provider: note-property` task notes alone.

A task note that is also a journal's period note — one carrying both `#task` and `journal:` properties —
is listed once, by its date, never a second time as a task held by that period note.

### Which task notes a journal shows

A task note belongs to no journal, so on its own every journal with a period on its date would show
it: a Work and a Personal daily journal would both list every task due that day. Each journal
therefore chooses for itself. On the journal's settings page, expand **Tasks**: the **Task notes** row
says in one sentence what this journal shows, and its **Edit** button opens a modal with **Show**:

- **All** (default) — every task note.
- **Matching** — only task notes that meet the conditions below it.
- **None** — no task notes. The journal's checkbox tasks are unaffected.

Under **Matching**, **Add condition** adds a row, and the dropdown above the rows picks **Match all
conditions** or **Match any condition**. Each row is one of:

- **Tag** — one or more tags, separated by commas; a note matches if it carries any of them in its
  properties. A tag also matches the tags nested under it, as Obsidian's tag search does: `#work`
  matches `#work/planning`, never `#workshop`. Case does not matter.
- **Folder** — one or more folders, each in its own field; a note matches if it sits inside any of
  them, subfolders included. Case matters, as it does for paths in the vault.
- **Property** — a property name and one or more values; a note matches if that property holds any of
  them, as its value or as one item of a list. The property name must match exactly; the values
  ignore case, and a link counts as the note it points to: a note with `projects: ["[[Website]]"]`
  matches the value `Website`, and one linking `[[Projects/Website]]` matches `Website` or
  `Projects/Website`. A value written as a link, `[[Projects/Website]]`, matches that path only.

**Save** stays disabled while a row has no value, or a **Property** row no name. **Matching** with no
rows shows every task note, as **All** does.

The setting only ever narrows. A note that [Task notes' settings](#task-notes-settings) do not
identify as a task note never reaches any journal, whatever its conditions say.

Where it applies:

- A `journal-tasks` code block shows the task notes of the journal whose note it sits in. With
  `depth: rollup` too, that journal decides alone; the journals it rolls up do not add task notes.
- A [tasks view block](#the-tasks-view-block) shows a task note when any journal it lists shows it,
  and shows it once.
- A [Check tasks](/decorations#tasks) decoration counts the task notes its cell's journal shows.
  **None** counts only those as something to look in, so a day with no note, whose only task note
  this journal does not show, stays undecorated.
- The plugin API's `tasksFor` asks each journal it matches, and returns a task note once, under the
  first of them that shows it.

### Ticking a task note

A task note's row ticks like any other: clicking its checkbox writes the **Written back** value for
Done into the status property — or, on a row that is already done, the value for To-do. When the
matching property is set in **Date properties** and **Modified property**, the same click also:

- writes today's date, as `2026-03-10`, into the done-date property on a tick to Done, and removes that
  property on a tick back to To-do;
- writes the current time, with its offset from UTC, as `2026-03-10T09:30:00+01:00`, into the modified
  property.

The note's body and its other property values are left alone.

A **recurring** task note refuses, with a notice. A series is advanced by the plugin that manages it,
off the completion of its current note; writing `done` ourselves would complete that note and end the
series without anything failing loudly. Tick it in that plugin instead. A note Obsidian has not yet
read the properties of, for a moment after startup, refuses too, since whether it is recurring cannot
be told yet.

## Listing tasks in a note

A `journal-tasks` code block lists the tasks of the period the note it sits in belongs to — the note's
own tasks, its notelets', or both, the [task notes](#task-notes) dated in the period, and dated
checkbox lines from anywhere in the vault. With
`sort: document`, the task notes come last. In a
note connected to no journal it lists nothing and says so.

````markdown
```journal-tasks
sort: status
```
````

A bare fence, with no keys at all, defaults to `source: both`, `depth: literal`, `status: open`,
`sort: document` and `date: scheduled-or-due`. A listing only reads notes, where a move or a rollover would write into them, so it
can afford to default wider than those do: a bare fence in a day note that showed everything the note
held would just mirror the note it already sits in, telling you nothing you could not see by opening
it. The `status: open` default gives way to the journal's own, where [it has
one](#a-journal-s-own-listing-filter).

A listing finds checkbox tasks by where they live — a period's own note, its notelets, or both — and
also by their date, which is how task notes and dated checkbox lines from anywhere in the vault reach
it; `date` names which of the dates places them. See [Which date places a task
note](#which-date-places-a-task-note).

### Fence keys

| Key          | Default            | Names                                                                                                                                                                                                                                                                      |
| ------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`   | every one          | which providers to read tasks from, by id: `checkbox` for **Checkbox tasks**, `note-property` for **Task notes**.                                                                                                                                                          |
| `source`     | `both`             | `note`, `notelets` or `both`.                                                                                                                                                                                                                                              |
| `depth`      | `literal`          | `literal` (this period's own note and notelets) or `rollup`, which widens to every other journal in the host's shelf (or every journal, when it is on none) whose periods fall inside this one — a month can list its days' tasks alongside its own.                       |
| `status`     | `open`             | `open` (to-do, in progress, on hold), `done` (done, cancelled), `all`, or any single status name — `on-hold`, `rolled` — to show just that one. The default gives way to [the journal's own **Status** condition](#a-journal-s-own-listing-filter) where it has one.       |
| `heading`    | none               | one or more headings; only tasks sitting under one of them are shown. Write it as it looks in your note, `## Tasks`, or as bare text, `Tasks` — both mean the same heading.                                                                                                |
| `tag`        | none               | one or more tags; only tasks carrying one of them are shown. Write it with or without its leading `#` — `task` and `#task` both mean the same tag.                                                                                                                         |
| `sort`       | `document`         | `document`, `status`, or a date role (`due`, `scheduled`, `start`, `done`, `created`).                                                                                                                                                                                     |
| `date`       | `scheduled-or-due` | which of a task note's, or a dated checkbox line's, dates places it in the period: `scheduled-or-due`, or one date role (`due`, `scheduled`, `start`, `done`, `created`). A checkbox line with no such date is not placed by date.                                         |
| `conditions` | none               | more conditions, of any of the three types above, for anything the flat keys cannot say — see below. Values here are taken **exactly as written**, unlike `heading:` and `tag:`: a heading must be its bare text, `Tasks`, never `## Tasks`, and a tag must carry its `#`. |

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

A task note's row ticks by writing its status property instead; see [Ticking a task
note](#ticking-a-task-note).

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

A task note's row is a checkbox followed by a link to the note, named by its title; clicking the link
opens the task note, and so does the small link below it.

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
listing reads this journal with no filter of its own. Of its conditions, only **Status** reaches
[task notes](#filters-and-task-notes).

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
**Status** condition therefore does reach a surface that named no status of its own — set a journal to
**All** and a bare fence in its notes lists everything, done items included, as does a
[tasks view block](#the-tasks-view-block) whose **Filter** holds no **Status** condition. The default
only fills in where neither side named a status at all.

The editor's own **Status** control offers only three groupings — **Open**, **Done**, **All** — the same
three names the `status:` fence key accepts as aliases. A fence, or the `conditions:` escape hatch, can
instead name one status directly, such as `on-hold`, which the settings editor has no button for.

### Dated lines from anywhere in the vault

A checkbox line that carries a date also appears **by that date**, wherever its note lives — a project
note, an archive folder, another journal's note. A task in `Projects/Launch.md` written
`- [ ] Ship it 📅 2026-10-30` shows up in the listing of 30 October, lights that day's [tasks
decoration](/decorations#tasks), and is returned by the plugin API. A line with no date is listed only
in the period whose note or notelet holds it, as before, so one in a note no journal owns is not listed.

Two date formats are read:

- **Tasks emoji** — `📅` due, `⏳` scheduled, `🛫` start, `✅` done and `➕` created, each followed by
  a `YYYY-MM-DD` date.
- **Dataview inline fields** — `[due:: 2026-10-30]` or `(due:: 2026-10-30)`, with the keys `due`,
  `scheduled`, `start`, `created` and `completion`, the last of which is the done date.

A dated line in a note a journal owns keeps that journal's [own listing
filter](#a-journal-s-own-listing-filter) wherever it is listed by date. A daily journal that lists only
what sits under `## Tasks` keeps a dated habit under `## Habits` out of its own day, and out of a weekly
note's listing, its tasks decoration and the plugin API's answer too. The whole filter applies, its
**Status** condition included: a weekly journal set to show every status still leaves out a done line
from a daily note when the daily journal's filter hides done tasks — the same rule a rollup already
applies to the daily notes it walks. A condition the fence or block names itself still replaces the
journal's of the same kind. A line in a note no journal owns has no such filter, and is filtered the
way a [task note](#filters-and-task-notes) is.

Which of a task's dates places it in a period is the fence's `date` key, covered under [Fence
keys](#fence-keys). The [vault-wide identification rule](#which-checkbox-items-count-as-tasks) still
decides which lines count as tasks; a journal's own rule applies to the notes that journal owns, and
each journal can narrow which dated lines it shows, as [Which dated lines a journal
shows](#which-dated-lines-a-journal-shows) explains.

Only the task's own line is read for dates, never its subtasks: a dated subtask is a task in its own
right and appears by its own date.

The lines are found by reading your vault once at startup, after Obsidian has indexed it, so a
vault-wide listing is complete a moment after launch rather than instantly. There is nothing to turn
on: it follows **Checkbox tasks**' toggle. Notes under Obsidian's **Files and links → Excluded files**
are skipped, unless a journal owns them, in which case their tasks stay. A change to **Excluded files**
takes effect at the next restart, or the next time you change a checkbox tasks setting.

### Which dated lines a journal shows

Left alone, every journal with a period on a line's date shows it: a Work and a Personal daily journal
would both list the venue booking dated tomorrow. On the journal's settings page, expand **Tasks**:
below **Checkbox tasks**' summary, a second sentence says what this journal shows of them, and the
**Edit** button opens a modal whose **Dated tasks** section holds **Show**, with the same choices and
conditions as [Which task notes a journal shows](#which-task-notes-a-journal-shows):

- **All** (default) — every dated line.
- **Matching** — only dated lines that meet the conditions below it.
- **None** — no dated lines.

A **Tag** condition matches the line's own tags and its note's tags in properties. **Folder** and
**Property** conditions read the note that holds the line. **Save** stays disabled while a row has no
value, as it does for task notes.

The setting only narrows, and only what arrives by date. A checkbox in one of the journal's own period
notes is always listed there, whatever the setting says. A line in one of its notes that is dated for
another day is a dated line like any other: it is shown on its date only if the journal asked about
that date shows it.

Where it applies follows the task notes' rule: a `journal-tasks` code block asks the journal whose note
it sits in, a tasks view block shows a line when any journal it lists shows it, and a [Check
tasks](/decorations#tasks) decoration asks its cell's journal. The plugin API's `tasksFor` asks each
journal it matches.

For a Work and Personal split, give `personal` **None** for **Dated tasks** while `work` keeps **All**:
`- [ ] Book the venue 📅 2026-03-10` in a project note then appears in `work`'s note for 10 March and
no longer in `personal`'s, which still lists its own checkboxes.

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
- **Task date** — the same as the fence's `date`: which of a task note's, or a dated checkbox line's, dates places it in the window. Dated lines are admitted when any of the block's journals shows them, as task notes are.
  A task note is listed when any of the block's journals [shows it](#which-task-notes-a-journal-shows).
- **Filter** — the same condition editor [a journal's own listing filter](#a-journal-s-own-listing-filter)
  uses, scoped to this block instead of to a journal. A new block holds no conditions at all, so it
  shows what is still open the same way a bare fence does, and each journal's own **Status** condition
  applies where it has one. The row says so under its summary. Add a **Status** condition here to
  decide for every journal the block lists. [Task notes](#filters-and-task-notes) take this
  **Filter** alone; no journal's own condition reaches them here.

The block has no **Depth** control. Unlike the fence, which is literal about one host note unless you
ask it to roll up, the block already walks every journal its window and its shelf scope name — there is
no narrower "just this one note" state for it to be literal about, and nothing beyond that configured
scope for a rollup to widen into.

## Rolling tasks forward

**Roll over unfinished tasks**, in the command palette, takes the unfinished tasks from a journal's
earlier notes and puts them into the note for today. It runs for the journal of the note you have open;
with no journal note open, it asks which journal. The note for today is the one for the period that
contains today — today's daily note, this week's weekly note — and it is created if it does not exist
yet, the same way any new note is, so a journal that confirms creation or asks questions does so here
too. Nothing is created when there is nothing to roll, and nothing rolls when today is outside the
journal's [timeline](/journals#timeline). The command does not open the note.

### Which tasks roll

The command reads the journal's earlier notes that exist — by default only the last one, however long
ago it was written, so after a two-week break it still finds the note from before the break. From
those notes it takes **checkbox tasks** that are:

- **open** — To-do, In progress or On hold. Done, cancelled and already rolled-over tasks stay where
  they are. This is fixed: the **Status** conditions in the journal's
  [listing filter](#a-journal-s-own-listing-filter) do not apply, so a filter set to **All** for a
  listing does not drag finished work forward.
- **inside the listing filter's other conditions.** Its **Heading** and **Tag** conditions decide which
  lines roll, so a journal filtered to the `Tasks` heading rolls only what sits under `Tasks` and
  leaves a `Habits` list alone. With no listing filter, every open checkbox task rolls.
- **tasks at all**, under the [identification rule](#which-checkbox-items-count-as-tasks) that applies
  to the note.

A task brings everything nested under it, whatever each nested line's own status. When an open task
sits under a parent that does not roll — a done `Shopping` over an open `milk` — the parent is copied
too, so the task keeps its meaning, but it is not marked and it stays as it was in the earlier note.
A line nested under a task that was already rolled over never rolls on its own.

[Task notes](#task-notes) never roll: moving one would mean changing its date property. The notice
counts the unfinished ones it left in place.

### Where they land

Each task goes under the heading of the same name in today's note, when the heading it sat under is one
the listing filter names and today's note has it. Otherwise it goes under the journal's **Target
heading**, and with none set, or no such heading in the note, at the end of the note. Under a heading,
they go after that section's own lines and before its first subheading, so a `### Someday` list
inside `## Tasks` is left alone. Tasks from the oldest note come first, each note's in the order they
were written.

### Copy, and the rolled marker

By default the command **copies**: the task stays in the earlier note, which keeps the record of what
that day held, and its line gets the **Rolled marker** — `#rolled` unless you change it — so it reads as
**Rolled over** from then on:

```markdown
- [ ] Call the bank #rolled
```

A rolled-over task is neither open nor done: it leaves open listings, stops lighting the calendar's
open-task dots, and is not taken again by the next roll. The marker is a tag, so your own Dataview, Tasks or search queries
can exclude it too. A block id stays at the end of the line, after the marker, and the copy in today's
note drops it, so links to the block keep pointing at the original. Only the top task of each rolled
group is marked; the lines under it are kept from rolling again by having a rolled-over parent.

Turn **Mark as rolled** off and the original is left untouched — which also means the next roll copies
it again.

**Move** instead takes the lines out of the earlier note. A task whose group carries a block id is left
where it is under **Move**, since removing it would break the links to that block, and the notice counts
it.

### Roll-over settings

The **Rolled marker** and the defaults for every journal live in **Checkbox tasks**' settings modal, on
the main settings page, under **Roll over**:

- **Rolled marker** — the tag written on a copied line. It must be something Obsidian reads as a tag:
  letters, numbers, `_`, `-` and `/`, not only numbers. Changing it does not touch notes already
  stamped, so their lines read as unfinished again — and roll again — until you change it back.
- **Copy or move** — **Copy** by default.
- **Mark as rolled** — on by default.

A journal's **Tasks** section has its own **Roll over** row, which summarizes what the command does for
that journal. **Edit** opens:

- **Copy or move** and **Mark as rolled** — **Default** follows the setting above; pick a value to set
  this journal's own.
- **Source** — **Note only** (the default), **Notelets only**, or **Note and notelets**: which of the
  earlier periods' notes to take tasks from, the period note or its [notelets](/notelets). With
  notelets in the source, a period that holds only notelets, and no period note, still counts as an
  earlier note. Tasks always land in today's period note, never in a notelet.
- **Target heading** — the heading tasks go under when the heading they came from is not in today's
  note. Type the heading's text; leading `#` markers are dropped.
- **Look back** — how many earlier notes to take tasks from, 1 by default. Each is an existing note, so
  with 3 a journal you write on weekdays reads back to the previous Wednesday on a Monday. With **Mark as rolled**
  on, or under **Move**, a task taken once is marked or removed, so raising it does not bring the same
  task twice.

### What the notice says

The notice names how many tasks rolled and the oldest note they came from, or that the earlier note held
no unfinished tasks. Two other cases are worth knowing:

- **"No Tasks heading in …"** — the earlier note has none of the headings the listing filter's
  **Under** conditions name, so nothing could match. The notice names the first of them. Usually the
  heading was renamed in the template or misspelled in the filter.
- **"… changed while rolling"** or **"… could not be marked as rolled"** — the tasks reached today's note
  but the earlier note was left as it was, so they would roll again. Under **Move** the same two cases
  read **"… changed while rolling"** and **"… could not be updated"**, and say the tasks were copied
  but are still in the earlier note too. Either way, mark or remove the originals by hand, or delete
  the copies.

The command writes today's note before it touches the earlier one, so a failure part-way leaves a task
in both notes, never in neither.

## Examples

### An in-progress day

A daily journal with a **Check tasks** decoration set to **Any** · **Open** and the default status map. A day's
note holding:

```markdown
- [/] In progress
```

decorates that day: `/` reads as In progress, which is open, so the note has an open task even though
its only checkbox is marked, not empty.

### All tasks completed

A monthly journal with a **Check tasks** decoration set to **All** · **Done** and the default status map. A
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
day satisfies **Any** · **Open** and not **All** · **Done**.

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

### A task note on its day

**Task notes** turned on, every one of its settings at its default, and a daily journal. Two task
notes, neither of them a period note:

```markdown
---
tags: [task]
status: open
scheduled: 2026-03-10
title: Draft the report
---
```

```markdown
---
tags: [task]
status: open
due: 2026-03-10
recurrence: FREQ=WEEKLY
---
```

The second is saved as `Tasks/Water the plants.md`. A bare `journal-tasks` fence in the note for
10 March lists both: "Draft the report" by its title, scheduled that day, and "Water the plants" by its
file name, due that day. Ticking "Draft the report" writes `status: done`, today's date into
`completedDate` and the time into `dateModified`, and the row leaves the listing, which shows open
tasks only. Ticking "Water the plants" changes nothing and shows a notice instead: it is recurring.

### Two journals, one day

**Task notes** turned on at its defaults, and two daily journals, `daily` and `personal`, each with a
note for 4 June 2019 holding a bare `journal-tasks` fence. Three task notes are scheduled or due that
day:

```markdown
---
tags: [task, work/planning]
status: open
scheduled: 2019-06-04
title: Prepare the quarterly review
---
```

```markdown
---
tags: [task, workshop]
status: open
scheduled: 2019-06-04
title: Book the pottery workshop
---
```

```markdown
---
tags: [task]
status: open
due: 2019-06-04
title: Fix the garden gate
---
```

At first both notes list all three. Set `daily`'s **Task notes** to **Matching** with a **Tag**
condition of `#work`, and its row reads "Shows task notes matching tag #work." Its note now lists
"Prepare the quarterly review" alone — `#work/planning` is nested under `#work`, `#workshop` is not —
while `personal`'s still lists all three. Set `personal`'s to **None**, and its listing is empty,
while `daily`'s keeps its one.

### A dot on a day with no note

The same settings, and a daily journal with a **Check tasks** decoration set to **Any** · **Open**.
Today is 10 March, it has no daily note, and one task note is scheduled for it:

```markdown
---
tags: [task]
status: open
scheduled: 2026-03-10
---
```

Today's cell in the calendar is decorated: the task note is open and placed on that day by its
scheduled date, so the day has an open task with no note of its own.

### Rolling the Tasks heading forward

A daily journal whose [listing filter](#a-journal-s-own-listing-filter) is **Under** heading `Tasks`,
every roll-over setting at its default. Yesterday's note holds:

```markdown
## Tasks

- [ ] milk
- [x] bread

## Habits

- [ ] water
```

**Roll over unfinished tasks** adds `- [ ] milk` to the end of today's note and changes yesterday's line
to `- [ ] milk #rolled`. `bread` is done and `water` sits outside the filter, so neither moves, and the
notice reads "Rolled 1 task forward from" yesterday's date.

:::
