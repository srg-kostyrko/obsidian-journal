# Commands

::: v-pre

Everything Journals does from the command palette — opening today's note, stepping to the next one,
zooming between period lengths — is a command. Some come built in; the rest you create, aimed at the
journals you want, and bind to hotkeys or the ribbon.

| You want to…                                   | Go to                                         |
| ---------------------------------------------- | --------------------------------------------- |
| Open the next or previous note                 | [Built-in commands](#built-in-commands)       |
| Move between daily, weekly and monthly notes   | [Zoom](#zoom)                                 |
| Add a command for a journal, a shelf or a type | [Commands you create](#commands-you-create)   |
| Change which note a command opens              | [A command's settings](#a-command-s-settings) |
| Open a note from outside Obsidian              | [Links](/reference/links)                     |

## Built-in commands

| Command                                    | What it does                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Open next note**, **Open previous note** | Opens the next or previous note that already exists in the open note's journal. Never creates one. |
| **Zoom out**, **Zoom in**                  | Opens the note one period length longer or shorter than the open note's. See [Zoom](#zoom).        |
| **Insert link to journal note**            | Asks for a journal and a date, and inserts a link to that note at the cursor.                      |
| **Connect note to a journal**              | Connects the open note to a journal and date. See [Notes](/notes#connect-note-to-a-journal).       |
| **Open** _view_                            | Opens a [view](/views).                                                                            |
| **Change shelf in** _view_                 | Picks the shelf an open view shows.                                                                |

The palette lists a command only where it can do something — **Open next note** only while a journal
note is open, for example. A hotkey or ribbon button runs it anyway and shows a notice saying why nothing happened.

### Insert link to journal note

With a note open in the editor, pick a journal — skipped when you have only one — and a date within its
timeline. The link points at the period's note wherever it actually is, or at the path it would be
created at. The note is not created until you follow the link.

### Zoom

**Zoom out** and **Zoom in** move between journals of different period lengths from the note you have
open. From a daily note, zooming out opens that week's note; from there, the month's; zooming in walks
back down, opening the first shorter period inside the current one — the 1st of the month, from a
monthly note.

- Zooming stays among the journals on the same [shelf](/shelves) as the open note's journal, or every
  journal when it is on no shelf.
- A period length no journal in scope writes is passed over: with only daily and monthly journals,
  zooming goes straight between them.
- A custom interval journal takes its place by how long its interval runs; a two-week sprint sits
  between weekly and monthly.
- A journal whose timeline does not include the date is passed over too.
- The note is created if it does not exist. Where two journals in scope write the same length, you are
  asked which.

## Commands you create

A command opens a journal note for a date worked out from today or from the note you have open. Add
them in four places, and where you add one decides what it targets:

| Added from                                  | Targets                                   | In the palette as      |
| ------------------------------------------- | ----------------------------------------- | ---------------------- |
| **Commands** on the main settings page      | every journal of one period length        | _name_                 |
| **Commands** on a journal's settings page   | that journal                              | _journal_: _name_      |
| **Commands** on a [shelf](/shelves)'s page  | the shelf's journals of one period length | Shelf: _shelf_: _name_ |
| **Commands** on a [notelet type](/notelets) | creates a notelet of that type            | _journal_: _name_      |

When a command targets more than one journal and more than one could open a note for the date, it asks
which.

A new vault comes with commands on the main settings page for the current, next and previous daily,
weekly, monthly, quarterly and yearly note — "Open today's note", "Open next weekly note", "Open
previous monthly note" and so on — opening in a new tab. Edit or delete them like your own.

### A command's settings

- **Name** — must be unique among the commands in the same place. For a journal command, the journal's
  name is added in front of it in the palette automatically; for a shelf command, the shelf's name is.
- **Icon** and **Show in ribbon** — show it as a ribbon button.
- **Note type** — for commands on the main settings page or a shelf: **Daily note**, **Weekly note**,
  **Monthly note**, **Quarterly note** or **Yearly note**.
- **When the command runs** — which note it opens, relative to the date below. The choices depend on
  the period length:

  | Choice                                                         | Daily | Monthly, quarterly | Weekly, yearly, custom |
  | -------------------------------------------------------------- | :---: | :----------------: | :--------------------: |
  | current note — "Open today's note", "Open current weekly note" |   ✓   |         ✓          |           ✓            |
  | next, previous note                                            |   ✓   |         ✓          |           ✓            |
  | next, previous _existing_ note                                 |   ✓   |         ✓          |           ✓            |
  | same day next or last week, same day next or last month        |   ✓   |                    |                        |
  | same day, month or quarter next or last year                   |   ✓   |         ✓          |                        |

  The _existing_ choices skip to the nearest period that already has a note and never create one;
  every other choice creates the note if it is missing. A notelet command always creates a new notelet,
  so it has no _existing_ choices.

- **Context** — which note's date the command treats as the current date.
  - **Today** — always today.
  - **Open note's date, or today** — the open journal note's date, or today's date when no
    journal note is open.
  - **Open note's date only** — the open note's date; the command runs only while a journal note is
    open.
- **Open note** — **Replacing the active note**, **In a new tab**, **Next to the active note** or **In a
  popout window**.

Example: [Step back over missing days](#step-back-over-missing-days).

## Examples

### Step back over missing days

A daily journal with **Folder** `day` has notes for 10 and 12 September 2030, and none for the 11th. On
the main settings page, add a command named `Open last available day's note`: **Note type** **Daily
note**, **When the command runs** **Open previous existing daily note**, **Context** **Open note's date,
or today**.

With `day/2030-09-12.md` open, running it opens `day/2030-09-10.md`. It skips the 11th and does not
create a note for it.

For a shelf command, see [A command on a shelf](/shelves#a-command-on-a-shelf); for opening a note from
outside Obsidian, [Links](/reference/links#examples).

:::
