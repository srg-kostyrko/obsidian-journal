# Settings

A map of every setting, in the order the settings pages show them, each linked to where it is
explained. Open the plugin's settings from **Settings → Community plugins → Journals**; every other
page below is reached from there.

You do not have to come here to find a section, though: every section in the tables below carries a
**?** beside its heading, and clicking it opens that section's part of this manual — in your browser,
or in a tab if you have the **Web Viewer** core plugin turned on. The tables are the same map read
whole, useful for finding a setting whose section you do not know, or for reading a page's sections
in order.

## Main settings page

| Section                                                          | Settings                                                                                                  | Explained in                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Import from other plugins**                                    | **Import…**, **Don't show again** — shown while a plugin can set up a journal you do not have             | [From Periodic Notes](/guides/from-periodic-notes#importing-your-settings) |
| **Colliding journal settings**                                   | shown only when two journals resolve to the same paths                                                    | [Troubleshooting](/troubleshooting#two-journals-fight-over-the-same-notes) |
| **Journal shelves**                                              | **Add shelf**; per shelf **Configure**, **Delete**                                                        | [Shelves](/shelves#creating-shelves)                                       |
| **Journals** (**Journals not on a shelf** once you have shelves) | **Create new journal**; per journal **Bulk add notes to** _journal_, **Configure**, **Clone**, **Delete** | [Journals](/journals#creating-a-journal), [Bulk add](/notes#bulk-add)      |
| **Commands**                                                     | commands for every journal of one period length                                                           | [Commands](/commands#commands-you-create)                                  |
| **Views**                                                        | **Add a view**; per view **Configure**, **Clone**, **Delete**                                             | [Views](/views#a-view-s-settings)                                          |
| **Startup**                                                      | **Open on startup**                                                                                       | [Notes](/notes#opening-a-note-when-obsidian-starts)                        |
|                                                                  | **Open note**, **Pin the note**                                                                           | [Notes](/notes#opening-a-note-when-obsidian-starts)                        |
|                                                                  | **Automatic note creation**                                                                               | [Notes](/notes#auto-create-today-s-note)                                   |
|                                                                  | **Different journal on some days** — **Days of the week**, **Journal to open**                            | [Notes](/notes#opening-a-note-when-obsidian-starts)                        |
| **Notes by date**                                                | **Creation date property**, **Creation date format**                                                      | [Views](/views#notes-by-date)                                              |
| **Calendar**                                                     | **Week configuration** — **Change**                                                                       | [Periods](/periods#weeks)                                                  |
|                                                                  | **Apply week configuration to all dates in vault**                                                        | [Periods](/periods#weeks)                                                  |
|                                                                  | **Default week numbers**                                                                                  | [Views](/views#month-calendar-and-week-calendar)                           |
|                                                                  | **Default timeline navigation**                                                                           | [Code blocks](/reference/code-blocks)                                      |
| **Calendar decorations**                                         | **Marks shown per position**                                                                              | [Decorations](/decorations#marks-shown-per-position)                       |
|                                                                  | vault-wide decorations                                                                                    | [Decorations](/decorations#where-decorations-live)                         |
| **Calendar highlighting**                                        | **Today**, **Active**, **Selected date — ring** colors                                                    | [Views](/views#month-calendar-and-week-calendar)                           |
| **Logging**                                                      | **Log level**, **Export logs**                                                                            | [Troubleshooting](/troubleshooting#reporting-a-bug)                        |
| **Maintenance**                                                  | **Open**                                                                                                  | [Maintenance page](#maintenance-page)                                      |

## A journal's settings page

Reached with **Configure** on a journal's row — on the main settings page, or on its shelf's page.

| Section                     | Settings                                                                                                                                                                        | Explained in                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| _the journal's name_        | **Rename journal**; the period length                                                                                                                                           | [Journals](/journals#renaming-cloning-and-deleting)             |
| **Shelf**                   | **Place on a shelf** — shown once a shelf exists                                                                                                                                | [Shelves](/shelves#putting-a-journal-on-a-shelf)                |
| **Note creation**           | **Note name template**, **Folder**, **Default date format**                                                                                                                     | [Journals](/journals#note-creation)                             |
|                             | **Confirm creating new notes**, **Auto-create today's note**                                                                                                                    | [Notes](/notes#creating-a-note)                                 |
| **Questions**               | **Add question**                                                                                                                                                                | [Questions](/questions)                                         |
| **Templates**               | **Add template**                                                                                                                                                                | [Journals](/journals#templates)                                 |
| **Notelet types**           | **Add notelet type**; per type **Edit notelet type**                                                                                                                            | [Notelets](/notelets#adding-a-notelet-type)                     |
| **Timeline**                | **Start writing on**, **End writing**                                                                                                                                           | [Journals](/journals#timeline)                                  |
| **Sequential numbers**      | **Enable sequential numbers**, **Anchor date**, **Allow before anchor**, digits                                                                                                 | [Journals](/journals#sequential-numbers)                        |
| **Frontmatter**             | **Date property name**, **Add start date property** (then **Start date property name**), **Add end date property** (then **End date property name**), **Notelet type property** | [Journals](/journals#frontmatter)                               |
| **Commands**                | commands for this journal                                                                                                                                                       | [Commands](/commands#commands-you-create)                       |
| **Navigation block**        | lines and segments, **Previous and next arrows**, **Show previous and next periods**, **Decorate whole block**                                                                  | [Navigation blocks](/navigation-blocks)                         |
| **Calendar interval lines** | custom intervals only                                                                                                                                                           | [Navigation blocks](/navigation-blocks#calendar-interval-lines) |
| **Journal decorations**     | this journal's decorations                                                                                                                                                      | [Decorations](/decorations)                                     |

## A notelet type's page

Reached with **Edit notelet type** on a type's row, under **Notelet types** on its journal's page.

| Section           | Settings                                                                                                   | Explained in                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| _the type's name_ | **Bulk add notelets of this type**                                                                         | [Notelets](/notelets#adopting-notes-you-already-have) |
|                   | **Rename notelet type**, **Delete notelet type**                                                           | [Notelets](/notelets#renaming-and-deleting-a-type)    |
| **Note creation** | **Note name**, **Folder**, **Confirm creating notelets**, **Number each notelet** (then **Property name**) | [Notelets](/notelets#adding-a-notelet-type)           |
| **Templates**     | **Add template**                                                                                           | [Journals](/journals#templates)                       |
| **Questions**     | **Add question** — the type's own questions                                                                | [Questions](/questions)                               |
| **Commands**      | commands that create a notelet of this type                                                                | [Commands](/commands#commands-you-create)             |

## A shelf's page

Reached with **Configure** on a shelf's row, under **Journal shelves** on the main settings page.

| Section               | Settings                                                                                                  | Explained in                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| _the shelf's name_    | **Rename shelf**                                                                                          | [Shelves](/shelves#renaming-and-deleting-a-shelf)                 |
| **Journals**          | **Create new journal**; per journal **Bulk add notes to** _journal_, **Configure**, **Clone**, **Delete** | [Shelves](/shelves#creating-shelves), [Bulk add](/notes#bulk-add) |
| **Commands**          | **Add command** — commands for the shelf's journals of one period length                                  | [Shelves](/shelves#commands-on-a-shelf)                           |
| **Shelf decorations** | decorations for every journal on the shelf                                                                | [Decorations](/decorations#where-decorations-live)                |

## A view's page

Reached with **Configure** on a view's row, under **Views** on the main settings page.

| Section           | Settings                                                                                                                                 | Explained in                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| _the view's name_ | **Rename view**                                                                                                                          | [Views](/views#a-view-s-settings) |
|                   | **Icon**, **Default shelf**, **Show in ribbon**, **Open on startup**, **Remember last viewed date**, **Follow active note**, **Open in** | [Views](/views#a-view-s-settings) |
| **Blocks**        | **Add block**; per block its own settings                                                                                                | [Views](/views#blocks)            |

## Maintenance page

Reached with **Open** under **Maintenance**, at the bottom of the main settings page.

| Section                       | Settings                                                                                                                 | Explained in                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Settings snapshots**        | **Restore** on each snapshot                                                                                             | [Troubleshooting](/troubleshooting#settings-snapshots)                     |
| **Import from other plugins** | **Import…**                                                                                                              | [From Periodic Notes](/guides/from-periodic-notes#importing-your-settings) |
| **Vault check**               | **Fix** _count_ per group, **Connect to** _journal_, **Keep this one**, **Remove journal keys**, **Fix everything safe** | [Troubleshooting](/troubleshooting#vault-check)                            |
