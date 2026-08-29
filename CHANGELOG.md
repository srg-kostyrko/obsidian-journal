# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Features

- A journal can now ask questions when it creates a note, and put your answers into the note's properties, its template content, and its name. Configure them under **Questions** on the journal: each question has a type — text, number, date, yes/no, or a choice from a list you define — and can be saved to a property of your choosing. Use an answer anywhere you use a journal variable, as `{{your_variable}}`; a date answer takes formats and shifts like `{{date}}` does, using the format you set on the question. A question whose answer appears in the note's name or folder must be saved to a property and cannot be left blank, since a name has to be settled before the note exists. Clicking a link to a note that does not exist yet asks the questions first, then names the note from your answers — cancelling leaves you where you started. Automatic paths never ask: auto-create refuses rather than guess, notes arriving by sync already carry their answers, and adding an existing note to a journal by **Connect note to a journal** or **Bulk add** keeps that note's own name rather than renaming it to a name nobody has answered for. A choice question saved to a property is also what lets a calendar decoration colour a day by the answer you gave it.
- A new **Notes by date** view block lists every vault note created in the period containing the view's selected date. Choose the period from day through decade, sort by name, creation date, or last modification, and configure which Frontmatter property records creation dates. The block can optionally show previous and next controls that follow its chosen period. Calendar blocks now let you select their date by Shift-clicking a day, or pressing Shift+Enter or Shift+Space on a focused one, without opening or creating a journal note; their calendar grids support arrow-key navigation, and view toolbar buttons can step the selected date one day at a time.

### Bug Fixes

- Renaming a journal note now updates the links pointing at it. Renaming through **Connect note to a journal** or **Bulk add** moved the file and left every link to its old name dangling. Obsidian asks once per vault whether to update links when it first happens; answering **Always update** settles it for good.
- A calendar view left open across midnight now moves on to the new day. It kept marking yesterday as today until Obsidian was restarted.
- The **Open shelf** command now says so when there is no view open to show the shelf in, instead of doing nothing.
- Journals created in the same session no longer share one navigation block, interval block, and set of decorations. Editing the navigation block of one daily journal used to change every daily journal created alongside it in that session, and a journal created after such an edit was born carrying it; restarting Obsidian separated them again, so journals created in different sessions were never affected. A journal already changed this way keeps the settings it ended up with — check the navigation blocks and decorations of journals you created together, and set them back by hand where they are wrong.
- A fresh install no longer logs a repair warning at startup for settings it has never saved. Having no stored value yet was being treated the same as a corrupted one, so a brand-new install's log read as if its settings were already damaged.
- Auto-create no longer stops for the rest of the session when a journal template waits for input. A template that opens a prompt — Templater's `tp.system.prompt` or `tp.system.suggester`, for instance — never finishes on its own at midnight, when nobody is there to answer it, and that silently took auto-create down until Obsidian was restarted; journals listed after the waiting one never got their notes at all. The midnight check is now scheduled before the notes are written rather than after, and each journal gets a bounded wait before the rest are attended to. A prompt you answer later still writes its note.
- `{{journal_link}}` and the **Insert journal link** command now link to the note the journal actually has, instead of to the path its folder and name template would produce. A journal note that lives somewhere else — connected in place keeping its own name, or renamed or moved after it was connected — used to get an unresolved link pointing at a file that was never there. `{{journal_link}}` also no longer refuses a note whose period has fallen outside the journal's timeline: a journal only writes within its timeline, but a note it has already written stays linkable. A period with no note yet still links to where its note will be created, so linking ahead to a note you have not written continues to work.
- Decorations set on one custom journal no longer show up on another custom journal's rows in the calendar view's list of intervals. Two custom journals whose intervals start on the same date shared one set of decorations there, so a journal you had left undecorated drew whatever the other one drew. Each journal's rows now draw on that journal's own decorations only.

## [3.2.0] - 2026-08-23

### Features

