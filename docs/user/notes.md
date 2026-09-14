# Notes

A journal note is an ordinary note in your vault that carries two properties: the journal's name
and the date of the period it belongs to. The plugin reads which journal and which period a note
belongs to from those properties, not from where the note is — so once a note is connected you can
rename it or move it to any folder and it stays connected.

Every way a note gets into a journal comes down to writing those properties. The plugin can create
the note for you, recognize a note you created yourself, or connect a note you point it at.

| You want to…                                             | Use                                                     |
| -------------------------------------------------------- | ------------------------------------------------------- |
| Open or create the note for a date                       | [Creating a note](#creating-a-note)                     |
| Have today's note made without opening anything          | [Auto-create today's note](#auto-create-today-s-note)   |
| Make notes by hand, or by clicking a link, and keep them | [Auto-attach](#auto-attach)                             |
| Adopt one note that is already in your vault             | [Connect note to a journal](#connect-note-to-a-journal) |
| Adopt a whole folder of notes from another plugin        | [Bulk add](#bulk-add)                                   |

::: v-pre

## Creating a note

Opening a period that has no note yet creates it — clicking a day in a calendar, a segment of a
navigation block, a command that opens a period's note, or an [`obsidian://journals` link](/reference/links). Commands
that jump to the nearest _existing_ note never create one; see [Commands](/commands).

- **Where it goes.** The note's name comes from the journal's **Note name template** and its folder
  from **Folder**, both on the journal's settings page. See [Journals](/journals).
- **The period already has a note.** That note opens, wherever it is — including one you renamed or
  moved, or one connected with its own name. No second note is made.
- **A file already sits at that path.** If it belongs to no journal, it becomes this period's note
  instead of being duplicated. If it belongs to a different journal, nothing is changed and a notice
  names the journal that owns it: the plugin never takes over another journal's note. Two journals
  resolving to the same paths is flagged on the main settings page under **Colliding journal
  settings**.
- **What goes in it.** The journal's template is rendered into the new note, then the properties are
  written. See [Journals](/journals) for templates.
- **Questions.** A journal with [questions](/questions) asks them before the note is created, and
  cancelling creates nothing.

**Confirm creating new notes** — shows a confirmation dialog when navigating to a date that does not
yet have a note. Off by default. The dialog, **Create a new journal note?**, names the note it is
about to create. A journal that asks questions shows its question dialog instead, since that dialog
already names the note and can be cancelled.

### Auto-create today's note

**Auto-create today's note** — creates today's note automatically on plugin load and at every local
midnight. Off by default, set per journal.

- Nothing is created on a day outside the journal's timeline.
- The confirmation dialog is never shown for an auto-created note.
- Auto-create never asks questions. A journal with a question whose answer goes into the note's name
  or folder, or with a required question, is skipped rather than created with a guess.
- If a template waits for input — a Templater prompt, say — auto-create stops waiting after 30
  seconds and moves on to the next journal. The note is still written if the template finishes
  later.

**Automatic note creation**, on the main settings page, chooses which devices create notes on their
own: **Desktop and mobile**, **Desktop only** or **Mobile only**. It covers every journal's
**Auto-create today's note** and the startup note. Notes you open yourself are always created, on
any device. Use it when sync is slow enough that your phone and your computer each create today's
note before the other's copy arrives.

### Opening a note when Obsidian starts {#opening-a-note-when-obsidian-starts}

**Startup**, on the main settings page, opens a journal's note for today whenever you open the vault.

- **Open on startup** — pick a journal, or **Don't open**.
- **Different journal on some days** — choose which journal opens on the days you pick; any day you
  don't pick opens the journal above. **Add days** adds a group: its **Days of the week** and the
  **Journal to open**. A day can belong to one group only. A group can open nothing, so a work journal
  can stay shut at the weekend.

On startup the plugin opens today's period in that journal — today's note in a daily journal, this
week's in a weekly one — creating it if it does not exist, the same way [opening a date](#creating-a-note)
does. It runs only when Obsidian starts, not when you turn the plugin off and on.

On a device **Automatic note creation** excludes, the startup note opens only if it already exists, and
nothing is written to it. Renaming a journal updates these settings; deleting one removes it, and days
that opened it fall back to **Open on startup**.

## Auto-attach

When a note appears in your vault — you create it, you click a link to a note that does not exist
yet, it arrives through sync, or you rename a note into place — the plugin checks whether its path is
one a journal would have created. It runs the journal's **Folder** and **Note name template**
backwards to read the date, and any sequence numbers, out of the path.

The note is connected when all of these hold:

- its whole path — folder and name — matches the journal's folder and name template;
- the date it reads falls inside that journal's timeline;
- exactly one journal matches. When two journals could both own the path, the note is left alone;
- it is not connected already, and its properties do not name a journal that no longer exists.
  Such a note keeps its old claim so the journal's notes can be recovered.

A connected note that is still empty gets the journal's template, then its properties. A note that
already has content keeps it; only the properties are added.

**Notes already in your vault are not adopted.** Auto-attach reacts to notes that arrive or are
renamed after Obsidian has finished loading, so a folder of notes you had before installing the
plugin stays as it is. Use [Bulk add](#bulk-add) or [Connect note to a journal](#connect-note-to-a-journal)
for those.

**When a name cannot be read backwards**, notes you make yourself will not auto-attach. The journal's
settings page shows a warning under **Note name template** that names the reason.

A link the plugin wrote for a journal that puts a question's answer into the note name is the one
case where auto-attach asks: clicking the link asks the questions, then names the note from your
answers. Cancelling deletes the still-empty note Obsidian made for the link, the way Obsidian
deletes any file.

Example: [Keep notes you make by hand](#keep-notes-you-make-by-hand).

## Connect note to a journal

Run **Connect note to a journal** from the command palette with a note open in the editor. It is not
offered in reading view.

The dialog shows the note's path and asks:

- **Journal** — which journal to connect it to.
- **Connect as** — shown only when the journal has [notelet types](/notelets). **The journal's own
  note** connects it as the period's note; picking a type connects it as a notelet.
- **Date** — the period it belongs to. A date outside the journal's timeline cannot be connected.

Then, depending on the note and the date:

- **Replace the note already connected to this date** — appears when another note already holds the
  period. **Connect** stays disabled until you turn it on. The other note stays in your vault and
  loses its journal properties. If you are also moving this note onto that note's exact path, the
  other note is moved to trash to make room.
- **Rename file to match the journal** — appears when the note's name differs from what the journal
  would call it, and says both names.
- **Move file into the journal's folder** — appears when the note's folder differs from the journal's,
  and says both folders.

Rename and move start off, and changing the journal or the date turns them off again. Either is
unavailable when a question's answer goes into that part of the path, because nothing is being
asked here; the note keeps its own name or folder.

An empty note gets the journal's template. A note with content keeps it and only gains properties.

For a note that is already connected, the dialog names the journal it is connected to and offers
**Update** and **Disconnect**. **Disconnect** removes the journal's
properties — its date, start and end dates, sequence numbers, question answers and notelet
properties — and leaves the note where it is. Connecting a note to a different journal removes the
old journal's properties in the same step.

Example: [Connect a stray note and file it](#connect-a-stray-note-and-file-it).

## Bulk add

Bulk add connects a folder of existing notes in one pass. Open it from the journals list on the main
settings page: each journal row has a **Bulk add notes to** _journal_ button. A journal on a shelf is
listed on that shelf's page. Notelet types have their own bulk add — see [Notelets](/notelets).

### Choosing the notes

- **Source folder** — subfolders are included; only markdown notes are considered.
- **Read the date from** — **Note title** or **A property**. For a property, give its **Property
  name**; its value has to be text.
- **Date format** — the format the date is written in, prefilled with the journal's own date format.
  The date can sit anywhere in the title: `Standup 2024-03-05` finds `2024-03-05`. If your dates
  include a time component, omit it from the format. A date that falls inside a longer period is
  read as that period — a day's date connects the note to its week on a weekly journal.
- **Filter notes** — **No filter**, **Match all conditions** or **Match any condition**, over title,
  tag and property conditions like those a [decoration](/decorations) uses.

### Deciding what happens

- **When a note is already connected to that date**
  - **Skip** — the new note is left untouched and not connected.
  - **Replace** — the new note takes over the date; the previously connected note stays in the vault
    but is disconnected.
  - **Merge** — the new note's content is appended to the already-connected note, and the new note
    is deleted the way Obsidian deletes any file, following your own setting for deleted files.
  - **Ask for each** — decide for each note on the review screen.
- **When the folder differs** — **Keep**, **Move** or **Ask for each**.
- **When the name differs** — **Keep**, **Rename** or **Ask for each**. As with connecting a single
  note, a question whose answer goes into the name or folder keeps that part as it is.
- **Dry run (preview only)** — reports the changes that would be made without changing any notes. On
  by default.

### Reviewing and running

**Continue** scans the folder and lists every note it would act on, each with the date it read, the
note already connected to that date, and its new path where it would move or be renamed. Notes set
to **Ask for each** get their choice here. Notes it will not touch are listed with the reason:
**Already connected**, **Filtered out**, **No date found**, **Date could not be parsed** or **Outside
the journal's timeline**.

**Run** processes the notes and shows what happened to each. A dry run reports what would have
happened without changing anything in your vault; start again with **Dry run** off to apply it.

Example: [Adopt a folder of daily notes from another plugin](#adopt-a-folder-of-daily-notes-from-another-plugin).

## Examples

### Adopt a folder of daily notes from another plugin

A daily journal set up as:

| Setting            | Value        |
| ------------------ | ------------ |
| Period             | Day          |
| Folder             | `day`        |
| Note name template | `{{date}}`   |
| Date format        | `YYYY-MM-DD` |

A folder `bulk-match` holds `2030-09-01.md` and `2030-09-02.md`, and `bulk-skip` holds
`2030-10-05.md` and `notes.md`.

Run **Bulk add notes to daily** on `bulk-match`, reading the date from **Note title** with format
`YYYY-MM-DD`, turn **Dry run (preview only)** off, then **Continue** and **Run**. Both notes stay
in `bulk-match` and gain:

```yaml
journal: daily
journal-date: 2030-09-01
```

Run it on `bulk-skip`: `2030-10-05.md` is connected, and `notes.md` is listed under **No date
found** and left untouched.

With **When a note is already connected to that date** set to **Replace**, a note in the source
folder takes over a date that `day/2031-01-01.md` already held; `day/2031-01-01.md` stays in your
vault without its journal properties. With **Merge**, the source note's content is appended to the
connected note and the source note goes to the trash.

### Keep notes you make by hand

A daily journal with no folder, **Note name template** `{{date}}` and date format `YYYY-MM-DD`.

- Create a note named `2024-01-15` — it is connected to the journal for 15 January 2024.
- Rename a note `draft` to `2024-01-16` — it is connected for 16 January.
- In any note, click the link `[[2024-02-20]]` — Obsidian creates `2024-02-20.md` in its default
  location for new notes, the vault root, and it is connected. With a different default location
  the new note lands elsewhere, and is connected only if that path matches the journal.
- A note named `groceries` is left alone.

### Connect a stray note and file it

The same daily journal as the first example, with folder `day`. A note `inbox/loose-note.md`
belongs to a date.

1. Open the note and run **Connect note to a journal**.
2. Choose **Journal** `daily` and pick the **Date**.
3. Turn on **Rename file to match the journal** and **Move file into the journal's folder**.
4. **Connect**.

The note moves to `day/` and is renamed to its date, carrying its content with it, and nothing is
left at `inbox/loose-note.md`.

:::
