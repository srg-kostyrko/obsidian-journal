# Compatibility

## Obsidian and devices

Journals needs Obsidian 1.8.7 or later and runs on desktop and mobile. The interface follows Obsidian's
language setting.

Automatic note creation can be limited to desktop or mobile, which helps when a slow sync lets two
devices each create today's note — see [Notes](/notes#auto-create-today-s-note).

## Plugins that do the same job

- **Daily notes** (core plugin) — Journals replaces it. A note Daily notes creates carries no journal
  properties, so it is only connected if its path matches a journal's folder and name template (see
  [Auto-attach](/notes#auto-attach)). Turn Daily notes off, or point both at different folders.
- **Periodic Notes** — Journals was inspired by it and replaces it. See
  [Coming from Periodic Notes](/guides/from-periodic-notes).
- **Calendar** — Journals builds its own calendars from view blocks. The two do not share settings or
  data. See [Coming from Calendar](/guides/from-calendar).

## Templater

Journals runs Templater itself when a template contains Templater commands.

::: v-pre

1. The journal's own variables are filled in first — `{{date}}`, `{{index}}`, question answers.
2. Templater then runs its commands on the result, so a command can use a journal variable:
   `<% tp.date.now("dddd", 0, "{{date}}", "YYYY-MM-DD") %>` writes `Monday` into the note for 15 June 2026.
3. A sub-template pulled in with `tp.file.include` gets the journal's variables filled in too, before
   Templater reads its commands.
4. A `tp.file.cursor` in the template places the cursor when the new note opens.

:::

### Avoiding double processing

Templater can process a new note on its own as well, and two plugins writing the same new file can leave
it half-rendered or strip the journal properties from it. The safest setup:

- Configure the template in the journal's settings, not in Templater.
- Turn off Templater's **Trigger Templater on new file creation** —
- or keep it on with **Enable Folder Templates** on and **no folder template** covering the journal's
  folder.

The journal's **Templates** section has a **Templater caveats** link with the same advice.

## Notebook Navigator

Notebook Navigator replaces Obsidian's file explorer, and its calendar opens and creates daily, weekly,
monthly, quarterly and yearly notes. Its calendar looks notes up by path, so it can sit alongside
Journals without moving a note: point it at the paths your journals already use.

### Pointing its calendar at a journal

::: v-pre

In Notebook Navigator's settings, check that **Daily note source** is **Notebook Navigator**, and leave
**Root folder (vault profile)** empty — it goes in front of every pattern. Each period length has its
own pattern — **Daily notes**, **Weekly notes** and so on — which is a whole path written as one
Moment.js format. Write the journal's **Folder** and **Note name template** into it: folder names in
square brackets, and each date variable's format as it stands. A `{{date}}` without a format uses the
journal's **Default date format**, so write that format out.

| Journal folder          | Note name template    | Notebook Navigator pattern     |
| ----------------------- | --------------------- | ------------------------------ |
| `Journal/Daily`         | `{{date:YYYY-MM-DD}}` | `[Journal]/[Daily]/YYYY-MM-DD` |
| `Journal/{{date:YYYY}}` | `{{date:YYYY-MM}}`    | `[Journal]/YYYY/YYYY-MM`       |
| `Weekly`                | `{{date:YYYY-[W]ww}}` | `[Weekly]/gggg-[W]ww`          |

A weekly journal's `{{date:YYYY}}` is already the week's own year — see
[Week numbers in names](/periods#week-numbers-in-names) — which is what `gggg` gives in Notebook
Navigator. Notebook Navigator also insists on the parts that name a period: a weekly pattern needs a year
and a week number, a daily one a year, month and day. A weekly journal named by its first day, like
`{{start_date:YYYY-MM-DD}}`, cannot be written as a pattern it accepts.

:::

Week numbers agree only if both plugins use the same weeks — the same first day, and the same first week
of the year. Set Notebook Navigator's **Periodic notes locale** to **Obsidian**, then either leave
Journals' [Week configuration](/periods#weeks) on **Follow system locale**, or turn on **Apply week
configuration to all dates in vault** for the week configuration you chose. With that off, the week
configuration applies only inside Journals, so Notebook Navigator cannot follow it. Month and weekday names in a pattern, like `MMMM`,
match only when both plugins use the same language.

The two paths have to match exactly. Notebook Navigator finds a note by building its path from the date,
and Journals only connects a note whose path its own folder and name template produce, so a pattern
that differs by one character points Notebook Navigator at a file the journal never sees.

### Which journals its calendar can show

Notebook Navigator builds a path from the date and nothing else, so its calendar can show a journal only
if the journal's folder and name are made of date formats and fixed text. A journal's name in fixed
text is fine. It cannot reach a journal whose folder or name uses:

- [sequential numbers](/journals#sequential-numbers) or a question's answer;
- the week of the month, the current time or date, the period's last day, or a
  [date modification](/reference/variables#date-modifications).

It has no custom intervals, so a custom-interval journal is out of its reach entirely.

It also has one pattern per period length, so it shows one journal of each: a second daily journal —
for another shelf, say — and every [notelet](/notelets) stay out of its calendar.

### Notes its calendar creates

When Notebook Navigator creates a note at a journal's path, Journals connects it the moment it appears —
see [Auto-attach](/notes#auto-attach). What ends up in the note depends on the template Notebook
Navigator uses for that period length:

- **No template** — Notebook Navigator creates an empty note, and the journal fills it from its own
  template, Templater commands included, as it does for a note created from a link. This is the setup to
  use: one template, kept in the journal.
- **A template without Templater commands** — Notebook Navigator writes the note complete. Journals adds
  only its properties; the journal's own template does not run, so you keep two templates in step.
- **A template run through Templater** — Templater creates the note empty and fills it a moment later,
  so both plugins can write the same new note. Avoid this, for the reasons in
  [Avoiding double processing](#avoiding-double-processing).

Notebook Navigator falls back to a folder template when no period template is set, so check that none
covers the journal's folder. An empty note it creates is still a new file to Templater, so the
[Templater advice above](#avoiding-double-processing) applies to it too.

A journal's [questions](/questions) are never asked for a note created this way. If a journal has them,
create its notes through Journals — its commands, views and navigation blocks — and use Notebook
Navigator to browse them.

### When the journal already has a note for that date

A journal keeps one note per period. If its note for a date is not at the path the journal's settings
produce — you renamed or moved it, or connected it where it was — Notebook Navigator finds nothing at
that path and creates a second note there. Journals leaves that second note unconnected: calendars,
decorations and navigation blocks keep showing the original, while Notebook Navigator shows the new one.
Delete the new note, then move the journal's note to that path if you want both plugins to agree; a
note keeps its connection wherever it goes.

## Week configuration and other plugins

**Week configuration**, set to anything but **Follow system locale**, offers **Apply week configuration
to all dates in vault**. Off,
the week settings apply only inside Journals. On, they also change how Obsidian itself and other plugins
number weeks; you might need to restart Obsidian. See [Periods](/periods#weeks).

## When another plugin gets in the way

If something in Journals stops responding — a settings field you cannot change, a dialog that does not
open — another plugin may be interfering. To check:

1. Under **Community plugins** in Obsidian's settings, turn off every plugin except Journals. Don't use
   **Restricted mode** for this: it turns off Journals too, and leaving it turns every plugin back on at
   once.
2. If the problem is gone, turn the other plugins back on one at a time until it returns.

Include what you find when you [report a bug](/troubleshooting).
