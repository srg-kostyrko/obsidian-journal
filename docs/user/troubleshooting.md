# Troubleshooting

::: v-pre

Find the symptom, check what it suggests, then use the tools at the bottom of the page — the vault
check, settings snapshots, and the log — if that does not settle it.

## A note is not on the calendar

The calendar shows a note when its properties name the journal and a date the journal recognizes.

1. **Open the note's properties.** It needs `journal` naming the journal exactly, and the date property
   (`journal-date` unless renamed). No properties? The note was never connected — use
   [Connect note to a journal](/notes#connect-note-to-a-journal), or [Bulk add](/notes#bulk-add) for many.
2. **Check the date is the period's first day.** A monthly note dated the 15th, or a weekly note dated
   mid-week, is not recognized. After changing **Week configuration**, a weekly note whose date could
   not be moved stays on the old grid. The vault check finds and fixes both.
3. **Check the shelf.** A calendar scoped to a shelf shows only that shelf's journals. Pick **All
   journals** in the shelf selector to rule it out.
4. **Check the timeline.** A date outside the journal's **Start writing on** / **End writing** cannot
   be clicked in a calendar.

## A note you made yourself was not picked up

Auto-attach reacts to notes created or renamed while Obsidian runs, and only when exactly one journal's
folder and name template match the note's whole path. Notes that were already there when you installed
the plugin are not adopted. See [Auto-attach](/notes#auto-attach) for the full list, and look for a
warning under the journal's **Note name template** — it says when names cannot be read back. A date
format the plugin cannot read back is one cause, and it is easy to miss because the notes themselves
look right: a format that also carries a time zone — `Z` or `ZZ` — is written correctly and matches
nothing on the way back. Build the format from date symbols such as `YYYY-MM-DD`.

## A note was created in the wrong place

- Look at **Resolved note path:** at the top of the journal's **Note creation** section; it shows
  exactly where the next note goes.
- A `/` in **Note name template** or **Default date format** creates folders — the settings page offers
  to move that part into **Folder**.
- The period's note may already exist elsewhere: a note you moved or renamed keeps its connection, and
  opening that period opens it where it is.

## Two journals fight over the same notes {#two-journals-fight-over-the-same-notes}

**Colliding journal settings** on the main settings page names journals whose folder and name template
resolve to the same paths: "Journals … have colliding configurations, so their notes will overwrite each
other." Change the folder or name template of one. A freshly cloned journal always collides until you
do.

When a note path already belongs to another journal, nothing is written and a notice says which.

## Clicking a date asks which journal

Two journals of the same period length are in scope and both cover the date. Pick a shelf in the
view's shelf selector so only one of them is in scope — see
[Work and home on one calendar](/shelves#work-and-home-on-one-calendar). Commands and
[links](/reference/links) that target a period length ask the same way.

## Today's note was created on two devices

When sync is slow, your phone and your computer can each create today's note before the other's copy
arrives. Set **Automatic note creation** on the main settings page to **Desktop only** or **Mobile
only** — see [Auto-create today's note](/notes#auto-create-today-s-note). If two notes now claim the
same day, the [vault check](#vault-check) lists them, and **Keep this one** removes the claim from the
others.

## A command is missing from the palette, or does nothing

The palette lists a command only where it can do something — **Open next note** only while a journal
note is open, and a command whose **Context** is **Open note's date only** likewise. A hotkey or ribbon
button runs it anyway and shows a notice saying why nothing happened. See [Commands](/commands).

## A navigation segment cannot link to another journal

A segment's **Journal** link offers only journals on the same shelf, so a journal on no shelf has
none to offer. Put the journals on one shelf — see
[Navigation blocks and zoom](/shelves#navigation-blocks-and-zoom).

## A code block shows nothing, or an error

- **Nothing at all, or plain code.** The fence name is wrong — `journal-nav`, `calendar-timeline`,
  `journals-home`, `journal-notelets` — or the note is open in Obsidian's Source mode, which shows code
  blocks as plain text. Switch to Live Preview or Reading view.
- **"Note is not connected to a journal".** Navigation and notelet blocks read their journal from the
  note they sit in. Connect the note, or use them only in journal notes.
- **A message about options.** An option name the block does not know is listed above the block, and a
  value it does not understand falls back to the default. Check spelling against
  [Code blocks](/reference/code-blocks).
- **An empty `journals-home`** — "No journals to show. Check the block's show and shelf options." A
  `shelf` naming a renamed or deleted shelf shows nothing.

## Variables show up as `{{…}}` in notes

A `{{…}}` the plugin cannot read is left as written: check the braces are doubled and closed, and the
name is spelled as in [Variables](/reference/variables). `{{note_name}}` does not work in the note name
template itself.

## A decoration does not show

- Its **match badge** in settings says whether it matched recently. "Matched nothing" means the
  conditions never hold — check whether **When to decorate** should be **Decorate when any condition is
  fulfilled** rather than **Decorate when all conditions are fulfilled**.
- Right-click the cell → **Explain decorations** shows which decoration painted each part of the cell and
  which it overrode.
- A property condition offers comparisons for the property's type as Obsidian knows it. Set the type in
  Obsidian first.

See [Decorations](/decorations).

## Settings fields do not respond

Another plugin may be interfering — this has happened. See
[When another plugin gets in the way](/compatibility#when-another-plugin-gets-in-the-way).

## Templater breaks notes or removes properties

See [Templater](/compatibility#templater) for the setup that keeps the two from processing the same note.

## Maintenance {#maintenance}

**Maintenance**, at the bottom of the main settings page, has two tools. It does nothing unless you use
it.

### Vault check {#vault-check}

Scans every note that claims a journal and groups what it finds by journal:

| Group                                           | What it means                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| _journal_ — the calendar cannot see these notes | the stored date is not a period of the journal; the check proposes the right one |
| _journal_ — these notes cover the wrong period  | the start or end date does not match the note's own period                       |
| _journal_ — two notes for _date_                | two notes claim one period; **Keep this one** removes the claim from the others  |
| _journal_ — this journal no longer exists       | notes of a deleted journal; **Remove journal keys**, or reconnect them           |
| _journal_ — unknown notelet type                | notelets of a deleted type; **Remove journal keys**, or reconnect them           |

Each row is marked **Will be fixed** or **Needs your decision**. **Fix** _count_ repairs a group and
**Fix everything safe** repairs every safe finding. Where the file name and the note disagree on
the date, nothing is changed for you: open the note and decide which is right.

Findings reflect your journals as they are configured right now, so if your settings are wrong,
restore a snapshot first. The page checks again after every repair.

### Settings snapshots {#settings-snapshots}

A copy of your settings is saved before the plugin migrates them to a new version ("Taken before
upgrading from settings version 4"), before a snapshot is restored ("Taken before restoring a
snapshot"), and before an import from other plugins ("Taken before importing settings from other
plugins"). **Restore** puts one back.

## Reporting a bug {#reporting-a-bug}

1. Under **Logging** on the main settings page, set **Log level** to **Debug** — only messages at or
   above the chosen level are printed to the console and kept for export, so Debug captures everything.
2. Make the problem happen again.
3. **Export logs** → **Dump logs to note** writes a note named `journal-log-` followed by the date and
   time.
4. Open a [bug report](https://github.com/srg-kostyrko/obsidian-journal/issues/new/choose). It asks what
   happened, steps to reproduce, plugin and Obsidian versions, platform, console output, the journal's
   configuration, and other plugins involved — Templater, Calendar, Periodic Notes, Daily notes. Attach
   the log note.

Set the log level back afterwards.

:::
