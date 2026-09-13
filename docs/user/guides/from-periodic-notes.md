# Coming from Periodic Notes

::: v-pre

Periodic Notes has been unmaintained for a long time, and several things people
still ask for there are already answered here — sometimes in a different enough
shape to be easy to miss. These four come up most often.

## Any cadence, not a fixed ladder

Periodic Notes offers day, week, month, quarter and year, with nothing in
between. Here a journal has an interval instead — a unit (day, week, month,
quarter or year) and a duration — so a two-month planning cycle, a three-week
sprint or a semester is an ordinary journal, with its own numbering, navigation
block, decorations, and place in **Zoom out** and **Zoom in**.

A custom interval counts from the journal's start date rather than from the
calendar year, so a two-month journal starting in January runs January–February,
March–April and so on, while one started a month later has every interval
shifted with it. That start date is chosen when the journal is created and
cannot be changed afterwards.

## A different template on particular days

Templates are tried in order and the first one that **exists and has content**
wins, and each template path is rendered with the same variables a note name
uses. Together those give a per-weekday template with no extra configuration —
list two templates on the journal:

1. `Templates/Daily-{{date:dddd}}.md`
2. `Templates/Daily.md`

On a Friday the first entry resolves to `Templates/Daily-Friday.md`. If that note
exists it is used; if it does not, the entry is skipped and the plain
`Templates/Daily.md` is used instead. Only the days you actually create a file
for behave differently.

The same works for anything a variable can express: `{{week_of_month}}` for a
first-week-of-the-month template, `{{date:MMMM}}` per month, `{{index}}` per
sprint, or one of the journal's own [questions](/questions).

This **selects** a template rather than combining several — `Daily-Friday.md` is
used _instead of_ `Daily.md`, not appended to it. To share a common body between
them, embed it, or include it with Templater's `tp.file.include`.

## A monthly note that lists its own weeks

Date variables can be shifted and snapped to a boundary, so a template can name
the weeks inside its own period:

```
## Week {{date+1w:w}}: {{date+1w<startOf=week>:MMM D}} - {{date+1w<endOf=week>:MMM D}}
## Week {{date+2w:w}}: {{date+2w<startOf=week>:MMM D}} - {{date+2w<endOf=week>:MMM D}}
```

Shifts always apply before boundaries, so each line reads "the week N weeks after
this note's date, from its start to its end". The ranges run start of week to end
of week; a working-week range such as Monday to Friday cannot be written this way
and needs Templater.

Which month a week straddling a month boundary belongs to is your choice rather
than a fixed rule — see `{{week_of_month}}` under
[Supported variables](/reference/variables).

## Archiving old notes

There is no archive folder setting because none is needed. A note belongs to its
journal through its frontmatter, not its path, so old notes can be moved
anywhere — one folder per year, a single archive folder, or somewhere else
entirely — and the calendar, decorations and navigation keep working. A
journal's **Folder** setting only decides where new notes are created.

:::
