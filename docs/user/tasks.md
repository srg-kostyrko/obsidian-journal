# Tasks

::: v-pre

A **task**, here, is a checkbox list item — `- [ ] Buy milk` — in any note. Journals reads them to
answer two things about a period: [does it have an open task, and are its tasks all
done](/decorations#tasks). This page covers turning that reading on, what status each checkbox marker
means, and which checkbox items count as tasks in the first place.

## Turning tasks on

On the main settings page, **Tasks** → **Checkbox tasks** → **Enable** turns checkbox reading on. It is
on by default. **Tasks** groups one section per way Journals has of finding tasks; checkbox items are
the only one so far.

## Status symbols

Every checkbox marker — the character between the brackets — reads as one of seven statuses: **To-do**,
**In progress**, **On hold**, **Done**, **Cancelled**, **Not a task** or **Rolled over**. **To-do**,
**In progress** and **On hold** are open; **Done** and **Cancelled** are done; **Not a task** is
excluded from both counts entirely, and **Rolled over** counts toward neither — a note whose only task
is rolled over satisfies neither [decoration condition](/decorations#tasks).

**Status symbols**, under **Checkbox tasks**, maps markers to statuses:

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

Below the map, **Write symbol for** _status_ appears once per status that has at least one marker
mapped to it, and picks which of that status's markers is the canonical one when more than one maps to
the same status — `x` and `X` both read as Done by default, and this is where you choose which of the
two is the canonical Done marker.

## Which checkbox items count as tasks

Not every checkbox line has to count. **Identification rule**, under **Checkbox tasks**, is a list of
conditions a checkbox item must meet to be read as a task at all, combined by **Match all conditions**
or **Match any condition**. With no conditions — the default — every checkbox item in every note
counts.

Two condition types, each addable more than once:

- **Tag** — **Has** or **Lacks** a comma-separated list of tags. Checked against tags on the item's own
  line and the note's frontmatter tags, wherever the item sits; a body tag elsewhere in the note does
  not count. Write each tag with or without its leading `#`; the field adds one either way, so the
  row settles on `#task` whichever you typed.
- **Heading** — **Under** or **Not under** a comma-separated list of headings. Checked against every
  heading enclosing the item, from its immediate section up through the note's outline — not only the
  nearest one. Write the heading's text, not its `#` markers — those are dropped if you include
  them, so `## Work` and `Work` both mean the same heading.

**Add condition** adds a row; the delete icon next to a row removes it.

### A journal's own rule

A journal's settings page has its own **Task identification** section, with **Relation to the
vault-wide rule**:

- **Inherit** (default) — the vault-wide rule alone; this journal adds nothing.
- **Narrow** — a checkbox item must satisfy both the vault-wide rule and this journal's own rule.
- **Replace** — this journal's own rule alone; the vault-wide rule does not apply to it.

Choosing **Narrow** or **Replace** reveals the same condition editor as the vault-wide rule, scoped to
this journal.

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
carries that tag. The daily journal's own **Task identification** is **Narrow**, with a rule of its
own: **Under** heading `Work` — on top of the vault's tag requirement, a daily journal's task must also
sit under a "Work" heading.

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

:::
