# Variables

::: v-pre

Variables are written in double braces — `{{date}}`, `{{index}}` — and filled in for the note being
created. They work in a journal's **Note name template** and **Folder**, in template notes, in
navigation block segments, in a notelet type's name and folder, and in the markdown template view
block. Each journal's settings has a **Supported variables** link that opens the same list for that
journal, with its own date format, numbering digits and questions filled in.

## Where each variable works

| Variable                                           |     Note name      |       Folder       |  Template content  | Navigation segment |
| -------------------------------------------------- | :----------------: | :----------------: | :----------------: | :----------------: |
| `{{date}}`, `{{start_date}}`, `{{end_date}}`       |         ✓          |         ✓          |         ✓          |         ✓          |
| `{{week_of_month}}`                                |         ✓          |         ✓          |         ✓          |         ✓          |
| `{{journal_name}}`                                 |         ✓          |         ✓          |         ✓          |         ✓          |
| numbering digits — `{{index}}`                     |         ✓          |         ✓          |         ✓          |         ✓          |
| question answers — `{{mood}}`                      |        ✓ ¹         |        ✓ ¹         |         ✓          |         ✓          |
| `{{current_date}}`, `{{time}}`, `{{current_time}}` |        ✓ ²         |        ✓ ²         |         ✓          |         ✓          |
| `{{note_name}}`, `{{title}}`                       |                    |         ✓          |         ✓          |         ✓          |
| `{{relative_date}}`                                |                    |                    |                    |         ✓          |
| `{{journal_link(name)}}`                           |        ✓ ²         |        ✓ ²         |         ✓          |         ✓          |
| `{{notelet_index}}`                                | notelet types only | notelet types only | notelet types only |                    |

¹ Not a yes/no answer — see [Questions](/questions#answers-in-the-note-name-or-folder).
² Allowed, but a name or folder that uses them cannot be read back, so notes you create yourself will
not [auto-attach](/notes#auto-attach). The settings page warns.

A notelet type's name and folder take its journal's variables, with the type's own questions in place
of the journal's, plus `{{notelet_index}}`. The **Markdown template** view block is covered in
[Views](/views#markdown-template).

## The variables

- `{{journal_name}}` — the journal's name.
- `{{date}}` — the period's date, in the journal's **Default date format** unless you give one:
  `{{date:YYYY-MM-DD}}`, using [Moment.js format tokens](https://momentjs.com/docs/#/displaying/format/).
  For day, month, quarter, year and custom intervals it is the period's first day. For a week it is the
  week's **representative day** — the day whose calendar year is the week's own year, which is the
  Thursday under ISO 8601. That is what makes `{{date:YYYY}}` give the right year for a week that
  straddles New Year, whichever week configuration you use.

  The week-year formats `gggg` and `GGGG` are **not recommended in a note name or a folder**. The
  representative day already keeps `YYYY` right, and in a name or folder these two tokens stop the
  plugin reading the date back out of the path — which it does for notes you create yourself and when
  **Maintenance** repairs a stored date. Week numbers (`w`, `ww`) are fine. Inside a template's content
  every token is ordinary formatting.

- `{{start_date}}`, `{{end_date}}` — the period's first and last day, formatted and shifted like
  `{{date}}`. For a custom interval whose end you moved by hand, `{{end_date}}` is the moved end.
- `{{week_of_month}}` — which week of its month the note's week is, counting the week that holds the 1st
  as week 1. It follows **Week configuration**, so it agrees with the calendar's week numbers.
  Because a week can straddle two months, it counts within the month of the date it is read from, and
  date modifications choose that date: `{{week_of_month}}` counts within the note's own month, while
  `{{week_of_month<endOf=week>}}` counts within the month the week ends in. Pair it with a month read the
  same way so the two agree: `{{date<endOf=week>:MMMM}} week {{week_of_month<endOf=week>}}` names
  31 August 2026 "September week 1".
  It offsets and renders as an ordinal like a numbering digit: `{{week_of_month-1}}`,
  `{{week_of_month:o}}`. It is worked out from the date, so changing the start of the week later changes
  what the plugin would call a note, while notes already on disk keep their names.
- `{{index}}` — a journal's [sequential number](/journals#sequential-numbers). The first digit is named
  `index` unless you rename it; each further digit is its own variable under the name you give it.
  Numbering is on by default for custom intervals. `{{index+3}}` adds three, `{{index-1}}` subtracts
  one, `{{index:o}}` renders an ordinal ("4th"), and they combine: `{{index+3:o}}`. A name built with
  offsets and ordinals is still read back correctly.
- A [question](/questions) adds a variable under its **Variable name** — a question named `mood` is
  `{{mood}}`. A date answer takes every date modification. An unanswered question renders empty in
  template content.
- `{{notelet_index}}` — a [notelet](/notelets)'s number within its period, restarting every period.
  Only in a notelet type's own name, folder and templates. With **Number each notelet** off it still
  renders, but the number is not stored on the notelet. Offsets and ordinals work as for `{{index}}`.
- `{{note_name}}`, `{{title}}` — the note's name. Not in the note name template itself, since the name
  has to exist first. In a navigation segment, the name of the journal's note for the period that part
  of the block shows — or the name it would get — whatever the segment links to.
- `{{current_date}}` — the day the note is written, not its period. It is a date, so its format holds a
  date only: `{{current_date:YYYY-MM-DD HH:mm}}` renders the time as `00:00`, and `HH:mm:ss` as
  `00:00:00`. For the time of day, use `{{time}}`.
- `{{time}}`, `{{current_time}}` — the time the note is written, `HH:mm` unless you give a format:
  `{{time:HH:mm:ss}}`. For a full timestamp: `{{current_date:YYYY-MM-DD}} {{time:HH:mm:ss}}`.
- `{{relative_date}}` — "Yesterday", "Today", "Last Tuesday", "This month", "3 weeks ago" and so on, in
  navigation segments.
- `{{journal_link(daily)}}` — the vault path of the note in another journal for the same date, whether
  or not it exists yet. Most useful in template content and the markdown template view block. Wrap it in a link
  yourself: `[[{{journal_link(daily)}}]]`. A date that journal does not cover leaves it unresolved.

## Date modifications

Any date or time variable, `{{week_of_month}}`, a date answer and `journal_link` can be shifted before
it is formatted:

- **Shift** — `{{date+5d}}` adds five days. Units: `y` years, `q` quarters, `m` months, `w` weeks, `d`
  days, `h` hours; `+` or `-`. `{{date-1w}}`, `{{journal_link(daily)+1d}}`.
- **Boundary** — `{{date<startOf=week>}}`, `{{date<endOf=month>}}`. Units: `decade`, `year`, `quarter`,
  `month`, `week`, `day`, `hour`.
- They combine, before the format: `{{date+1w<startOf=week>:MMM DD, YYYY}}`. Shifts apply first, then
  boundaries, then the format, whatever order you write them in.
- Dates have day precision, so `h` and `<startOf=hour>` change nothing on them — they only move
  `{{time}}` and `{{current_time}}`. `<startOf=decade>` applies to dates only.

`{{date<startOf=decade>:YYYY}}s` names a decade, such as `1950s` — see
[Filing notes by decade](/journals#filing-notes-by-decade) for a folder built on it, and what that does
to auto-attach.

A `{{…}}` the plugin cannot read — a misspelled variable, an unclosed brace — is left in the text as
written.

:::
