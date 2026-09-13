# Supported code blocks

For easier navigation plugin provides code blocks that can be inserted into note content. Each journal's settings has a **Supported code blocks** link that shows the same list with a live preview of that journal's blocks, and copies a block to your clipboard when you click it.

Each block's container carries a stable CSS class — `journal-nav-code-block`, `journal-timeline-code-block`, `journal-home-code-block` and `journal-notelets-code-block` — that themes and CSS snippets can target. Every block names any option it does not recognize in a notice above the block, and still renders.

````markdown
```journal-nav

```
````

Navigation code block helps navigating relative to current note. Displayed data is configured in journal settings. `calendar-nav` and `interval-nav` are aliases for the same block, kept for older notes; all three behave identically.

Supports following settings:

- `adjacent` - whether the previous and next periods are shown beside the current one. Without it the journal's **Show previous and next periods** setting decides. Set it to `false` for a single period with just its arrows, or to `true` where the journal hides them. It has to be `true` or `false`, not `yes` or `no`.

````markdown
```journal-nav
adjacent: false
```
````

Example look for daily note:

![Daily note nav](/assets/code-blocks-nav-daily-light.png){.light-only}
![Daily note nav](/assets/code-blocks-nav-daily-dark.png){.dark-only}

---

````markdown
```calendar-timeline

```
````

Timeline code blocks helps navigating daily notes in bigger periods (like week, month, quarter or year). By default daily and weekly notes show `week` timeline, monthly note - `month` timeline, quarter note - `quarter` timeline and yearly note - `calendar` timeline. Custom interval notes show a `week` timeline, and a note that belongs to no journal shows the current week. This can be changed using `mode` param.

````markdown
```calendar-timeline
mode: month
```
````

Supports following settings:

- `mode` - which period the timeline shows. Supported values are - `week`, `month`, `quarter`, `calendar`. Without it the journal's own period decides, as above.
- `shelf` - limits the displayed notes to a specific shelf. Without it, the shelf holding the current journal is used.
- `weeks` - where the week-number column appears. Supported values are - `default`, `left`, `right`, `none`. `default` follows the plugin's calendar setting.
- `hiddenWeekdays` - hides the listed days of the week, where `0` is Sunday and `6` is Saturday, e.g. `[0, 6]` to drop weekends.
- `before` - adds this many earlier periods above the current one. Applies to the `week` and `month` modes only.
- `after` - adds this many later periods below the current one. Applies to the `week` and `month` modes only.
- `navigation` - shows previous/next controls, so you can look at other periods without opening or creating a note. Supported values are - `true`, `false`. Without it, the plugin's **Timeline navigation** calendar setting decides.

To see the previous and next week alongside the current one:

````markdown
```calendar-timeline
mode: week
before: 1
after: 1
```
````

To page through periods without leaving the note:

````markdown
```calendar-timeline
mode: week
navigation: true
```
````

The controls step by the timeline's own period — a week in `week` mode, a month in `month` mode, a quarter in `quarter` mode and a year in `calendar` mode. Paging itself never opens or creates a note; a reset control appears once you have moved, and returns the block to the period of the note holding it. The block returns there on its own whenever Obsidian re-renders it.

Where the block shows a single grid — `week` or `month` mode with no `before` or `after` — the controls sit on either side of that grid's own month, quarter and year headings, so the block spends one row instead of two. Those headings are the same links they always were: clicking one opens or creates that period's note, including while you have paged away from the note's own period. Every other shape shows several grid headings and has no single one to join, so it keeps a separate row naming the periods on screen.

Sample week timeline

![Week timeline](/assets/code-blocks-timeline-week-light.png){.light-only}
![Week timeline](/assets/code-blocks-timeline-week-dark.png){.dark-only}

Sample month timeline

![Month timeline](/assets/code-blocks-timeline-month-light.png){.light-only}
![Month timeline](/assets/code-blocks-timeline-month-dark.png){.dark-only}

Quarter and Calendar timeline repeat month timeline for every month in quarter or year.

---

````markdown
```journals-home

```
````

Displays list of links to current notes in journals.
Supports following settings:

- `show` - controls what journals are displayed (by default only the day link is displayed). Supported values are - `day`, `week`, `month`, `quarter`, `year`, `custom`.
- `separator` - used to separate multiple links. Default - a bullet padded with spaces, `" • "`.
- `scale` - allows to increase size of links. Used as multiplier of text size - so to have links twice as big as regular text use `2`. Default - `1`.
- `shelf` - allows to limit journals displayed in block to some specific shelf. Without it, the shelf holding the current note's journal is used.

````markdown
```journals-home
show:
  - day
  - week
  - month
  - quarter
  - year
  - custom
scale: 2
separator: " | "
shelf: work
```
````

````markdown
```journal-notelets

```
````

Lists the [notelets](/notelets) of the period the note holding the block belongs to, grouped by type,
with a button that creates a new one. It reads the host note's own journal and date, so it works in
a period note and in a notelet alike; in a note connected to no journal it says so and lists nothing.

Supports following settings:

- `types` - limits the list to particular notelet types, named as you named them. Without it every
  type of the note's journal is listed.

````markdown
```journal-notelets
types:
  - Meeting
  - Retro
```
````
