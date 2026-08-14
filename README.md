# Journals for Obsidian

A comprehensive journaling solution for [Obsidian](https://obsidian.md/) that transforms your note-taking experience. This plugin helps you create, organize, and navigate structured journal entries across multiple timeframes, from daily notes to custom periods. Whether you're tracking daily work logs, organizing research notes by week, or managing project sprints, Journals provides powerful tools for consistent formatting, easy navigation, and visual organization of your time-based notes.

## Key Features

### Journal Types

- **Standard Intervals**: Daily, weekly, monthly, quarterly, and yearly notes
- **Custom Periods**: Create notes for any custom duration (sprints, financial quarters)
- **Sequential Numbers**: Auto-number entries (Sprint 1, Sprint 2, Quarter 3)
- **Multiple Journals**: Set up different journals for different aspects of your life

### Visual & Navigation

- **Configurable Views**: Build your own views by composing blocks — month calendars, week calendars, custom-interval lists, toolbars, dividers, and rendered markdown templates — and fill each toolbar with items (shelf selector, period buttons, existing-note navigation, buttons, spacers); open each view in the left or right sidebar or as a tab
- **Timeline View**: Navigate through time periods with customizable code blocks
- **Note Decorations**: Visually highlight notes based on contents, dates, or status, vault-wide, per shelf, or per journal
- **Navigation Blocks**: Quick links to related journal entries
- **Date Picker**: Drill down across day, week, month, quarter, year, and decade

### Organization

- **Journal Shelves**: Group related journals together and target commands and views at a whole shelf
- **Custom Commands**: Create shortcuts for your most common journal operations, including opening the next, previous, or nearest existing note, and target them at one journal, a whole shelf, or every journal of one period type
- **Templating**: Powerful variable system for consistent journal entries, with Templater support
- **Frontmatter**: Automatic metadata for better organization
- **Auto-attach**: Notes you create yourself are connected to a journal automatically when their path matches that journal's folder and name template, the date it resolves to falls within that journal's timeline, and no other journal matches the same note

### Integrations & Tooling

- **URI Scheme**: Open (and create, applying templates) journal notes via `obsidian://` links
- **Insert Link to Journal Note**: Command to insert a link to any journal date at the cursor
- **Translated Interface**: The interface follows Obsidian's language setting, with translations for ten languages besides English (Chinese, German, French, Russian, Spanish, Portuguese, Japanese, Korean, Italian, Ukrainian)
- **Theming Hooks**: Stable class names on the plugin's code blocks, so themes and CSS snippets can restyle them
- **Logging**: Capture plugin activity and dump it to a note for troubleshooting

## Installation

Follow the steps below to install plugin.

1. Search for "Journals" in Obsidian's community plugins browser
2. Enable the plugin in your Obsidian settings (find "Journals" under "Community plugins").
3. Check the settings. Configure journals that you need.

## Settings

The Journals plugin offers extensive configuration options to customize your journaling experience. This section covers the main settings you'll encounter.

### Global Settings

- **Shelves**: Organize journals into logical groups (like work, personal, projects). Shelves let you:

  - Scope views to show only journals from a specific shelf
  - Limit decorations in navigation blocks to the current shelf
  - Decorate every journal on the shelf from one place
  - Target commands and views at a whole shelf
  - Manage related journals together

- **Open on startup**: Pick one journal whose current note opens whenever you open the vault. Views carry their own, separate _Open on startup_ toggle.
- **Calendar decorations**: Decorations that apply to every calendar, whatever journals are on screen. See the decoration system below.
- **Week numbers**: Set the global default for where the week-number column appears (before weekdays, after weekdays, or hidden — the default is before); individual view blocks and the `calendar-timeline` code block can override it.
- **Logging**: Set the log level (debug, info, warn, or error — the default is warn) and dump captured activity to a note for troubleshooting.

### Calendar Settings

- **Week configuration**: Follow the locale, or choose a preset that sets both which day starts the week and how the first week of the year is determined — the two together decide week numbers. A custom preset can optionally be applied to Obsidian globally rather than only inside this plugin.
- **Calendar highlighting**:
  - Customize today's date highlight (text and background colors)
  - Customize active note highlight (text and background colors)

### View & Block Settings

A view is a list of blocks. The available blocks are:

- **Month calendar** — one or more month grids around the selected date
- **Week calendar** — one or more week strips around the selected date
- **Custom intervals** — the entries of your custom journals that fall inside a chosen window (current week, month, quarter, or year)
- **Toolbar** — a container for toolbar items: a shelf selector, period buttons, previous/next existing-note buttons, custom buttons, and flexible spacers
- **Divider** — a horizontal rule between blocks
- **Markdown template** — renders a template note inline, with journal variables replaced (see [Supported variables](#supported-variables))

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

### Journal Configuration

Each journal can be configured separately with these settings:

- **Note creation**:

  - Note name template: Set the note filename pattern
  - Folder: Where notes will be stored
  - Default date format: How dates appear when a variable doesn't give its own format
  - Confirm creating new notes: Prompt before creating a note you navigate to
  - Auto-create today's note: Create it on plugin load and at every local midnight

- **Templates**: Select one or more template notes for new note content

- **Timeline**:

  - Start writing on: When this journal begins
  - End writing: When to stop creating notes (never, after a date, or after N repeats)

- **Sequential numbers**: For numbered entries (like "Sprint 1")

  - Enable sequential numbers
  - Anchor date and start number: The note on the anchor date gets the start number, later notes count up from it
  - Reset: Continuous, or resets after N repeats
  - Allow before anchor: Permit numbering earlier notes, which may produce negative numbers. Offered only when the journal has no start date and Reset is Continuous
  - Property name: The frontmatter property the number is stored in

- **Frontmatter**: Customize the properties the plugin writes
  - Date property name
  - Add start date property, with its own property name
  - Add end date property, with its own property name

Every journal row also has a **clone** action. The copy carries the source's whole configuration
under a new name, joins the same shelf, and gets its own copy of the source's commands. Notes are
never copied. The copy starts out with the source's folder and note name template, so the two
resolve to the same note paths until you change one — the colliding journals warning says so until
you do.

### Decoration System

Journals provides a decoration system to visually distinguish notes in calendars and navigation blocks. Decorations live in three scopes:

- **Calendar decorations** on the main settings page apply to every calendar, whatever journals are on screen
- **Shelf decorations** on a shelf apply while that shelf is in view
- **Journal decorations** on a journal apply to that journal's notes

They **layer**: for each property a cell can only have once — background, text color, each border side, each corner — the most specific scope wins, resolved vault-wide first, then shelf, then journal. Shapes and icons never compete; they stack in the nine placement slots.

- **Conditions**: which conditions are offered depends on the scope

  - **Note content** (journal decorations): Title, tag, or frontmatter property. Titles and tags match by contains, starts with, or ends with; properties also offer exists, equals, comparisons, and true/false for checkboxes
  - **Note status** (journal decorations): Has note, has open tasks, all tasks completed
  - **Date and weekday** (calendar and shelf decorations, and daily journals): A specific day, month, and/or year — each of which can be left as "any" — or a set of weekdays
  - **Position** (custom-interval journals): The Nth day of the interval, counted from its start or from its end

- **Styles**: Customize appearance with:

  - Background color
  - Text color
  - Borders (uniform or per-side with custom width, color, style)
  - Shapes (square, circle, or a triangle pointing up, down, left, or right, in nine positions)
  - Corner markers
  - Icons (from Obsidian's icon set)

  Every color can be transparent, a theme color, or a custom color. A transparent color cancels what a less specific scope painted.

- **Combinations**: Use AND logic (all conditions must match) or OR logic (any condition can match)

- **Match badge**: Each decoration in the settings list reports how often it matched recently ("Matched 3 of the last 90 days"), so a rule that never fires is easy to spot

- **Decoration breakdown**: Right-click a decorated cell — in a calendar, a navigation block, or a toolbar's period buttons — and choose _Explain decorations_ to see, property by property, which rule produced each color, border, and mark, and which rules it overrode

- **Inspect a date**: From any decorations section, open _Inspect a date_ to pick a date and a shelf and see everything decorating it across all three scopes

### Custom Commands

The plugin ships a set of commands for opening the current, next, and previous note of each period type. You can create more:

- **Command types**:

  - Current note for the reference date
  - Next/previous entry in the journal
  - Next/previous _existing_ note (skips gaps to the nearest note that exists)
  - Combined navigation: the same date in the next or previous week, month, or year

- **Targets**: Point a command at one journal, at a whole shelf, or at every journal of a given note type. Journal and shelf commands are prefixed with that name in the command palette.

- **Context** — which note's date the command treats as the current date:

  - Today: Always available, uses today
  - Open note's date, or today: Uses the open journal note's date, falling back to today
  - Open note's date only: Runs only while a journal note is open

- **UI integration**:
  - Add to the ribbon with a custom icon
  - Open note: replacing the active note, in a new tab, next to the active note, or in a popout window

### Navigation Blocks

Each journal configures two row lists, both edited the same way:

- **Navigation block**: The rows the `journal-nav` code block renders inside a note of this journal. Each journal type ships a sensible default you can reset to.
- **Calendar interval rows**: The rows a custom-interval journal's entries get in the _Custom intervals_ view block.

Each row is configured with:

- **Row customization**:

  - Template text with variables (see [Supported variables](#supported-variables))
  - Font size, relative to regular text, plus bold and italic
  - Colors (text and background)
  - Link: none, the row's own note, the journal's current note, or the note for the containing day, week, month, quarter, or year
  - Add decorations: apply the matching visual decorations to the row

- **Settings**:
  - Mode: create a new note when a row is clicked, or only open notes that already exist
  - Whole block decoration: decorate the block as a whole from the current journal's rules

## Compatibility with other plugins

- `Daily notes` core plugin - this plugin intends to be a replacement for it. Notes created through Daily notes will not be connected to any journal so it is advised to disable this plugin.
- `Periodic Notes` community plugin - this plugin was initially inspired by Periodic notes that seem to abandoned and aims to be a replacement for it.
- `Calendar` community plugin - this plugin builds its own calendar views out of blocks and aims to be a replacement for it. There is no integration between the two.
- `Templater` community plugin - starting with 1.3.0 plugin supports Templater templates in its settings. Journal plugin variables are replaced first and can be used inside templater commands.

### Templater caveats

There can be cases when Templater starts interfering with plugin actions resulting in partially broken note or journal related data removed from frontmatter.
The best setup to avoid such problems would be:

- template configured in journal plugin settings
- `Trigger Templater on new file creation` is disabled
- OR `Trigger Templater on new file creation` is enabled, `Enable Folder Templates` is enabled, **NO** Folder template is configured

This ensures that only journal plugin is processing note template thus avoiding conflicts with templater plugin (journal plugin will use templater itself under the hood to process templater commands).

## Supported variables

These variables can be used in the note name template, the folder path, and the content of a template note. Each journal's settings has a **Supported variables** link that opens the same list for that journal, with its own date format and numbering variables filled in.

- `{{journal_name}}` - name of journal note belongs to
- `{{date}}` - date used as reference to specific period, formatted using date format from settings. In most cases it is the first day of the month, quarter, year or custom interval. The exception is week notes, where `{{date}}` renders the week's representative day rather than its first day — the day whose calendar year is the week's own year, which is the Thursday under the ISO-8601 week configuration. This is what makes `{{date:YYYY}}` resolve to the right year on a week straddling January 1, whichever week configuration you use. Format can be overridden using following syntax `{{date:format}}` where format is string using [Moment.js format rules](https://momentjs.com/docs/#/displaying/format/) (like `{{date:YYYY-MM-DD}}`).
- `{{start_date}}` - first day of week, month, quarter, year or interval depending on note type, formatting rules are the same as in `{{date}}`, as well as the calculations
- `{{end_date}}` - last day of week, month, quarter, year or interval depending on note type, formatting rules are the same as in `{{date}}`, as well as the calculations
- `{{index}}` - the journal's numbering variable, which is named `index` by default. A journal can define several numbering variables under its own names, each with its own frontmatter property; the name you give it there is the name you use here. Numbering is on by default for custom-interval journals and can be enabled for any journal type.
- `{{note_name}}` / `{{title}}` - the rendered note name. Available in the folder path and in template content, but not in the note name template itself, since the name has to render first.
- `{{current_date}}` - the date the note is rendered on (not the reference period), formatted with `{{current_date:format}}`
- `{{current_time}}` / `{{time}}` - the clock time at render, formatted with `{{time:HH:mm}}`
- `{{relative_date}}` - "Yesterday", "Today", "Last Tuesday", "This month", "3 weeks ago", and so on. Available in navigation block rows.
- `{{journal_link(journal_name)}}` - inside a template note's content, and in the markdown template view block, resolves to the vault path of the corresponding note in another journal. Wrap it in a link or embed yourself, for example `[[{{journal_link(daily)}}]]`.

### Date modifications

Any date or time variable, and `journal_link`, can be shifted before it is formatted:

- `{{date+5d:format}}` adds 5 days. The units are `y` (years), `q` (quarters), `m` (months), `w` (weeks), `d` (days) and `h` (hours), with `+` or `-`, for example `{{date-1w}}` or `{{journal_link(daily)+1d}}`.
- `{{date<startOf=week>}}` and `{{date<endOf=month>}}` snap to a boundary. The units are `decade`, `year`, `quarter`, `month`, `week`, `day` and `hour`.
- Modifications can be combined and go before the `:format`, for example `{{date+1w<startOf=week>:MMM DD, YYYY}}`. Shifts always apply first, then boundaries, then the format override, whatever order you write them in.
- Date variables have day precision, so `h` and `<startOf=hour>` change nothing on them; they only move `{{time}}` and `{{current_time}}`. Conversely, `<startOf=decade>` applies to dates only.

The same list is available in the app: any **additional modifications** link in a journal's settings opens it.

## Supported code blocks

For easier navigation plugin provides code blocks that can be inserted into note content. Each journal's settings has a **Supported code blocks** link that shows the same list with a live preview of that journal's blocks, and copies a block to your clipboard when you click it.

Each block's container carries a stable CSS class — `journal-nav-code-block`, `journal-timeline-code-block` and `journal-home-code-block` — that themes and CSS snippets can target. `calendar-timeline` and `journals-home` name any option they do not recognize in a notice above the block, and still render.

````markdown
```journal-nav

```
````

Navigation code block helps navigating relative to current note. Displayed data is configured in journal settings. `calendar-nav` and `interval-nav` are aliases for the same block, kept for older notes; all three behave identically.

Example look for daily note:

![Daily note nav](assets/daily-nav.png)

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

Sample week timeline

![Week timeline](assets/week-timeline.png)

Sample month timeline

![Month timeline](assets/month-timeline.png)

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

## Advanced Usage

### Using Shelves

Shelves are a powerful way to organize journals into logical groups. Here's how to use them effectively:

1. **Create shelves** for different areas of your life, under _Journal shelves_ in the settings:

   - Work (meetings, projects, weekly reports)
   - Personal (diary, habit tracking, health)
   - Education (courses, research, study notes)

2. **Assign journals to shelves** when creating or editing a journal.

3. **Scope a view** to a shelf with its _Default shelf_ setting, and add a shelf selector to the view's toolbar to switch between them.

4. **Decorate a whole shelf** at once, instead of repeating the same rule on every journal.

5. **Target commands** at a shelf so one hotkey covers every journal on it.

6. **Use the shelf option** in the `journals-home` and `calendar-timeline` code blocks to create dashboard notes for specific contexts.

### Common Setup Examples

#### Daily Work Journal

```yaml
Type: Day
Folder: Work/DailyNotes
Name Template: {{date}} Daily Log
Date Format: YYYY-MM-DD
Auto-create: Enabled
Start date: Your employment start date
```

#### Project Sprints

```yaml
Type: Custom
Every: Week
Duration: 2
Folder: Projects/{{journal_name}}/Sprints
Name Template: Sprint {{index}}
Sequential numbers: Enabled, Reset: Continuous
```

#### Academic Term Notes

```yaml
Type: Week
Folder: Education/{{date:YYYY}}/{{date:MMMM}}
Name Template: Week {{index}} - {{start_date:MMM D}} to {{end_date:MMM D}}
Sequential numbers: Enabled, anchored on the term start date
Start writing on: Term start date
End writing: After date (term end date)
```

## Troubleshooting

### Common Issues

#### Notes are created in the wrong location

- Check your folder path in journal settings
- Verify your note name template doesn't contain illegal characters
- Make sure the folder exists in your vault

#### Template variables aren't working

- Verify syntax: use double braces `{{variable}}`
- For date formatting, use Moment.js syntax (e.g., `{{date:YYYY-MM-DD}}`)
- Check for spaces or typos in variable names

#### Calendar view isn't showing notes

- Ensure notes have proper frontmatter (journal name and date)
- Check if you're filtering by shelf and the journal is assigned to that shelf
- Verify the date format in your journal settings matches your note dates

#### Conflicts with Templater

- Follow the Templater setup in the compatibility section
- Ensure Templater isn't configured to auto-process the same templates
- The recommended setup is to let the Journal plugin handle the template processing

#### Missing decorations

- Verify your condition criteria (tags, properties, dates)
- Check if you're using AND logic when OR might be more appropriate
- Ensure the decoration style settings are properly configured
- Check the decoration's match badge in settings — a rule that reports it matched nothing recently is not firing
- Right-click the cell and choose **Explain decorations** to see which rule won each color, border, and mark, and which rules it overrode

### What to do if you encounter bugs

1. Check the console for error messages (Ctrl+Shift+I on Windows/Linux, Cmd+Option+I on macOS)
2. Verify you're using the latest version of the plugin
3. Try with a minimal configuration to isolate the issue
4. Raise the log level in the plugin's settings, under **Logging**, and dump the recent
   log messages to a note — it often captures more than the console alone
5. Open an [issue](https://github.com/srg-kostyrko/obsidian-journal/issues/new/choose) and
   pick the bug report form; it asks for steps to reproduce, plugin and Obsidian version,
   console output, and your journal configuration

## Glossary

**Frontmatter**: Metadata at the top of your note, surrounded by `---` lines. The Journal plugin uses frontmatter to store journal name, dates, and other information.

**Decoration**: Visual indicators that mark or highlight specific days in the calendar view based on conditions you set. They can include colors, shapes, icons, or borders. A decoration belongs to one of three scopes: the whole vault, a shelf, or a journal.

**Journal Shelf**: A grouping mechanism to organize multiple journals together (like "Work" or "Personal"). Helps you filter and focus on specific journal contexts.

**View**: A panel you assemble from blocks — calendars, toolbars, dividers, rendered templates — and open in a sidebar or as a tab.

**Navigation Block**: A special code block that generates navigation links between journal entries, customized to each journal type.

**Timeline**: A calendar-like view that displays days of a specific period (week, month, etc.) with links to corresponding journal entries.

**Sequential number**: A number assigned to journal entries (like Sprint 1, Sprint 2). Useful for tracking iterations or repeating periods. It is exposed as a template variable, named `index` by default.

**Template Variables**: Special placeholders like `{{date}}` or `{{index}}` that the plugin replaces with actual values when creating notes.

## Contributing

Contributions via bug reports, bug fixes, documentation, and general improvements are always welcome. For more major feature work, open an issue about the idea first so we can judge feasibility and how best to implement it.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, the checks a change needs to pass, and how to open a pull request.
