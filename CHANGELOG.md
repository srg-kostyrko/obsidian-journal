# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Features

- Complete rewrite of the plugin on a new modular foundation, with automatic migration of settings and existing notes from earlier versions.
- Build and customize your own calendar views by composing blocks (month, week, quarter, year, decade, and custom-interval calendars, plus toolbars, dividers, and spacers) and toolbar items (shelf selector, period buttons, navigation buttons, and more).
- Target a specific journal from a custom command or toolbar button, so hotkeys act on it without prompting.
- Choose where the week-number column appears per block, with a global default.
- Open the nearest existing note for a journal or shelf, via command or a defined-navigation toolbar item.
- New markdown-template block for custom views that renders a template file inline.
- Automatically attach externally created notes that match a journal's naming.
- Logging tools that capture activity and dump it to a note for troubleshooting.
- Open journal notes through the Obsidian URI scheme.
- Insert a link to a journal date at the cursor via command.
- New `journal_link` template variable.
- Hide specific weekdays on the calendar with a per-weekday picker.
- Highlight calendar days by date or weekday without attaching the rule to a journal: set decorations vault-wide, or per shelf so they apply only while that shelf is in view.
- Meaningful, stable CSS class names on calendar and code-block elements for easier theming.

### Bug Fixes

- Warn when a name template would connect every entry to the same note; previously, notes with only a title and no date all collided onto a single note.
- Weekly navigation now reaches ISO week 53 at year boundaries instead of skipping it.
- Sequence numbering resets now cycle correctly.
- Creating a weekly journal mid-week now creates the current note immediately instead of waiting for the next week.
- Decorations based on a checkbox (boolean) property now match correctly.
- A navigation link no longer opens two context menus at once.
- Previously imported notes now appear on the calendar after startup.
- The open-next and open-previous note commands now work in Reading (preview) mode.
- Interval-offset decorations now mark the interval's first day by default instead of never matching, and the editor spells out which day the offset targets.

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
