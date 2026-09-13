# Notelets

::: v-pre

A journal normally keeps one note per period — one note for today, one for this sprint. A
**notelet** is an extra note the same journal keeps for that period, alongside the period's own
note: meeting notes on a day, a retro on a sprint, a reading log on a week. A period can hold any
number of them.

Every notelet belongs to a **notelet type**, configured on the journal under **Notelet types**. The
type decides where its notes go, what they are named and what they contain; the journal decides
which period a notelet belongs to. A type is a template for notes, not a second journal — it has no
timeline and no calendar of its own.

A notelet is identified by its frontmatter, not by its path. The plugin writes the journal name, the
period's date and the notelet's type into each one, and reads them back from there — so a notelet
you move or rename by hand stays connected.

Each type has:

- **Name** — stored on every notelet of the type, and what you read in lists and menus. Renaming a
  type rewrites the notes that carry the old name, so nothing is left stranded
- **Folder** and **Note name** — where its notes live and what they are called, using the same
  [variables](/reference/variables) as the journal's own notes, plus `{{notelet_index}}`. The name
  defaults to `{{journal_name}} {{notelet_index}}`, and a new type starts in the journal's own
  folder — change it to keep the type's notes somewhere else
- **Templates** — one or more template notes for new notelets of this type, applied the same way a
  journal applies its own
- **Questions** — the type's own [questions](/questions), asked when one of its notelets is created.
  These are separate from the journal's questions, and only the type's own answers are available to
  its name template and folder
- **Confirm creating notelets** — off by default. Shows a confirmation dialog naming the note before
  a notelet of this type is created. It is the type's own setting: the journal's **Confirm creating
  new notes** guards the period note you navigate to, and never reaches a notelet. A type that asks
  questions shows those instead, since that dialog already names the note and can be cancelled
- **Number each notelet** — on by default. Numbering restarts in every period, so the first notelet
  of a day is always 1, and the number is stored in a frontmatter property you can rename
- **Commands** — the plugin seeds one command per type ("Create _\<type\>_"), and you can add more
  targeted at the type

Because several notelets share one period, a name template with nothing that varies _within_ a
period would name them all the same. `{{notelet_index}}`, a clock variable, or one of the type's own
questions makes each name distinct; without any of them the settings page warns, and the plugin adds
a number to the file name so nothing is overwritten. A second warning appears when a type renders
onto the journal's own note path — the plugin keeps them apart automatically, but the two are easy
to confuse.

**Creating a notelet:**

- Run the type's seeded command, or any command you targeted at it
- Use **New notelet** in the [notelets list](/reference/code-blocks), in a view block or a
  `journal-notelets` code block
- Open a link like `obsidian://journals?journal=Daily&notelet=Meeting&date=today`

**Adopting notes you already have:**

- **Connect note to a journal** offers the journal's notelet types alongside its period note, and
  renames and moves the note to match the type — unless one of the type's questions feeds the name
  or folder, in which case the note keeps where and what it is
- **Bulk add** on a notelet type scans a folder and connects the notes it finds in one pass,
  numbering them in scan order

**Deleting a type** asks what to do with the notelets connected to it: **keep** them as ordinary
notes with their frontmatter intact, **clear** the journal and notelet properties from their
frontmatter while leaving the notes in your vault, or **delete** the notes. Cloning a journal
offers **Copy notelet types**, on by default, which gives the copy its own types and commands.

Notelets take part in the rest of the plugin: the **Has notelet** [decoration](/decorations)
condition paints periods that have one, the [Maintenance](/troubleshooting#maintenance) vault check reports notelets
naming a type their journal no longer has, and a notelet counts as the active journal note for
commands and for a view's **Follow active note**.

:::
