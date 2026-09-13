# Troubleshooting

::: v-pre

## Common Issues

### Notes are created in the wrong location

- Check your folder path in journal settings
- Verify your note name template doesn't contain illegal characters
- Make sure the folder exists in your vault

### Template variables aren't working

- Verify syntax: use double braces `{{variable}}`
- For date formatting, use Moment.js syntax (e.g., `{{date:YYYY-MM-DD}}`)
- Check for spaces or typos in variable names

### Calendar view isn't showing notes

- Ensure notes have proper frontmatter (journal name and date)
- Check if you're filtering by shelf and the journal is assigned to that shelf
- Verify the date format in your journal settings matches your note dates

### Conflicts with Templater

- Follow the Templater setup in the compatibility section
- Ensure Templater isn't configured to auto-process the same templates
- The recommended setup is to let the Journal plugin handle the template processing

### Missing decorations

- Verify your condition criteria (tags, properties, dates)
- Check if you're using AND logic when OR might be more appropriate
- Ensure the decoration style settings are properly configured
- Check the decoration's match badge in settings — a rule that reports it matched nothing recently is not firing
- Right-click the cell and choose **Explain decorations** to see which rule won each color, border, and mark, and which rules it overrode

## What to do if you encounter bugs

1. Check the console for error messages (Ctrl+Shift+I on Windows/Linux, Cmd+Option+I on macOS)
2. Verify you're using the latest version of the plugin
3. Try with a minimal configuration to isolate the issue
4. Raise the log level in the plugin's settings, under **Logging**, and dump the recent
   log messages to a note — it often captures more than the console alone
5. Open an [issue](https://github.com/srg-kostyrko/obsidian-journal/issues/new/choose) and
   pick the bug report form; it asks for steps to reproduce, plugin and Obsidian version,
   console output, and your journal configuration

## Maintenance

A settings page for recovering from vault or settings damage. It does nothing on its own — open it from **Settings → Journals → Maintenance** when you suspect something is wrong.

**Settings snapshots**: Before your settings are migrated to a new plugin version, and before you restore an earlier snapshot, a copy of the current settings file is saved automatically. The page lists every snapshot it finds, what it was taken before, and lets you restore one with a click — which itself snapshots whatever it's about to overwrite first. Migration snapshots are kept indefinitely; the three most recent pre-restore snapshots are kept.

**Vault check**: Scans every note that claims a journal in its frontmatter for four kinds of mismatch:

- **Notes the calendar can't see** — a note's stored date no longer matches its journal, usually from a note opened while that journal was misconfigured.
- **Notes with the wrong period range** — a note's start/end dates no longer match the period its own date falls in.
- **Two notes claiming the same period** — you pick which one keeps it; the other has its journal keys removed, its content left otherwise untouched.
- **Notes claiming a journal that no longer exists** — shown as an inventory rather than a problem, since deleting a journal while keeping its notes is a deliberate choice. Remove the leftover keys, or reconnect the notes to a different journal with the "Connect note to a journal" command.
- **Notelets naming a type their journal no longer has** — a [notelet](/notelets) left behind by a type deleted in _keep_ mode. Remove the leftover keys, or reconnect the note with the "Connect note to a journal" command.

A finding the check can repair safely shows a **Fix** button, or use **Fix everything safe** to apply every safe repair at once. A finding it cannot safely resolve — for example, when a note's file name and its own date disagree about which period it belongs to — is listed with an explanation instead of a guess, so you can open the note and decide. The page re-scans after every repair and only reports a note fixed once Obsidian has confirmed the change landed.

Findings are computed against your journals as currently configured, so if you suspect your settings themselves are wrong, restore a snapshot first — repairing notes against a broken configuration can make things worse.

:::
