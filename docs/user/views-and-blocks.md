# Views and blocks

A view is a list of blocks. The available blocks are:

- **Month calendar** — one or more month grids around the selected date
- **Week calendar** — one or more week strips around the selected date
- **Notes by date** — lists all vault notes created during the selected day, week, month, quarter, year, or decade, with configurable sorting, heading, and period navigation
- **Custom intervals** — the entries of your custom journals that fall inside a chosen window around the selected date (its day, week, month, quarter, or year)
- **Notelets** — the notelets of the note you are reading, or of a window around the view's date, grouped by journal and type
- **Toolbar** — a container for toolbar items: a shelf selector, period buttons, previous/next existing-note buttons, custom buttons, and flexible spacers
- **Divider** — a horizontal rule between blocks
- **Markdown template** — renders a template note inline, with journal variables replaced (see [Supported variables](/reference/variables))

Each view has:

- **Open in**: Left sidebar, right sidebar, or a new tab
- **Icon** and **Show in ribbon**: Give the view an icon and a ribbon button that opens it
- **Default shelf**: The shelf the view starts on when it opens
- **Open on startup**: Automatically open the view when Obsidian launches
- **Remember last viewed date**: Reopen on the date you last looked at instead of on today
- **Follow active note**: Move the view to the date of the journal note you open

Calendar blocks add:

- **Months / weeks before and after**: How many extra grids to show around the selected one
- **Week numbers**: Use the global default, or force before weekdays, after weekdays, or hidden
- **Days of the week**: Hide specific weekdays (e.g., weekends) from the grid
- **Show month/year heading**: Show or hide the heading above the grid

In a view's calendar grid, use the arrow keys to move between cells; Home and End move to the first and last cell in the current row. Enter and Space perform the cell's normal open or create action where one is available. Holding Shift selects instead: Shift+click a day, or Shift+Enter or Shift+Space on a focused one, sets the view's date without opening or creating a journal note. Only day cells select — the week number and the month, quarter and year headings keep their ordinary open action, and a `calendar-timeline` code block in a note has no view date to set, so Shift there opens as usual. The selected date drives blocks that read the view's date, including **Notes by date**, and the grid keeps its current layout when you select a date it is already showing.

## Navigation blocks

Each journal configures two line lists, both edited the same way:

- **Navigation block**: The lines the `journal-nav` code block renders inside a note of this journal. Each journal type ships a sensible default you can reset to.
- **Calendar interval lines**: The lines a custom-interval journal's entries get in the _Custom intervals_ view block.

A **line** is one or more **segments** placed side by side. A line starts as a
single segment; splitting it off into its own line (or joining two segments back
into one, or dragging a segment onto another line) is done from the settings
preview, not through a separate control. Each segment has its own:

- Template text with variables (see [Supported variables](/reference/variables))
- Font size, relative to regular text, plus bold and italic
- Colors (text and background)
- Link: none, the segment's own note, another journal's current note, or the note for the containing day, week, month, quarter, or year
- **Link date**: shift the date the link opens, using the same syntax as template date variables — see [Date modifications](/reference/variables#date-modifications) — for example `+1q` to open next quarter's note instead of this quarter's, or `<startOf=month>` to always land on the first day of the month. Leave it empty to open the date the link would open anyway.
- Add decorations: apply the matching visual decorations to the segment. A decorated segment shows the decorations of the note its link opens, not the host note's — a segment linking to the year journal decorates from the year's own rules, not the day's.

The `nav-row` CSS class on each segment is a stable styling hook, kept for user
CSS snippets and existing selectors even though the segment vocabulary above
replaced "row".

**Settings**:

- Previous and next arrows: step to the adjacent period, creating that note if it's missing, or jump to the nearest period that already has a note, skipping the gaps and never creating. Clicking a segment always creates its note either way
- Show previous and next periods: with it off, the block draws only the current period and its previous/next arrows, which still open those notes. A single note can override this either way with the block's `adjacent` option.
- Whole block decoration: decorate the block as a whole from the current journal's rules
