# Journals for Obsidian

Journals keeps notes for days, weeks, months and any span of time you choose — sprints, terms,
quarters — and gives you calendars, navigation and commands to move between them. This manual covers
every setting, code block and migration path.

## Getting started

A new vault comes with a **Calendar** view in the right sidebar, but no journals, so the calendar has
no notes to open yet.

1. Open **Settings → Community plugins → Journals** and press the **+** button (**Create new journal**)
   in the **Journals** section. Give the journal a name, pick **daily** under **I'll be writing**, and
   **Create**.
2. Optionally, make a template note — say `Templates/Daily.md` — holding the navigation code block
   below, and add its path under the journal's **Templates**. Every new note then carries links to the
   days around it.
3. Click today in the Calendar view, or run **Open today's note** from the command palette. Today's
   note is created at the root of the vault, named after its date.

````markdown
```journal-nav

```
````

## How do I…

- [File notes in a folder per year](/journals#filing-notes-by-year)
- [Use a different template on some days](/journals#a-different-template-on-some-days)
- [Bring in the notes I already have](/notes#bulk-add)
- [Write weekly and monthly notes as well](/periods)
- [Number notes, like Sprint 1 and Sprint 2](/journals#sequential-numbers)
- [Keep work and personal journals apart](/shelves)
- [Mark the days that have a note](/decorations#where-decorations-live)
- [Open today's note with a hotkey](/commands#commands-you-create)

Looking for what a setting does? [Settings](/settings) maps every setting to the page that explains
it.

## Basics

1. [Periods](/periods) — what a journal can write one note per.
2. [Journals](/journals) — where notes go, what they are called, what goes in them.
3. [Notes](/notes) — how notes get into a journal, including notes you already have.
4. [Views](/views) — put a calendar on screen.
5. [Navigation blocks](/navigation-blocks) — links to the previous, next and surrounding periods,
   inside each note.

## Going further

- [Shelves](/shelves) — keep work and personal journals apart.
- [Questions](/questions) — ask for a mood, a goal or a date when a note is created.
- [Notelets](/notelets) — extra notes for a period, such as meetings on a day.
- [Decorations](/decorations) — change how dates look when conditions are met.
- [Commands](/commands) — open notes from the command palette, hotkeys and the ribbon.

## Reference and help

- **Reference** — [Settings](/settings), [Variables](/reference/variables),
  [Code blocks](/reference/code-blocks), [Links](/reference/links), [Glossary](/reference/glossary)
- **Help** — [Compatibility](/compatibility), [Troubleshooting](/troubleshooting)

## Guides

- [Coming from Periodic Notes](/guides/from-periodic-notes)
- [Coming from Calendar](/guides/from-calendar)
- [Setup examples](/guides/setup-examples) — complete configurations for common setups