- A `calendar-timeline` code block can now carry previous/next controls, so you can look at other periods from the note you are reading without opening or creating anything. Add `navigation: true` to a block, or turn on **Timeline navigation** in the calendar settings to give every block the controls at once — a block's own option wins over the setting either way. The controls step by the block's own period (a week in `week` mode, a month in `month` mode, and so on) and name the periods on screen; a reset control appears once you have paged away and returns the block to the period of the note holding it, as does anything that makes Obsidian re-render the block.
- Other plugins can now integrate with Journals through a documented API. Install [`obsidian-journals-api`](https://www.npmjs.com/package/obsidian-journals-api) for the typed surface and a `getJournalsApi(app)` locator that returns nothing when Journals is not installed or not enabled. It covers listing journals, finding the note for a date, creating and opening one, and subscribing to journal and note changes. Because a vault can hold several journals of the same kind, reads return every match and writes ask which one to use — the same picker you see clicking a calendar cell. See [`docs/plugin-api.md`](docs/plugin-api.md).
- A decoration can now match on a journal note's size: word or character count against a threshold, using `>`, `>=`, `<`, or `<=`. The count uses the same definition as Obsidian's own word count — frontmatter is not counted, everything else is, including code blocks and comments — so it matches the number Obsidian shows in its status bar.
- A new `{{week_of_month}}` template variable numbers a note's week within its month, counting the week that holds the 1st as week 1 and following the start of the week from the calendar settings, so it agrees with the week numbers the calendar shows. Because a week can straddle two months, the month it counts within is the month of the date it is read from: `{{week_of_month}}` counts within the note's own month, while `{{week_of_month<endOf=week>}}` counts within the month the week ends in, moving a whole straddling week into the later month — pair it with `{{date<endOf=week>:MMMM}}` so the month and the number agree. It takes the same offsets and ordinal format as a numbering variable (`{{week_of_month-1}}`, `{{week_of_month:o}}`), and a note name built from it is still recognized as the journal's own.
- Decorations can now carry more than one condition of the same type. Property, tag, title, date, offset, and note-size conditions can repeat; weekday, has note, has open tasks, and all tasks completed still cannot, since a second instance of those says nothing the first does not. This is what lets a single decoration express a band, like note size >= 250 and < 1000.

### Bug Fixes

- A note whose name carries a date too coarse to tell the journal's periods apart — a year in front of sequential numbers, say — is now matched to its period by the whole name rather than by the date alone. Previously every note of the year attached to whichever period contained January 1st: a journal named `{{date:YYYY}}-C{{cycle}}-S{{sprint}}` collapsed its whole year onto one interval, and a monthly journal named `{{date:YYYY}}-M{{month}}` put all twelve months on January. Notes arriving from sync, added in bulk, or repaired by the vault check all landed on the wrong period. The date and the numbers now identify the period together, so numbering that repeats — twelve months, four quarters — is enough as long as the date says which year it repeats in.
- The months of a `calendar-timeline` block in `quarter` or `calendar` mode now line up with each other. Each month used to reserve room for decorations from its own cells alone, so a month holding decorated notes got visibly wider cells than the months beside it and squeezed them out of shape; every month in a block now reserves the same room. Where the months no longer fit side by side, the block wraps them onto another row instead of cutting the last one off at the edge of the note.
- The calendar now moves its highlight of today when the date changes, instead of holding it on the day Obsidian opened. A calendar left open across midnight kept marking the previous day until a restart, and the same stale date reached the home block's links, the relative dates in navigation blocks ("Today", "Yesterday"), `{{current_date}}` in a markdown block, and the period a `calendar-timeline` block falls back to in a note outside every journal. They all turn over at midnight now, and re-check the date whenever you come back to Obsidian, so a machine that slept through midnight catches up as soon as its window is focused again.
- A `calendar-nav` block on a narrow pane — a note on a phone, a split editor pane — now keeps the previous, current and next periods on one line wherever the three of them fit, instead of leaving two side by side with the third dropped underneath. Both arrows now sit beside the current period rather than beside the neighboring one each points at, so a line that does break never separates the period from the controls that move it, and the previous and next periods render a little smaller than the current one, which is what makes room for all three. Where three genuinely cannot share a line — a monthly block on a phone, whose month names are wider than the pane — each period takes a line of its own rather than two sharing one. A long name no longer overruns its column either, so months like "November" and "December" stop printing over each other and over the arrows.
- The name template warning in settings no longer falls silent just because the name contains a date variable. A template whose numbering cannot be turned back into a date is now flagged even when a date variable is present, and a name whose date variable cannot tell the journal's periods apart — with no sequential numbers to complete it — is now called out in its own right.

## [3.1.0] - 2026-08-17

### Features

- Navigation block rows can now hold several segments side by side, each with its own template text, style, link and decorations — split a row into segments, or join segments back into one row, by dragging them in the settings preview.
- A navigation segment's link can open a shifted date instead of the date it would open by default: the **Link date** field takes the same shift syntax as template date variables, so a row can open next quarter's note, yesterday's note, or the month a row names.
- Clone a journal from settings: the copy carries the source's whole configuration, joins the same shelf, and gets its own copy of the source's commands. Notes are not copied.
- A numbering variable can now be offset and rendered as an ordinal: `{{index+3}}` adds three to the rendered value, `{{index-1}}` subtracts one, and `{{index:o}}` renders it as an ordinal ("4th"). They combine as `{{index+3:o}}`, and both survive the round-trip out of a note name, so a journal named `Sprint {{index+3}}` still recognizes its own notes. This offset syntax now applies to any variable name, not only numbering ones, so a template that happened to contain a literal `+3` or `-1` after a variable name (for example `{{date+3}}`) will render differently from before.
- A new Maintenance page in settings gives you a way back if an update to the plugin damages your settings: before your settings are migrated to a new version, a snapshot is saved automatically, and you can restore it from the Maintenance page with one click.
- The Maintenance page can also run a vault check: it finds notes whose frontmatter no longer matches their journal — notes the calendar can no longer see, notes whose period range is wrong, and notes more than one file claims the same period for — and repairs the safe cases individually or all at once. Notes it cannot safely repair are listed with an explanation instead of a guess.
- A `calendar-timeline` code block in `week` or `month` mode can now show neighboring periods around the current one, using the new `before` and `after` options: `before: 1` with `after: 1` in week mode renders the previous, current and next week together.
- Sequential numbering can now chain several digits together, each with its own variable name, start number, and reset rule, so the fastest one carries into the next when it wraps — a name template of `Release{{release}}Sprint{{sprint}}` with `release` never resetting and `sprint` resetting every 6 notes produces `Release4711Sprint1` … `Release4711Sprint6`, then `Release4712Sprint1`.
- A numbering digit's variable name can be written in any script — `{{спринт}}` or `{{スプリント}}` is accepted where only Latin letters were before.

### Bug Fixes

- A navigation segment whose template shifts the displayed date (for example `{{date+1q:[Q]Q}}`, labelled one quarter ahead) now opens that shifted date on click, from the context menu, and in link previews; previously it opened the note's own date while showing the next one's label.
- A decorated navigation segment now shows the decorations of the note its link opens, rather than the host note's — a row linking to the year journal now decorates from the year's own rules instead of the day's. If **Add decorations** is on for a row that links to something other than the current period, its appearance will change after upgrading.
- Renaming a journal now updates any navigation segment that links to it by name, and deleting a journal clears that link instead of leaving the segment pointing at a journal that no longer exists.
- The warning shown when a name template without a date variable cannot be turned back into a date now says which digit is at fault instead of a single generic message: it names the numbering variables the name and folder templates leave out, or the digit below the slowest one that never resets and so freezes every digit above it.
- Navigation block rows — including the custom-interval list in a view — now render `{{note_name}}` and `{{title}}`. A row shows the name of the note it opens, or the name that note would get for a period whose note does not exist yet.
- `{{current_date}}`, `{{time}}` and `{{current_time}}` now resolve in navigation block rows; the variable reference listed them, but they came out as literal text.
- A week configuration arriving from sync now re-anchors weekly notes on the receiving device, the same way changing it on that device does; previously the calendar moved but the notes did not, so their cells read as empty and the open-this-week command could start a second note for the week.
- Opening a journal note now opens it in the window you are working in; previously, if the note was already open in another window, Obsidian jumped you over to that window.
- Middle-clicking or Ctrl/Cmd-clicking to open a journal note in a new tab, split, or window now does so even when the note is already open somewhere; previously the request was ignored and the existing pane was focused instead.
- Picking a journal from the menu that appears when several journals cover the clicked date now opens or creates that journal's note on macOS; previously the pick was silently discarded, so a date that more than one journal could answer for — the usual case in a calendar scoped to all journals — could not be opened at all. The menu still uses whichever style macOS is set to show.
- A journal carrying one unreadable setting now keeps everything else it has — its period, folder, name template, templates and decorations — and only the unreadable setting falls back to its default. Previously the whole journal was replaced by a daily journal that kept nothing but its name, so an upgraded vault could end up with every journal writing days: clicking a date offered all of them at once, and the week, month, quarter and year cells stopped responding.
- A decoration that matches on a note property no longer costs its journal its configuration when upgrading from an earlier version. Such conditions predate property value types and are now read as text conditions.
- A journal that splits its date between the folder and the file name — a `{{date:YYYY}}` folder with a `{{date:[Q]Q}}` or `{{date:[W]ww}}` name, say — is now recognized from its own note paths. Previously only a quarter starting on 1 January in the current year was matched, and weeks essentially never were, so such notes were not adopted automatically and bulk add did not find them. Day-of-year names (`DDD`, `DDDD`) containing a zero are now matched too.
- A note that appears in the vault while Obsidian is running — arriving over sync, restored from trash, or written by another tool — is now left alone until Obsidian has read it. Previously it was adopted immediately, before its own frontmatter could be seen, and rewritten as if it were a new note. For a custom-interval journal that destroyed a manually adjusted end date, and since that date is where the next interval starts, every later interval shifted with it.
- Editing a note's end date or its numbering value by hand now takes effect straight away. Previously the plugin kept using the old value until Obsidian was restarted: extending or shrinking a custom interval left the calendar and navigation on the old boundary, which then jumped on the next launch, and a corrected number stayed stale for the rest of the session.

## [3.0.0] - 2026-08-14

### Features

- Complete rewrite of the plugin on a new modular foundation, with automatic migration of settings and existing notes from earlier versions.
- Build and customize your own calendar views by composing blocks (month, week, quarter, year, decade, and custom-interval calendars, plus toolbars, dividers, and spacers) and toolbar items (shelf selector, period buttons, navigation buttons, and more).
- Target a specific journal from a custom command or toolbar button, so hotkeys act on it without prompting.
- Choose where the week-number column appears per block, with a global default.
- Open a view as a main tab, not only in the left or right sidebar, and decide per view whether it opens at startup.
- Have a view reopen on the date you last visited instead of always starting on today.
- Middle-click or Ctrl/Cmd+Alt-click a navigation link to open the note in a new tab or a split, the way an ordinary Obsidian link behaves.
- Open the nearest existing note for a journal or shelf, via command or an existing notes navigation toolbar item.
- New markdown-template block for custom views that renders a template file inline.
- Look up what a code block or template variable produces without leaving settings: a reference modal lists each one with a live preview and click-to-copy snippets.
- Automatically attach externally created notes that match a journal's naming.
- Logging tools that capture activity and dump it to a note for troubleshooting.
- Open journal notes through the Obsidian URI scheme.
- Insert a link to a journal date at the cursor via command.
- New `journal_link` template variable.
- Hide specific weekdays on the calendar with a per-weekday picker.
- Highlight calendar days by date or weekday without attaching the rule to a journal: set decorations vault-wide, or per shelf so they apply only while that shelf is in view.
- See why a calendar cell looks the way it does: right-click it for a breakdown naming the rule behind each color, border, and mark, and the rules those overrode. The breakdown follows the shelf you are viewing, and a custom interval explains itself rather than the day it begins on.
- Tell a decoration that never fires from one whose day simply has not come up: every rule in settings reports whether it has matched recently, and an inspector shows everything decorating a chosen date across all three scopes.
- The interface now speaks ten languages besides English — Chinese, German, French, Russian, Spanish, Portuguese, Japanese, Korean, Italian, and Ukrainian — each reviewed key by key.
- Meaningful, stable CSS class names on calendar and code-block elements for easier theming.

### Bug Fixes

- Warn when a name template would connect every entry to the same note; previously, notes with only a title and no date all collided onto a single note.
- Renaming the property a journal writes its date or numbering into now moves that value in every connected note; previously the notes kept the old property name and silently dropped off the journal.
- Weekly navigation now reaches ISO week 53 at year boundaries instead of skipping it.
- Changing the week configuration now updates the calendar straight away; previously the old first day of the week stayed in place until Obsidian was restarted.
- Upgrading repairs weekly notes whose stored date was not the first day of their week; previously such a note dropped off the calendar and the open-this-week command reached the previous week's note.
- Sequence numbering resets now cycle correctly.
- A journal numbered from zero now renders its index in note names and writes it to frontmatter; previously the first entry lost its index entirely.
- A custom interval anchored mid-week now keeps that day as its anchor instead of snapping back to the start of the week.
- Creating a weekly journal mid-week now creates the current note immediately instead of waiting for the next week.
- Decorations based on a checkbox (boolean) property now match correctly.
- A navigation link no longer opens two context menus at once.
- Navigation blocks now wrap to fit a narrow pane instead of overflowing and clipping on mobile.
- Previously imported notes now appear on the calendar after startup.
- The open-next and open-previous note commands now work in Reading (preview) mode.
- Interval-offset decorations now mark the interval's first day by default instead of never matching, and the editor spells out which day the offset targets.
- Where two of a journal's decorations both set a background or a text color, the later one now wins; previously the earlier one did, which disagreed with how borders already resolved.
- At most one corner decoration now renders per corner of a cell; previously every matching corner stacked on top of the others.
- A newly added background, corner, shape, or icon style now arrives with a visible color instead of a transparent one that rendered as nothing.
- Corrected a misspelling in the description of the vault-wide week configuration setting.

## [2.1.9] - 2025-06-07

### Bug Fixes

- Fix relative week calculation

## [2.1.8] - 2025-06-07

### Bug Fixes

- Fix relative weeks calculation
- Fix displaying shelf selector in calendar view
- Fix calendar view updating month on week note selection

## [2.1.7] - 2025-05-02

### Bug Fixes

- Force normal text color in calendar to avoid issues with text-on-accent being inverted

## [2.1.6] - 2025-05-01

### Bug Fixes

- Fix active week highlight when weeks are displayed after weekdays

### Ux

- Improve ux of journal settings

## [2.1.5] - 2025-04-26

### Bug Fixes

- Update button dropdow position to solve issue with display on mobile
- Fix showing Update button in Week configuration modal
- Add hint about creating folder in name template
- Add fallback for empty name template
- Add hint about using W in variables

## [2.1.4] - 2025-04-12

### Bug Fixes

- Fix plugin and shelf commands edit and ribbon icons for them

## [2.1.3] - 2025-03-20

### Bug Fixes

- Fix UI updates on week settings change

## [2.1.2] - 2025-03-19

### Bug Fixes

- Fix bulk adding notes to journal

## [2.1.1] - 2025-03-16

### Bug Fixes

- Fix applying today background color
- Fix restoring default locale, improve week settings modal ux

### Ux

- Update path preview to make spaces at end more visible

## [2.1.0] - 2025-03-10

### Bug Fixes

- Fix calendar button styles in some themes

### Documentation

- Enhance README with comprehensive documentation

### FEAT

- Add commands on plugin and shelf level

### Features

- Support startOf and endOf modifiers for date variables
- Add size to icon and shape decoration styles, polish decorations display
- Add preview functionality
- Add option to apply week settings to vault
- Add notification about command ids, restore v1 global commands

## [2.0.2] - 2025-03-06

### Bug Fixes

- Fix adding start/end date to new notes when configured

### Ux

- Make shelf more obvious in journal settings

## [2.0.1.beta3] - 2025-03-02

### Bug Fixes

- Update build for plugin o work on ios

## [2.0.1.beta2] - 2025-03-02

### Bug Fixes

- Import moment from obsidian

## [2.0.0.beta4] - 2025-03-01

### Bug Fixes

- Fix v2 data migration
- Improve migration flow
- Fix migartion flow by ensuring step components gets recreated

### Refactor

- Rearrange migration functions, add tests

## [2.0.0.beta3] - 2025-02-28

### Bug Fixes

- Obsidian reload should not move calendar view
- Replace spaces in command id with dash

### Testing

- Add first portion of journal tests

### Ux

- Add warning about creating folder with date format and link to fix

## [2.0.0.beta2] - 2025-02-19

### Bug Fixes

- Fix next/prev month navigation in date picker
- Fix renaming journal was not updating notes
- Fix wrong text

### Documentation

- Add missing shelves description, fix code block example

### Ux

- Prefill frontmatter field name while editing

## [1.4.3] - 2024-10-23

### Bug Fixes

- Support time and title template variables

### Features

- Support templater cursor

## [1.4.2] - 2024-10-15

### Bug Fixes

- Fix bulk node processing

## [1.4.1] - 2024-10-14

### Bug Fixes

- Fix adding existing notes to journal

## [1.4.0] - 2024-07-07

### Bug Fixes

- Prevent failures on unexpected frontmatter data
- Fix indexing inconsistencies
- Improve calendar styles
- More calendar view improvements

### Features

- Add relative date calculations to date template variables

## [1.3.0] - 2024-03-31

### Bug Fixes

- Check id uniqness when creating a journal

### Features

- Focus calendar view around opened note
- Add setting to restrict note creation before start date
- Allow configuring how interval journal ends
- Better templater interop
- Add existing notes to journal in bulk

## [1.2.0] - 2024-03-03

### Bug Fixes

- Show journals in lexicographic order in journal selection menu
- Typo

### Features

- Open note on pick date and today buttons click
- Controll visibility of weeks in calendar view by settings
- Highlight current intervals similar to today
- Use context menu for journal selection in calendar view
- Add context menu to calendar view
- Add setting to show intervals in reverse order in calendar view
- Command to connect node to a journal

## [1.1.0] - 2024-02-25

### Bug Fixes

- Clarify section folder setting to be relative to root folder
- Fix type error

### Features

- Add next/prev note command
- Make rendering of interval-nav code block configurable
- Add calendar view

## [1.0.1] - 2024-02-17

### Bug Fixes

- Delay frontmatter processing

<!-- generated by git-cliff -->
