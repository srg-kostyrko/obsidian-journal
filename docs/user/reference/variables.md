# Supported variables

::: v-pre

These variables can be used in the note name template, the folder path, and the content of a template note. Each journal's settings has a **Supported variables** link that opens the same list for that journal, with its own date format and numbering variables filled in.

- `{{journal_name}}` - name of journal note belongs to
- `{{date}}` - date used as reference to specific period, formatted using date format from settings. In most cases it is the first day of the month, quarter, year or custom interval. The exception is week notes, where `{{date}}` renders the week's representative day rather than its first day — the day whose calendar year is the week's own year, which is the Thursday under the ISO-8601 week configuration. This is what makes `{{date:YYYY}}` resolve to the right year on a week straddling January 1, whichever week configuration you use. Format can be overridden using following syntax `{{date:format}}` where format is string using [Moment.js format rules](https://momentjs.com/docs/#/displaying/format/) (like `{{date:YYYY-MM-DD}}`).
  Because of that, the week-year formats — `gggg` and `GGGG`, and the `ww`/`WW` week numbers that belong with them — are **not recommended in a note name or a folder path**. They exist to keep a week's year right where a plain calendar year would be wrong, which is the job the representative day already does here; the default weekly format `YYYY-[W]w` relies on it. Inside a template's content they are ordinary formatting and are fine. In a name or folder they cost you the path as a fallback: the plugin recognizes its own notes by their frontmatter, and where that is missing — a note you created yourself in the right place, or a note whose stored date **Maintenance** is trying to repair — it reads the date back out of the path instead, and a week-year token leaves nothing to read.
- `{{start_date}}` - first day of week, month, quarter, year or interval depending on note type, formatting rules are the same as in `{{date}}`, as well as the calculations
- `{{end_date}}` - last day of week, month, quarter, year or interval depending on note type, formatting rules are the same as in `{{date}}`, as well as the calculations
- `{{week_of_month}}` - which week of its month the note's week is, counting the week that holds the 1st of the month as week 1. It follows the start of the week configured in the plugin's calendar settings, so it agrees with the week numbers the calendar shows.
  Because a week can straddle two months, the month it counts within is whichever month the date it is read from falls in. Date modifications choose that date: `{{week_of_month}}` counts within the note's own month, while `{{week_of_month<endOf=week>}}` counts within the month the week ends in — which moves a whole straddling week into the later month. Pair it with a month rendered the same way so the two agree: `{{date<endOf=week>:MMMM}} week {{week_of_month<endOf=week>}}` names August 31 2026 "September week 1".
  It can be offset and rendered as an ordinal like a numbering variable (`{{week_of_month-1}}`, `{{week_of_month:o}}`).
  It is computed from the date rather than stored, so a note name built from it is still recognized as the journal's own — but changing the start of the week later changes what the plugin would name a note, while notes already on disk keep the name they were created with.
- `{{index}}` - a journal's numbering variable; its first (and by default only) digit is named
  `index` unless renamed. A journal can chain several digits together, each under its own
  variable name and frontmatter property — see **Sequential numbers** below; the name you give a
  digit there is the name you use here. Numbering is on by default for custom-interval journals
  and can be enabled for any journal type.
  A numbering variable can be offset and rendered as an ordinal: `{{index+3}}`
  adds three to the rendered value, `{{index-1}}` subtracts one, and
  `{{index:o}}` renders it as an ordinal ("4th"). They combine as
  `{{index+3:o}}`. Both survive the round-trip out of a note name, so a journal
  named `Sprint {{index+3}}` still recognizes its own notes.
- A journal's own [questions](#questions) each add a variable named after the question — a
  question named `mood` renders as `{{mood}}`. Available everywhere the built-in variables above
  are; a question with no answer yet renders empty, same as an unset numbering variable.
- `{{notelet_index}}` - the number of a [notelet](#notelets) within its period. Numbering restarts
  in every period, so the first notelet of a day is always 1. Available only in a notelet type's
  own note name, folder path and templates, and only while that type has **Number each notelet**
  on. It offsets and renders as an ordinal like the other numbering variables
  (`{{notelet_index+1}}`, `{{notelet_index:o}}`).
- `{{note_name}}` / `{{title}}` - the note's name. Available in the folder path, in template content and in navigation block segments, but not in the note name template itself, since the name has to render first. In a navigation block segment it is the name of the note the segment opens; for a period whose note does not exist yet, the name that note would get.
- `{{current_date}}` - the date the note is rendered on (not the reference period), formatted with `{{current_date:format}}`
- `{{current_time}}` / `{{time}}` - the clock time at render, formatted with `{{time:HH:mm}}`
- `{{relative_date}}` - "Yesterday", "Today", "Last Tuesday", "This month", "3 weeks ago", and so on. Available in navigation block segments.
- `{{journal_link(journal_name)}}` - inside a template note's content, and in the markdown template view block, resolves to the vault path of the corresponding note in another journal. Wrap it in a link or embed yourself, for example `[[{{journal_link(daily)}}]]`.

## Date modifications

Any date or time variable, `{{week_of_month}}`, and `journal_link`, can be shifted before it is formatted:

- `{{date+5d:format}}` adds 5 days. The units are `y` (years), `q` (quarters), `m` (months), `w` (weeks), `d` (days) and `h` (hours), with `+` or `-`, for example `{{date-1w}}` or `{{journal_link(daily)+1d}}`.
- `{{date<startOf=week>}}` and `{{date<endOf=month>}}` snap to a boundary. The units are `decade`, `year`, `quarter`, `month`, `week`, `day` and `hour`.
- Modifications can be combined and go before the `:format`, for example `{{date+1w<startOf=week>:MMM DD, YYYY}}`. Shifts always apply first, then boundaries, then the format override, whatever order you write them in.
- Date variables have day precision, so `h` and `<startOf=hour>` change nothing on them; they only move `{{time}}` and `{{current_time}}`. Conversely, `<startOf=decade>` applies to dates only.

The same list is available in the app: any **additional modifications** link in a journal's settings opens it.

:::
