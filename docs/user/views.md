# Views

::: v-pre

A **view** is a panel you build from blocks — calendars, lists, toolbars — and open in a sidebar or a
tab. The strip of links a journal draws inside its own notes is a [navigation block](/navigation-blocks),
and the code blocks you type into notes yourself are in [Code blocks](/reference/code-blocks).

| You want to…                                    | Go to                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Change the Calendar you start with              | [The Calendar view you start with](#the-calendar-view-you-start-with) |
| Open a view somewhere else, or on startup       | [A view's settings](#a-view-s-settings)                               |
| Pick a date without opening its note            | [The view's date](#the-view-s-date)                                   |
| Hide weekends or move week numbers              | [Month calendar and Week calendar](#month-calendar-and-week-calendar) |
| List the notes created on a day                 | [Notes by date](#notes-by-date)                                       |
| Add buttons                                     | [Toolbar](#toolbar)                                                   |
| Put links to other periods inside notes instead | [Navigation blocks](/navigation-blocks)                               |

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

## A view's settings {#a-view-s-settings}

**Add a view** creates one, and **Configure** opens its page. The page's heading is the view's name,
with **Rename view**; below it:

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

Each view's row under **Views** also carries **Clone** _view_ and **Delete** _view_. **Clone** _view_
makes a copy named after it with `(copy)` appended, with the same icon, settings and blocks; rename it
from its own page. **Delete** _view_ asks first, then removes the view and its block configuration —
your notes are not affected. A tab still showing a deleted view says so and can be closed.

Once a view is open, dragging it elsewhere in the workspace sticks: Obsidian restores it where you left
it, whatever **Open in** says.

## The view's date

Every view has a **selected date**. Calendars center on it and lists read from it. It starts on today,
unless the view remembers its last date (**Remember last viewed date**) or follows a journal note that
is already open when it opens (**Follow active note**), in which case it starts there. When both
apply, the remembered date wins. It then moves when you open a journal note, with **Follow active
note** on, and when you step with a toolbar button.

In a calendar grid, clicking a cell opens that period's note, creating it if needed. To change the
selected date without opening anything, **Shift**+click a day. The keyboard works too: arrow keys move
between cells, Home and End go to the start and end of a row, Enter or Space opens, and Shift+Enter or
Shift+Space selects. Only day cells select; week numbers and month, quarter and year headings always
open.

## Blocks {#blocks}

### Month calendar and Week calendar {#month-calendar-and-week-calendar}

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

How the grids look — today, the selected date, the open note, the text and the cells themselves — is
set under [Calendar appearance](#calendar-appearance), on the main settings page.

Example: [Week numbers after the weekdays](#week-numbers-after-the-weekdays).

### Notes by date {#notes-by-date}

Lists notes created in the period containing the view's selected date — any note in the vault, not
only journal notes.

- **Period** — **Day**, **Week**, **Month**, **Quarter**, **Year** or **Decade**.
- **Sort notes by** — **Name**, **Last modified** or **Creation date**, with **Sort direction**.
- **Show period heading**, **Show period navigation**.

A note's creation date comes from **Creation date property** on the main settings page — `created`,
read with **Creation date format** `YYYY-MM-DD` — and a note without a valid value there falls back to
its file creation time. File creation times change when a vault is synced or copied, so set the
property if you rely on this list.

Example: [A sidebar calendar with the day's notes](#a-sidebar-calendar-with-the-day-s-notes).

### Custom intervals

Lists the intervals of every custom interval journal in the view's shelf that fall inside a window
around the selected date.

- **Window** — **Selected day**, **Selected week**, **Selected month**, **Selected quarter** or **Selected
  year**.

Each entry is drawn with its journal's
[Calendar interval lines](/navigation-blocks#calendar-interval-lines) and its decorations.

### Notelets

Lists the notelets of the note you are reading, or of a window around the view's date.

- **Window** — as above; **Selected day** by default.
- **Journals** — leave all off to include every journal in the view's shelf.
- **Notelet types** — leave all off to include every type.

See [Notelets](/notelets).

### Tasks

Lists tasks from a window around the view's date, across the journals in the view's shelf. See
[Tasks](/tasks#the-tasks-view-block).

- **Window** — as above; **Selected day** by default.
- **Journals** — leave all off to include every journal in the view's shelf.
- **Source** — **Note only**, **Notelets only** or **Note and notelets**.
- **Sort by** — document order, status, or one of the five date roles a task line can carry.
- **Task date** — which of a task note's or dated checkbox line's dates places it in the window:
  **Scheduled or due date** by default. See
  [Which date places a task note](/tasks#which-date-places-a-task-note).
- **Filter** — which of those tasks to show, as a list of tag, heading and status conditions matched
  under **Match all conditions** or **Match any condition**. Empty on a new block, which shows what is
  still open unless a journal's own listing filter says otherwise.

### Markdown template

Renders a template note as markdown, with journal variables processed. Pick a **Template file**. In it,
`{{date}}` is the active note's date, or the view's selected date when no journal note is open, and
`{{journal_link(weekly)}}` resolves to the vault path of another journal's note for the same
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

## Calendar appearance {#calendar-appearance}

**Calendar appearance**, on the main settings page, opens an editor for how every calendar grid
looks: the month and week calendars in views, and the calendars of timeline code blocks. It applies
to all of them at once; there is no per-view appearance.

At the top is a panel headed **Preview**, whose switch moves between **Wide** and **Narrow**. A calendar counts as narrow when the
calendar itself is narrower than about 28em, however wide the window is — a calendar in a slim
sidebar, say. Changes made under **Wide** apply at every width. Changes made under **Narrow** apply
only to narrow calendars, and take the place of the all-widths value there.

Below the switch is the preview: a sample month around today, with today, the selected date, an
open note, days from the months either side and a few decorated days, drawn at the width you are
editing: **Narrow** at the size of a slim sidebar calendar, **Wide** across the whole panel. The wide
preview never gets narrow enough to count as a narrow calendar, so on a very narrow settings pane it
scrolls sideways instead. Click a part of it to edit that part; a day, a week number or a heading can also be
reached with Tab and picked with Enter or Space. Where a click lands on more than one part — a day
that is today is also a date number and a cell — the most specific one is edited, and **Also here**,
under the preview, lists the others so you can switch to the one you meant. **Editing** lists every
part too, so you can pick one without the preview:

- **Month heading** — the month and year above the grid.
- **Weekday header** — the row of weekday names.
- **Week numbers**
- **Date number** — the day's number in each cell.
- **Today**, **Selected date** (the view's selected date), **Open note** (the note open in the
  editor) and **Days outside the month** — the four highlights.
- **Cells** — the size and spacing of every cell.

A dashed outline in the preview marks the part you are editing: every day a highlight applies to,
the weekday row, the week numbers or the heading. **Date number** and **Cells** belong to every day,
so they outline the day you clicked when you picked them there, by the click itself or from **Also
here**, and every day when you chose them from **Editing**.

A part you have changed carries a dot in **Editing** and in **Also here**. When you edit
**Narrow**, the dot means the part has a narrow-only value.

### What each part offers

The controls are headed by the part's name and the width they apply to, **All widths** or
**Narrow**, and depend on the part. Every one but a highlight's **Style** shows, beneath its name, the
CSS variable a [CSS snippet](#changing-it-with-a-css-snippet) sets to override it; while you edit
**Narrow**, the name shown is the narrow one, ending in `-narrow`.

The four highlights share one set:

- **Style** — **Text only**, **Ring**, **Background** or **None**. Out of the box, today is
  text only, the selected date a ring, the open note a background, and days outside the month text
  only. **None** turns the highlight off.
- **Highlight color** — the ring's or the background's color. Shown for **Ring** and **Background**.
- **Ring width** — 1 to 4 pixels. Shown for **Ring**.
- **Strength** — how strongly the background color fills the day, from 5% to 100%. Shown for
  **Background**.
- **Text color**, **Text weight** and **Text italic** — the day's text while this highlight applies.
  Not shown for **None**.
- **Over decorations** — whether the ring or background, and this highlight's text, are drawn over a
  day's [decorations](/decorations) or under them. Shown for **Ring** and **Background**; out of the
  box, only the selected date's ring is drawn over.

The text parts — **Month heading**, **Weekday header**, **Week numbers** and **Date number** — offer
**Size**, **Weight**, **Italic**, **Color** and **Case** (**As written**, **Uppercase**,
**Lowercase** or **Title case**). **Weight**, **Italic**, **Color** and **Case** also offer
**Default**, which leaves the value to the calendar's stock style. While you edit **Narrow**, a
narrow-only value goes back to the all-widths one through its
[**Narrow only**](#narrow-only-values-and-resetting) tag instead.

**Cells** offers **Padding**, **Corner radius**, **Gap between cells** and **Row height**, the
smallest height a row of cells takes. The decoration editor's style canvas draws its sample cell at
the all-widths row height, so a style is previewed at the size a wide calendar shows it; a
narrow-only row height does not change the canvas.

### Unchanged

A highlight's **Text color**, **Text weight** and **Text italic** can be **Unchanged**: this highlight
leaves that part of the text alone. A day that is several things at once then shows the next
highlight's value instead, in this order — the open note, the selected date, today, then days outside
the month — and, when none of them sets one, the part's own, such as the date number's. Out of the
box, every highlight's weight and italic are **Unchanged**, as is the selected date's text color, so
the ring changes nothing about the number inside it.

**Unchanged** needs a WebView that supports CSS container style queries: Obsidian on desktop, iOS 18
or later, or Android with WebView 111 or later. On older ones, an **Unchanged** text shows the
part's own color and weight, never a lower highlight's, so a selected day that is also today shows
the plain number color rather than today's accent.

### Narrow-only values and resetting

While you edit **Narrow**, a control that has a narrow-only value carries a **Narrow only** tag next
to its name. Click the tag to remove that value, so the all-widths value applies at narrow width too.

The button beside the part's name, above its controls, resets that part for the width you are editing:
**Reset to default** under **Wide** puts the part's all-widths values back to their defaults, and
**Reset narrow overrides** under **Narrow** removes the part's narrow-only values and leaves the
all-widths ones alone. Either is dimmed when there is nothing to reset.

### Changing it with a CSS snippet

The editor keeps its values to itself; the variable a control shows is the public one a
[CSS snippet](https://help.obsidian.md/snippets) sets to override it. Each is a `--journal-cell-*`
variable, such as `--journal-cell-today-color`, and each has a narrow form ending in `-narrow`. A
snippet that sets one, on `body` or anywhere else, wins over the value chosen in the editor, without
`!important`, and the editor's preview shows it too. Most names follow the part and the control, but
three do not: **Over decorations** is `--journal-cell-<state>-layer`, `1` for over and `-1` for under,
as in `--journal-cell-today-layer`; **Row height** is `--journal-cell-cell-min-height`; and **Week
numbers** are `--journal-cell-week-number-*`. A snippet can also set a highlight's text color,
weight or italic to `unchanged`.

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

![A sidebar view: toolbars, a decorated September calendar, the two notes for the 14th and a list of sprint dates](/assets/views-sidebar-light.png){.light-only}
![A sidebar view: toolbars, a decorated September calendar, the two notes for the 14th and a list of sprint dates](/assets/views-sidebar-dark.png){.dark-only}

### Week numbers after the weekdays

A **Week calendar** block with **Week numbers** **After weekdays**. With the week's note open, its
week number carries the **Active** highlight at the end of the row:

![A week strip from Sunday 13 to Saturday 19 with a highlighted W38 at its right end](/assets/views-week-numbers-light.png){.light-only}
![A week strip from Sunday 13 to Saturday 19 with a highlighted W38 at its right end](/assets/views-week-numbers-dark.png){.dark-only}

:::
