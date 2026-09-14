# Journals

::: v-pre

A journal writes one note per period, and every period is the same length: a day, a week, a month, a
quarter, a year, or a custom interval such as a two-week sprint. Want daily, weekly and monthly
notes? Make three journals, one per length. [Shelves](/shelves) are how you keep a set of them
together, and [Periods](/periods) explains how each length is counted.

A journal decides where its notes go, what they are called, what goes into a new one, which dates it
writes for, and which properties it records on each note.

| You want to…                                                 | Go to                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Choose where notes go and what they are called               | [Note creation](#note-creation)                                  |
| Start notes from a template, or a different one on some days | [Templates](#templates)                                          |
| Limit the dates a journal writes notes for                   | [Timeline](#timeline)                                            |
| Number notes — Day 1, Sprint 4                               | [Sequential numbers](#sequential-numbers)                        |
| Rename the properties written into notes                     | [Frontmatter](#frontmatter)                                      |
| Rename, copy or delete a journal                             | [Renaming, cloning and deleting](#renaming-cloning-and-deleting) |

## Creating a journal {#creating-a-journal}

The **+** button (**Create new journal**) in the **Journals** section of the main settings page opens
**Add journal**, which asks for:

- **Journal name** — must be unique. Journal names appear in the command palette, in note properties
  and in code blocks.
- **I'll be writing** — **daily**, **weekly**, **monthly**, **quarterly**, **annually**, or **Custom
  intervals**. For custom intervals, **Every** sets the length — a number and a unit — and **Start
  date** is what intervals are counted from; it cannot be changed after creating the journal.

**Create** opens the new journal's settings page. The period length cannot be changed later; the
settings page shows it next to the journal's name.

A new journal names its notes `{{date}}` — `{{journal_name}} {{index}}` for custom intervals — keeps
them at the root of the vault, and formats dates to suit its period.

## Note creation {#note-creation}

**Resolved note path:** shows where the note for today's period goes, so you can see the effect of
each change as you make it.

**Note name template** — any [template variable](/reference/variables) can go in it: `{{date}}`,
`{{date:dddd}}`, `{{index}}`, a question's answer. Make it name every period differently: two periods
that resolve to the same name share one note. A name the plugin cannot read a date back out of works,
but notes you create yourself will not [auto-attach](/notes#auto-attach).

**Folder** — where new notes go. It takes variables too, so notes can be filed by date:
`Journal/{{date:YYYY}}/{{date:MM}}` puts each note under its year and month. Changing **Folder** later
affects only new notes: the notes a journal already has stay where they are, and stay connected. Move
them yourself if you want them in the new layout — a note keeps its connection wherever it goes.

**Default date format** — used for a date variable that doesn't specify its own format, written with
[moment.js format tokens](https://momentjs.com/docs/#/displaying/format/). A variable with its
own format, like `{{date:DD.MM.YYYY}}`, ignores it.

On a weekly journal, `{{date}}` is not always the week's first day, and week numbers need `w` rather
than `W` — see [Week numbers in names](/periods#week-numbers-in-names).

**Confirm creating new notes** and **Auto-create today's note** are covered in
[Notes](/notes#creating-a-note).

Examples: [Filing notes by year](#filing-notes-by-year), [Filing notes by decade](#filing-notes-by-decade).

## Templates {#templates}

Each is a path to a note used as a template when creating new notes; when multiple are configured, the
first that exists wins. **Add template** adds a path; each path shows its **Resolved
template path:**.

- A template that exists but is empty is skipped, and the next one is tried.
- Paths take variables, so a journal can use a different template on some days — a weekday, a month.
- Variables in the template's text are filled in for the note being created. With Templater
  installed, its commands run afterwards — see [Compatibility](/compatibility).
- A template only ever fills a new note, or an empty note being connected. A note with content is
  never overwritten.

Examples: [Recording when a note was created](#recording-when-a-note-was-created),
[A different template on some days](#a-different-template-on-some-days).

## Timeline {#timeline}

A journal's timeline is the range of dates it writes notes for.

- **Start writing on** — notes before this date are never created. Custom intervals show their
  start date here and cannot change it.
- **End writing** — **Never**, **After date**, or **After repeating** a number of **times**: after
  that date, or after that many notes, the journal creates no new ones. Ending after a number of
  repeats needs a start date to count from; without one the journal is not bounded and the settings
  page says so.

A period that straddles the start date is inside the timeline — a week whose first day falls before
a mid-week start still gets its note.

Outside the timeline, calendar cells cannot be clicked, auto-create, auto-attach and bulk add skip
the date, and **Connect note to a journal** refuses it. Notes that already exist for those dates stay
where they are, and still open and link.

Example: [A journal with a start and an end](#a-journal-with-a-start-and-an-end).

## Sequential numbers {#sequential-numbers}

For numbered entries (like `Sprint 1`), and for chained ones (like `Release4711Sprint1`).

- **Enable sequential numbers** — assigns numbers to notes, e.g. Day 1, Day 2…
- A journal's numbering is an ordered list of **digits**, slowest first. The last (fastest) digit
  advances once per note; when it wraps around, it carries into the digit above it, the way a car
  odometer's ones wheel turns the tens wheel. **Add digit** and **Edit digit** open the same dialog:
  - **Variable name** — used in a note name or folder as a template variable, written as `{{name}}`.
  - **Start number** — the number assigned at the anchor date.
  - **Reset** — only the first (slowest) digit has it: **Continuous** never resets, and **Resets
    after** a number of **repeats** starts over. Every digit below the first resets after a fixed
    count instead, set as **How many per** _the digit above it_: after that many, this digit restarts
    and the one above it goes up by one.
  - **Property name** — the property the digit's number is stored in.
- **Anchor date** — numbering starts from this date: the note for this date gets the start number, and
  later notes count up from it. A journal with a start date uses it as the anchor date.
- Digits can only be added at the bottom (**Add digit**), as a new fastest digit — there is no way to
  insert a slower one above the current top. To turn a single-counter journal into a chained one
  (say, adding Release above an existing Sprint), rename the existing digit to `release`, give it
  its new start number, and add a finer `sprint` digit beneath it.
- The last remaining digit cannot be deleted; deleting the slowest one promotes the next digit to
  take its place.
- **Allow before anchor** — allows indexing before the anchor date, which may produce negative numbers.
  Offered only when the journal has no start date and the slowest digit is Continuous.
- **Preview** shows the full paths of the next five notes, so a digit used only in the folder is
  visible too.
- A note named only by its digits (no date anywhere in the name or folder) can still be matched back
  to its journal, but only when the slowest digit is Continuous **and** every digit appears in the
  name or folder template.

For example, a name template of `Release{{release}}Sprint{{sprint}}` with `release` starting at 4711
(Continuous) and `sprint` starting at 1 (6 per release) produces `Release4711Sprint1` …
`Release4711Sprint6`, then `Release4712Sprint1`. The whole configuration is under
[Release and sprint numbering](/guides/setup-examples#release-and-sprint-numbering).

## Frontmatter {#frontmatter}

Every journal note carries a `journal` property naming its journal. That name is fixed. The others are
yours to rename:

- **Date property name** — the period's date. `journal-date` unless you change it.
- **Add start date property** — for weekly journals that span two years, the start date can differ
  from the date property; turn it on to record the period's first day under **Start date property
  name** (`journal-start-date`).
- **Add end date property** — records the period's last day under **End date property name**
  (`journal-end-date`). A custom interval whose end you moved by hand keeps its end date whether or
  not this is on.
- **Notelet type property** — records which notelet type a note is. See [Notelets](/notelets).

Renaming a property moves the value to the new name on every note the journal already has, notelets
included, so no note loses its connection.

## The rest of a journal's settings

- **Questions** — asked when a note is created. See [Questions](/questions).
- **Notelet types** — extra notes a period can hold. See [Notelets](/notelets).
- **Commands** — commands targeting this journal. See [Commands](/commands).
- **Navigation block** and, for custom intervals, **Calendar interval lines** — see
  [Navigation blocks](/navigation-blocks).
- **Decorations** — see [Decorations](/decorations).

## Renaming, cloning and deleting

**Rename journal**, next to the journal's name, changes the `journal` property on every note the
journal already has, notelets included. Shelves and commands follow the new name.

**Clone** makes a copy under a **New journal name**: settings and commands are copied, but notes are
not. **Copy notelet types** adds a command for each type; turn it off to clone without them. The
copy joins the same [shelf](/shelves). It starts with the source's folder and name template, so the
two resolve to the same note paths until you change one — **Colliding journal settings** on the main
settings page says so until you do.

**Delete** says how many notes are connected and asks **What to do with connected notes**:

- **Keep notes** — notes stay in your vault, unchanged. They keep their `journal` property, so no
  other journal adopts them, and a journal you create later with the same name picks them up again.
- **Clear journal data** — notes stay in your vault, but the journal properties are removed from
  their frontmatter.
- **Delete notes** — every note connected to this journal is deleted from your vault.

Commands that target the journal are deleted with it, and it is taken off its shelf.

## Examples

### Filing notes by year

A daily journal with **Folder** `Journal/{{date:YYYY}}` and **Note name template** `{{date}}`. Before
its folder was set, it wrote its note for 31 December 2025 at the root of the vault, as
`2025-12-31.md`.

- Opening its note for 14 September 2026 creates `Journal/2026/2026-09-14.md`.
- Opening 31 December 2025 opens `2025-12-31.md` where it is; nothing is created under `Journal/2025`.
- A note you make yourself at `Journal/2027/2027-01-05.md` is [auto-attached](/notes#auto-attach) for
  5 January 2027.

### Filing notes by decade

A daily journal with **Folder** `Calendar/{{date<startOf=decade>:YYYY}}s/{{date:YYYY}}/{{date:MM}}` and
**Note name template** `{{date}}`. Opening its note for 14 February 1959 creates
`Calendar/1950s/1959/02/1959-02-14.md`.

The plugin cannot read a date back out of the decade part of that folder, so a note you make yourself
at `Calendar/1950s/1959/02/1959-02-15.md` is not [auto-attached](/notes#auto-attach). Create notes in
this layout from a calendar, a command or a link, or connect them with
[Connect note to a journal](/notes#connect-note-to-a-journal).

### Recording when a note was created

The journal's template note starts with:

```markdown
---
created: {{current_date:YYYY-MM-DD}} {{time:HH:mm:ss}}
---
```

A note created at 20:27:19 on 13 September 2026 gets `created: 2026-09-13 20:27:19`.

Take the time from `{{time}}`: `{{current_date}}` holds no time of day — see
[Variables](/reference/variables#the-variables).

### A different template on some days

A daily journal with two **Templates**, in this order:

1. `Templates/Daily-{{date:dddd}}.md`
2. `Templates/Daily.md`

The vault has `Templates/Daily-Friday.md` and no template for any other weekday. Opening Friday 18
September 2026 fills the note from `Daily-Friday.md`; opening Monday 21 September fills it from
`Daily.md`, because `Templates/Daily-Monday.md` does not exist.

`dddd` writes the weekday in Obsidian's language, so with Obsidian in German the Friday template has to
be `Daily-Freitag.md`, and after switching languages new Friday notes fall back to `Daily.md`.
`{{date:E}}` numbers the weekdays instead — 1 for Monday to 7 for Sunday — in any language: with
`Templates/Daily-{{date:E}}.md` first, the same Friday uses `Templates/Daily-5.md`.

The same works for anything a variable expresses — `{{date:MM}}` for a template per month,
`{{week_of_month}}` for the first week of each month. One template is picked, not several combined; to
share a common body, embed it, or include it with Templater's `tp.file.include`.

### A journal with a start and an end

A daily journal named `daily-window` with **Folder** `window`, **Start writing on** 1 June 2030 and
**End writing** **After date** 30 June 2030. Links for the day before and the day after —
`obsidian://journals?journal=daily-window&date=2030-05-31` and `…&date=2030-07-01` — create no note
and show "No journal covers that date."

:::
