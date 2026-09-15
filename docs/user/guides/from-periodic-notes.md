# Coming from Periodic Notes

::: v-pre

Periodic Notes has been unmaintained for a long time. This page maps its settings onto Journals,
explains how to bring your existing notes across, and then covers four things people still ask for
there that are already answered here — sometimes in a different enough shape to be easy to miss.

## Settings

| In Periodic Notes                                                 | In Journals                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Daily Notes** … **Yearly Notes**, each turned on                | One [journal](/journals) per period length — daily, weekly, monthly, quarterly, annually — kept together on a [shelf](/shelves) if you like                                                                |
| **Format**                                                        | **Default date format**, with **Note name template** `{{date}}`. A `/` in the format creates folders — see [A note was created in the wrong place](/troubleshooting#a-note-was-created-in-the-wrong-place) |
| **Note Folder**                                                   | **Folder**                                                                                                                                                                                                 |
| _Daily_ **Note Template**                                         | **Templates** — a list, where the first template that exists and has content wins                                                                                                                          |
| **Open daily note**, **Open weekly note** and so on               | "Open today's note" and the matching commands for the other period lengths, which a new vault already has. See [Commands you create](/commands#commands-you-create)                                        |
| **Open next weekly note**, **Open previous daily note** and so on | **Open next note** and **Open previous note**, which step to the nearest note that already exists in the open note's journal. See [Built-in commands](/commands#built-in-commands)                         |

## Your existing notes

Periodic Notes finds notes by file name. Journals finds them by their properties, and adopts a note
that was already in your vault only when you rename or move it onto a path the journal would use — so a
new journal starts with an empty calendar. For each period length:

1. Create the journal with the folder and format you used in Periodic Notes, so new notes land beside
   the old ones.
2. Connect the old notes with [Bulk add](/notes#bulk-add): **Source folder** that folder, **Read the
   date from** **Note title**, and the format they are named with. The first run is a dry run, which
   only lists what it would do.

If your **Format** put part of the date in folders — the row above notes that a `/` does this —
pick **Note path** instead of **Note title**: it reads the whole folder-and-name layout back, where
**Note title** alone cannot tell which folder a note came from.

## Any cadence, not a fixed ladder

Periodic Notes offers day, week, month, quarter and year, with nothing in between. Here a journal can
have a custom interval instead — **Every** a number of days, weeks, months, quarters or years — so a
two-month planning cycle, a three-week sprint or a semester is an ordinary journal, with its own
numbering, navigation block, decorations, and place in **Zoom out** and **Zoom in**.

A custom interval counts from the journal's start date rather than from the calendar year, so a
two-month journal starting in January runs January–February, March–April and so on, while one started
a month later has every interval shifted with it. That start date is chosen when the journal is
created and cannot be changed afterwards. See [Custom intervals](/periods#custom-intervals).

## A different template on particular days

Templates are tried in order and the first one that **exists and has content** wins, and each template
path takes the same variables a note name does. So there is no per-weekday setting to look for: list
`Templates/Daily-{{date:dddd}}.md` before `Templates/Daily.md`, and Fridays use
`Templates/Daily-Friday.md` once that note exists. The variants, and a language trap in weekday names,
are under [A different template on some days](/journals#a-different-template-on-some-days).

## A monthly note that lists its own weeks

Date variables can be shifted and snapped to a boundary, so a template can name the weeks inside its
own period:

```text
## Week {{date+1w:w}}: {{date+1w<startOf=week>:MMM D}} - {{date+1w<endOf=week>:MMM D}}
## Week {{date+2w:w}}: {{date+2w<startOf=week>:MMM D}} - {{date+2w<endOf=week>:MMM D}}
```

Shifts always apply before boundaries, so each line reads "the week N weeks after this note's date,
from its start to its end". The ranges run start of week to end of week; a working-week range such as
Monday to Friday cannot be written this way and needs Templater.

Which month a week straddling a month boundary belongs to is your choice rather than a fixed rule — see
`{{week_of_month}}` under [Variables](/reference/variables).

## Archiving old notes

There is no archive folder setting because none is needed. A note belongs to its journal through its
frontmatter, not its path, so old notes can be moved anywhere — one folder per year, a single archive
folder, or somewhere else entirely — and the calendar, decorations and navigation keep working. A
journal's **Folder** setting only decides where new notes are created.

:::
