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
- **Show month/year heading** and **Show weekday header** — **Use global default**, **Shown** or
  **Hidden**. **Use global default** follows [Calendar appearance](#calendar-appearance), so changing the
  global choice there changes every block left on it.
- **Days outside the month** (Month calendar only) — **Use global default**, **Interactive**, **Inert**
  or **Hidden**: the neighboring months' days that fill a grid's first and last weeks are clickable and
  decorated, shown but inert, or left blank. An inert day shows its date and nothing else: no
  decorations, no response to a click, no selecting with **Shift**+click, and the keyboard skips it.
- **Rows** (Month calendar only) — **Use global default**, **As needed** or **Always six**.

A hidden weekday header stays available to screen readers, so the columns keep their names. A hidden
heading is removed, since its cells have their own names. A block cannot pick **Automatic** for outside
days itself; **Use global default** with the global **Automatic** is that.

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
sidebar, say. Changes made under **Wide** apply at every width, except for the few values
[narrow calendars](#narrow-calendars) keep a default of their own for. Changes made under **Narrow** apply
only to narrow calendars, and take the place of the all-widths value there.

Below the switch is the preview: a sample month around today, drawn at the width you are editing —
**Narrow** at the size of a slim sidebar calendar, **Wide** across the whole panel. It shows today, a
day whose note is open, a selected date and days from the months either side, each state on a day of
its own, so an edit to one is never hidden by another. The selected date also carries a decoration,
which shows how a part set to draw over decorations looks. The wide preview never gets narrow enough
to count as a narrow calendar, so on a very narrow settings pane it scrolls sideways instead.

Click a part of the preview to edit it; a day, a week number or a heading can also be reached with Tab
and picked with Enter or Space. Where a click lands on more than one part, one is edited and **Also
here**, under the preview, lists the others so you can switch to the one you meant. On a day, its
state comes first: today's date edits **Today**, the open note's day **Open note**, and the selected
date **Selected date**, each with **Date number** and **Cells** under **Also here**. On the month name
or a week number, that label comes first; the current week's number lists **Current week** under **Also
here**. A click on the divider beside the week numbers edits **Week numbers**.
**Editing** lists every part too, so you can pick one without the preview:

- **Month heading** — the month and year above the grid.
- **Weekday header** — the row of weekday names.
- **Week numbers** — the week numbers and the divider between them and the days.
- **Month grid** — how many rows a month takes. It has no look of its own to edit, so it is reached from
  **Editing**, or as the last part under **Also here** after a click inside the grid.
- **Date number** — the day's number in each cell.
- **Today**, **Selected date** (the view's selected date), **Open note** (the note open in the
  editor) and **Days outside the month** — the four highlights.
- **Current week** and **Weekends** — two more highlights, drawn as
  [bands](#weekends-and-the-current-week) across the grid.
- **Cells** — the size and spacing of every cell.

An outline in the preview marks the part you are editing: every day a highlight applies to, the
weekday names, the week numbers, the heading, or for **Month grid** the whole grid. **Date number**
and **Cells** belong to every day, so they outline the day you clicked when you picked them there, by
the click itself or from **Also here**, and every day when you chose them from **Editing**. A part that marks a single place, such as
today, gets a bold dashed outline; a part spread over many, such as every day or the week numbers,
gets a faint dotted one on each.

A part you have changed carries a dot in **Editing** and in **Also here**. When you edit
**Narrow**, the dot means the part has a narrow-only value. Under **Wide**, the dot on **Week
numbers** also reflects **Default week numbers** on the main settings page, since that is the same
value.

### What each part offers

The controls are headed by the part's name and the width they apply to, **All widths** or
**Narrow**, and depend on the part. They are grouped in sections by kind (**Visibility**, **Label**, **Text**, **Divider**, **Highlight** or
**Box**), each open to start with and folded away by clicking its name. Every one but a highlight's **Style** shows, beneath its name, the
CSS variable a [CSS snippet](#changing-it-with-a-css-snippet) sets to override it; while you edit
**Narrow**, the name shown is the narrow one, ending in `-narrow`.

The highlights share one set:

- **Style** — **Text only**, **Ring**, **Background** or **None**. Out of the box, today is
  text only, the selected date a ring (a background on [narrow calendars](#narrow-calendars)), the open
  note a background, and days outside the month text only. **None** turns the highlight off.
- **Highlight color** — the ring's or the background's color. Shown for **Ring** and **Background**.
- **Ring width** — 1 to 4 pixels. Shown for **Ring**.
- **Strength** — how strongly the background color fills the day, from 5% to 100%. Shown for
  **Background**.
- **Text color**, **Text weight** and **Text italic** — the day's text while this highlight applies.
  Not shown for **None**.
- **Over decorations** — whether the ring or background, and this highlight's text, are drawn over a
  day's [decorations](/decorations) or under them. Shown for **Ring** and **Background**; out of the
  box, only the selected date's ring, or its tint on narrow calendars, is drawn over.

**Today** marks today's day alone. The week number and the month, quarter and year headings that hold
today look like any other; the current week's number is marked by [**Current
week**](#weekends-and-the-current-week) instead.

The text parts — **Month heading**, **Weekday header**, **Week numbers** and **Date number** — offer
**Size**, **Weight**, **Italic**, **Color** and **Case** (**As written**, **Uppercase**,
**Lowercase** or **Title case**). **Weight**, **Italic**, **Color** and **Case** also offer
**Default**, which leaves the value to the calendar's stock style. **Default** names what that
style comes to under your theme, such as **Default (Normal)** for the week numbers' weight, and a
**Default** color shows a swatch of it; where the editor cannot tell, it reads plain **Default**.
While you edit **Narrow**, a
narrow-only value goes back to the all-widths one through its
[**Narrow only**](#narrow-only-values-and-resetting) tag instead.

Out of the box the week numbers are smaller than the dates, in normal weight and the theme's muted
color, and their column is as wide as a day's. **Week numbers** also has a **Divider** section, after
**Text**, for the line between the week numbers and the days: **Divider** (**Shown** or **Hidden**), and,
while it is shown, its **Color** and its **Width**, 1 to 4 pixels. It is shown out of the box, one pixel
in the theme's border color. It runs from the first row of weeks to the bottom of the grid, in the gap
beside the week numbers, so a filled week number, such as an open weekly note, never covers it; with
week numbers after the weekdays it moves with them.

**Cells** offers **Padding**, **Corner radius**, **Gap between cells** and **Row height**, the
smallest height a row of cells takes. Out of the box the row height is **Default (grows with width)**:
rows grow with the calendar's width, from 26 pixels up to 64, and the slider sits on the height the
preview's rows have now. Once you move it, a button beside it puts **Default** back. Dates are drawn a
little larger than the surrounding text on wide calendars. The decoration editor's style canvas draws
its sample cell at the all-widths row height, or at 26 pixels while that is **Default**, so a style is
previewed at a size a calendar shows it; a narrow-only row height does not change the canvas.

### Weekends and the current week {#weekends-and-the-current-week}

**Current week** and **Weekends** have the same controls as the other highlights, but they color a stretch
of the grid, not a single day. Out of the box **Weekends** is **None**, so nothing changes until you style
it, and **Current week** is **Text only**, which draws no band and leaves the days alone but shows the
current week's number in the accent color and bold.

- **Weekends** draws one band down each run of adjacent weekend columns, from the weekday header to the
  last row, gaps between cells included. Which days are the weekend is the **Weekend days** setting in the
  Calendar block of the main settings page — see [Weeks](/periods#weeks). The editor shows the current
  weekend days and a button, **Change in calendar settings**, that takes you back there. Weekend days that
  are not next to each other each get a band: in a week that starts on Sunday, a Saturday and Sunday weekend
  gives one band at each edge of the grid. When a Month calendar or Week calendar block hides days with **Days of the week**, or a
  [timeline](/reference/code-blocks) with `hiddenWeekdays`, runs are counted over the columns that remain, so in a week that starts on Monday, with Saturday hidden, a Friday,
  Saturday and Sunday weekend is one band over Friday and Sunday. Hiding every weekend day leaves no band. The weekday names of a weekend column
  take the band's text color, weight and italic, but not its fill.
- **Current week** draws one band across the row that holds today, the week number included. It styles the
  week number apart from its days: **Text color**, **Text weight** and **Text italic** apply to the days, and
  **Week number text color**, **Week number weight** and **Week number italic** to the week number. Choosing
  **None** turns both off, so the current week's number goes back to looking like the others.
  In a grid that hides the days outside the month, any row of today's week that shows at least one day gets
  the band, so a week split across two months of a timeline is marked in both; a row of hidden days alone
  gets none. A Week calendar block, which shows a single week, never draws one, and its days take none of the
  current week's text, but its week number still takes the week number's text while the week shown holds
  today. A timeline that shows a single week draws the band.

A day that is several things at once takes its text from the order the [**Unchanged**](#unchanged)
section lists. Like the other highlights, a band is drawn under the days by default, behind everything in them; with **Over decorations** on it is
drawn above the whole day, so a background there also tints the day's number and its marks, not just the
decorations, and a weekend band also tints the weekday name at the head of its column.
When both bands are under the days, or both over, the weekend band sits below the current-week band, so a day
in both shows the current week's fill on top. A band drawn over the days sits above any band drawn under them.

### Visibility

Some parts open with a **Visibility** section. Its choices decide what the calendar shows, not how it
looks, so they apply at all widths: they carry an **All widths** note under both widths, and
**Reset to default** under **Wide** puts them back along with the part's values. They show no CSS
variable.

- **Month heading** — **Heading**: **Shown** or **Hidden**.
- **Weekday header** — **Weekday header**: **Shown** or **Hidden**.
- **Week numbers** — **Placement**: **Before weekdays**, **After weekdays** or **Hidden**. It is the same
  value as **Default week numbers** on the main settings page, edited from two places.
- **Days outside the month** — **Automatic**, **Interactive**, **Inert** or **Hidden**.
- **Month grid** — **Rows**: **As needed** or **Always six**. A month then takes as many weeks as it
  spans, or always six, with the extra rows filled by the neighboring months' days. The extra days follow
  **Days outside the month**: clickable and decorated when **Interactive**, shown but inert when
  **Inert**, blank when **Hidden**.

**Automatic** gives each calendar the behavior it has had: a Month calendar block that shows one month
has interactive outside days; one that shows several months hides them; a timeline in `month` mode has
interactive ones; a timeline in `quarter` or `calendar` mode hides them. **Inert** days show their
date in the outside-days style and nothing else: they carry no decorations, do nothing when clicked,
cannot be selected with **Shift**+click, and the keyboard skips them. Out of the box nothing changes.

A Month calendar or Week calendar block and a
[timeline](/reference/code-blocks) can override these per block.

### Label

Four text parts have a **Label** section that sets the
[moment format](https://momentjs.com/docs/#/displaying/format/) of what they show. On the **Month heading**, the
**Weekday header** and **Week numbers** it comes after **Visibility**; the **Date number** has no **Visibility**
section, so its **Label** section comes first.

- **Month heading** — **Month format**, **Quarter format** and **Year format**, each for its own cell in the
  heading of every month and week grid. The quarter cell shows only when that grid shows it.
- **Weekday header** — **Format**, for the weekday names.
- **Week numbers** — **Format**, for the week numbers.
- **Date number** — **Format**, for the number in each day.

Each format is a text box. An empty box means the default, which the box shows as its placeholder. Beside
the box, **Suggestions** is a list of ready-made patterns, each shown as the pattern and a sample of today,
such as `MMM — Nov`; choosing one fills the box. Under the setting's name, **Preview:** shows today formatted
with what is in the box, and a link opens the **moment.js format reference**. Under **Wide**, typing a
format's default pattern, or choosing it from the suggestions, stores an empty box, so the part still counts
as unchanged.

The weekday's suggestions include **One letter**, which shows the locale's narrow weekday, such as
`M` for Monday in English. It is a choice, not a pattern: the box stays empty, and no typed text can
mean it.

The weekday is the only label with a value of its own at narrow width, and out of the box narrow
calendars show **One letter**. Under **Narrow**, its box and suggestions edit the format used by narrow
calendars: typing a pattern, even the default `ddd`, or choosing a suggestion sets a format for narrow
calendars alone, and clearing the box goes back to one letter. **Same as wide** in the list copies the
format chosen under **Wide** to narrow calendars; a later change under **Wide** does not follow it. Under
**Wide**, while narrow calendars still show their one letter, the weekday's name carries a
[**Narrow has its own value**](#narrow-only-values-and-resetting) tag. The other formats have a single
value and carry an **All widths** note under both widths.

The week numbers' **Format** warns when it contains an ISO week token outside square brackets, such as `W`
or `WW`, and the week grid is not ISO, because those count ISO weeks, which can differ from the weeks the
calendar's rows show. The suggestions leave them out; `w` and `ww` follow the grid.

A format applies wherever a calendar draws that period, in views, in
[timelines](/reference/code-blocks) and in their headings. It changes only the text on screen: a screen
reader still reads each cell's full name — the full date for a day, the week number with its year, the
month or quarter with its year — and the full weekday name for a weekday. A day label too long for its
cell is cut with an ellipsis rather than widening the grid. Formats are set here only; a block cannot
override them.

### Unchanged

A highlight's **Text color**, **Text weight** and **Text italic** can be **Unchanged**: this highlight
leaves that part of the text alone. A day that is several things at once then shows the next
highlight's value instead, in this order — the open note, the selected date, today, the current week,
the weekend, then days outside the month — and, when none of them sets one, the part's own, such as the date number's. Out of the
box, every highlight's weight and italic are **Unchanged**, as are the text colors of the selected date,
the weekends and the current week's days, so the ring changes nothing about the number inside it. The
current week's number is the exception: its color is the accent and its weight bold.

**Unchanged** needs a WebView that supports CSS container style queries: Obsidian on desktop, iOS 18
or later, or Android with WebView 111 or later. On older ones, an **Unchanged** text shows the
part's own color and weight, never a lower highlight's, so a selected day that is also today shows
the plain number color rather than today's accent.

### Narrow calendars {#narrow-calendars}

A narrow calendar is drawn tighter than a wide one, and out of the box it differs in five ways:

- rows are 26 pixels high, rather than growing with the width;
- dates are the size of the surrounding text, a little smaller than on a wide calendar;
- the gap between cells is one pixel;
- weekday names are one letter, such as `M` for Monday;
- the selected date is a 20% tint of the accent color, drawn over decorations, rather than a ring.

Opening a note selects its date too, so on the open note's own day the tint draws over the open note's
fill and shades it toward the accent color. On a decorated day the open note's fill sits under the
decoration, and the tint is what still shows the day is selected. On a wide calendar the selected date's
ring shows around the open note's fill instead.

These narrow defaults win over a value set under **Wide**: a date size chosen under **Wide**, say, does
not reach narrow calendars, which keep their own. Under **Wide**, each control this applies to — the
selected date's **Style** and **Strength**, the date number's **Size**, and the cells' **Gap between
cells** and **Row height** — and the weekday's format carry a **Narrow has its own value** tag, with
**Use at narrow too** beside it to copy the wide value to narrow calendars as a narrow-only value. A
**Row height** left at **Default** has nothing to copy, so it shows the tag alone.

A [timeline](/reference/code-blocks) in `calendar` or `quarter` mode draws each month at about a third
of the note's width, so in all but a very wide note its months are narrow calendars and look this way.

### Narrow-only values and resetting

While you edit **Narrow**, a control that has a narrow-only value carries a **Narrow only** tag next
to its name. Click the tag to remove that value, so narrow calendars go back to their own default where
they have [one](#narrow-calendars), and take the all-widths value everywhere else.

The button beside the part's name, above its controls, resets that part for the width you are editing:
**Reset to default** under **Wide** puts the part's all-widths values back to their defaults, and
**Reset narrow overrides** under **Narrow** removes the part's narrow-only values and leaves the
all-widths ones alone, so narrow calendars go back to their own defaults. Under **Narrow**, the
**Weekday header** also clears its narrow weekday format, so narrow calendars show one letter again. Under **Wide**, **Reset to default** also puts the part's formats back to their
defaults. Either is dimmed when there is nothing to reset.

### Changing it with a CSS snippet

The editor keeps its values to itself; the variable a control shows is the public one a
[CSS snippet](https://help.obsidian.md/snippets) sets to override it. Each is a `--journal-cell-*`
variable, such as `--journal-cell-today-color`, and each has a narrow form ending in `-narrow`. A
snippet that sets one, on `body` or anywhere else, wins over the value chosen in the editor, without
`!important`, and the editor's preview shows it too. Most names follow the part and the control, but
three do not: **Over decorations** is `--journal-cell-<state>-layer`, `1` for over and `-1` for under,
as in `--journal-cell-today-layer`; **Row height** is `--journal-cell-cell-min-height`; and **Week
numbers** are `--journal-cell-week-number-*`, the divider included, which a width of `0px` hides. A
snippet can also set a highlight's text color, weight or italic to `unchanged`.

Five values have a default of their own on [narrow calendars](#narrow-calendars), so their wide names do
not reach them: `--journal-cell-date-size`, `--journal-cell-cell-gap`, `--journal-cell-cell-min-height`,
`--journal-cell-selected-ring-width` and `--journal-cell-selected-strength`. To change one there, set its
`-narrow` name as well.

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
