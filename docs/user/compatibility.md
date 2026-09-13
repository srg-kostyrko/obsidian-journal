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

## Week configuration and other plugins

**Week configuration** with **Custom** offers **Apply week configuration to all dates in vault**. Off,
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
