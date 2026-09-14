# Views and blocks

::: v-pre

A **view** is a panel you build from blocks — calendars, lists, toolbars — and open in a sidebar or a
tab. A **navigation block** is the strip of links a journal puts into its own notes. This page covers
both; the code blocks you type into notes yourself are in [Code blocks](/reference/code-blocks).

## The Calendar view you start with

A new vault gets one view, **Calendar**, in the right sidebar. It opens on startup and has no ribbon
button — run **Open Calendar** from the command palette, or turn on **Show in ribbon**. Every view gets
an **Open** _view_ command the same way. It is built from:

1. a toolbar with the shelf selector, a **Pick date** button and a **Current** button;
2. a toolbar with previous and next year and month buttons around period buttons for the month,
   quarter and year;
3. a month calendar;
4. a divider;
5. a custom intervals list for the selected month.

Edit it, or add views of your own, under **Views** on the main settings page.

## A view's settings

**Add a view** creates one, and **Configure** opens its page:

- **Icon** — shown in the view's tab header and in the ribbon.
- **Default shelf** — the shelf the view starts on when it opens. See [Shelves](/shelves#scoping-a-view).
- **Show in ribbon** — adds a ribbon button that opens the view.
- **Open on startup** — opens this view whenever you open the vault, separate from the startup note
  setting on the main settings page.
- **Remember last viewed date** — reopens the view on the date you last looked at, instead of today.
- **Follow active note** — moves the view to the date of each journal note you open. You can still
  step away from it.
- **Open in** — **Left sidebar**, **Right sidebar** or **New tab**.
- **Blocks** — the view's blocks, top to bottom. **Add block** adds one; each block can be configured,
  moved and removed.

Once a view is open, dragging it elsewhere in the workspace sticks: Obsidian restores it where you left
it, whatever **Open in** says.

## The view's date

Every view has a **selected date**. Calendars center on it and lists read from it. It starts on today,
moves when you open a journal note (with **Follow active note** on), and moves when you step with a
toolbar button.

In a calendar grid, clicking a cell opens that period's note, creating it if needed. To change the
selected date without opening anything, **Shift**+click a day. The keyboard works too: arrow keys move
between cells, Home and End go to the start and end of a row, Enter or Space opens, and Shift+Enter or
Shift+Space selects. Only day cells select; week numbers and month, quarter and year headings always
open.

## Blocks

### Month calendar and Week calendar

A **Month calendar** block shows one or more month grids around the selected date; a **Week calendar**
block shows the same span as week strips instead.

- **Months before** and **Months after** (**Weeks before**, **Weeks after**) — extra grids around the
  selected one.
- **Days of the week** — the days to show; turn weekends off to hide them.
- **Week numbers** — **Use global default**, **Hidden**, **Before weekdays** or **After weekdays**. The
  global default is **Default week numbers** on the main settings page.
- **Show month/year heading** — the heading above each grid.

Each cell shows whether a note exists and carries its [decorations](/decorations). Week numbers and
headings open that week's, month's, quarter's or year's note in whichever journal of that length is
in scope.

**Calendar highlighting**, on the main settings page, sets the colors for **Today** (today's date),
**Active** (the note currently open) and **Selected date — ring**.

### Notes by date

Lists notes created in the period containing the view's selected date — any note in the vault, not
only journal notes.

- **Period** — **Day**, **Week**, **Month**, **Quarter**, **Year** or **Decade**.
- **Sort notes by** — **Name**, **Last modified** or **Creation date**, with **Sort direction**.
- **Show period heading**, **Show period navigation**.

A note's creation date comes from **Creation date property** on the main settings page — `created`,
read with **Creation date format** `YYYY-MM-DD` — and a note without a valid value there falls back to
its file creation time. File creation times change when a vault is synced or copied, so set the
property if you rely on this list.

### Custom intervals

Lists the intervals of every custom interval journal in the view's shelf that fall inside a window
around the selected date.

- **Window** — **Selected day**, **Selected week**, **Selected month**, **Selected quarter** or **Selected
  year**.

Each entry is drawn with its journal's **Calendar interval lines** — see
[Navigation blocks](#navigation-blocks) — and its decorations.

### Notelets

Lists the notelets of the note you are reading, or of a window around the view's date.

- **Window** — as above; **Selected day** by default.
- **Journals** — leave all off to include every journal in the view's shelf.
- **Notelet types** — leave all off to include every type.

See [Notelets](/notelets).

### Markdown template

Renders a template note as markdown, with journal variables processed. Pick a **Template file**. In it,
`{{date}}` is the active note's date, or the view's focused date when no journal note is open, and
`{{journal_link(weekly)}}` resolves to the vault path of another journal's note for the focused
date — wrap it in a link yourself: `[[{{journal_link(weekly)}}|This week]]`. See
[Variables](/reference/variables).

### Divider

A horizontal line between blocks.

### Toolbar

A container for toolbar items such as buttons and the shelf selector. **Add toolbar item** adds:

- **Shelf selector** — switches which shelf scopes the view's journals. See
  [Shelves](/shelves#scoping-a-view).
- **Period buttons** — clickable badges for the current week, month, quarter and year periods. Pick
  them under **Periods**. They carry decorations.
- **Existing notes navigation** — a button that jumps to the previous or next note that already
  exists. **Notes to step through** and **Direction** (**Previous** or **Next**).
- **Button** — one of three presets:
  - **Pick date** — opens a date picker to jump to any note.
  - **Open note** — jumps to the current period's note.
  - **Navigate by step** — steps forward or back by a fixed interval.

  Each has a **Label** and **Tooltip**.

- **Spacer** — a flexible gap that pushes neighboring items apart.

## Navigation blocks

A journal's **Navigation block** section decides what the `journal-nav` code block shows inside a note
of that journal. Put the code block in the journal's template and every note gets it:

````markdown
```journal-nav

```
````

The block reads the journal and date from the note it sits in, so it works only in a note connected
to a journal. An empty strip usually means the note is not connected, or the journal's navigation
block has no lines — **Use defaults for …** puts them back. See [Troubleshooting](/troubleshooting).

### Lines and segments

The block is a stack of **lines**, and each line is one or more **segments** side by side. Every
journal starts with lines suited to its period; **Use defaults for daily notes** (weekly, monthly…)
puts them back. **Add line** and **Add segment** build your own, and you rearrange them by dragging
in the preview.

Each segment has:

- **Template** — its text, with [variables](/reference/variables): `{{date:dddd}}`, `Week
{{date:w}}`.
- **Font size** — a multiplier on the regular font size: 1 means the same size as regular text — and
  **Text style** (**Bold**, **Italic**), plus text and background colors.
- **Link** — what clicking it opens:
  - **None** — nothing;
  - **Self** — the note's own period;
  - **Journal** — another journal's note for the same date; only journals on the same shelf can be
    picked, so a journal on no shelf has none to offer;
  - **Day**, **Week**, **Month**, **Quarter**, **Year** — the note for the day, week… containing the
    date, from the journal of that length on the same shelf, or from any journal when this one is on
    no shelf.
- **Link date** — shifts the date this link opens, using the same syntax as templates: `+1q`, `-1y`,
  `<startOf=month>`.
- **Add decorations** — paint the segment with decorations. A segment linking to another period or
  journal uses the decorations of the note it opens. A segment with no link, or linking to its own
  period unshifted, uses the decorations of every journal of this journal's length on the same shelf.

Clicking a segment opens its note, creating it if it does not exist.

### Block settings

- **Previous and next arrows** — **Step to the adjacent period** or **Jump to the nearest existing
  note**: stepping always moves one period, creating that note if it's missing; jumping skips periods
  that have no note, and never creates one. Clicking a segment always creates its note, whichever you
  choose.
- **Show previous and next periods** — off draws only the current period and its arrows. A single note
  can override it with `adjacent: true` or `adjacent: false` in the code block.
- **Decorate whole block** — paint the whole block with the journal's own decorations for the note's
  period.

On a narrow pane, such as a phone, the previous, current and next columns stack.

### Calendar interval lines

Custom interval journals have a second set of lines, **Calendar interval lines**, edited the same way.
They draw each interval in the **Custom intervals** view block.

## Examples

### A sidebar calendar with the day's notes

A view in the right sidebar built from a toolbar with the shelf selector, **Today** and **This week**
buttons; a toolbar of previous and next buttons around period buttons; a month calendar; a **Notes by
date** block — **Period** **Day**, **Sort notes by** **Last modified**, **Sort direction**
**Descending**; and a custom intervals list. Three notes outside any journal, looked at on 14 September
2026:

| Note                       | `created`                               | Listed |
| -------------------------- | --------------------------------------- | ------ |
| `Inbox/with-created.md`    | `2026-09-14`                            | ✓      |
| `Inbox/without-created.md` | none — its file was created on the 14th | ✓      |
| `Inbox/different-day.md`   | `2026-09-02`                            | —      |

The list shows `without-created`, then `with-created`, the last modified first.

![A sidebar view: toolbars, a decorated September calendar, the two notes for the 14th and a list of sprint dates](/assets/views-and-blocks-sidebar-light.png){.light-only}
![A sidebar view: toolbars, a decorated September calendar, the two notes for the 14th and a list of sprint dates](/assets/views-and-blocks-sidebar-dark.png){.dark-only}

### Week and month lines in a daily note

A daily journal with its default navigation lines — weekday, day, relative date, week, month, year —
next to a weekly journal with **Folder** `week` and a monthly journal with **Folder** `month`. In the
daily note for 14 September 2026, clicking **W38** opens `week/2026-W38.md`, and clicking
**September** opens `month/2026-09.md`.

![A navigation block showing Sunday 13, Monday 14 and Tuesday 15, each with its week, month and year](/assets/views-and-blocks-nav-rows-light.png){.light-only}
![A navigation block showing Sunday 13, Monday 14 and Tuesday 15, each with its week, month and year](/assets/views-and-blocks-nav-rows-dark.png){.dark-only}

### Week numbers after the weekdays

A **Week calendar** block with **Week numbers** **After weekdays**. With the week's note open, its
week number carries the **Active** highlight at the end of the row:

![A week strip from Sunday 13 to Saturday 19 with a highlighted W38 at its right end](/assets/views-and-blocks-week-numbers-light.png){.light-only}
![A week strip from Sunday 13 to Saturday 19 with a highlighted W38 at its right end](/assets/views-and-blocks-week-numbers-dark.png){.dark-only}

:::
