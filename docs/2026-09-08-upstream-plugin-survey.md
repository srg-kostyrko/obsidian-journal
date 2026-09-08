# Upstream plugin survey — Periodic Notes and Calendar

Taken 2026-09-08 against `liamcain/obsidian-periodic-notes` (235 issues, open and
closed) and `liamcain/obsidian-calendar-plugin` (307 issues, 170 open). It records
what was harvested, what was ruled out and why, so none of it has to be
re-derived.

**Method, if it is worth repeating.** Pull every issue with bodies _and_ comments
(`gh issue list --state all --json number,title,state,comments,createdAt,body`),
then read the bodies. Counting demand by title keyword produced a four-issue
"locale cluster" that turned out to be one ambiguous request and three asks for
week-start configuration, which is already shipped. Quote the ask before
classifying it.

## The vacuum

Both plugins are unmaintained and their users are looking for somewhere to go.

- Calendar #418 (2026-09-01) — "Offer: maintenance release for current Obsidian
  API (PRs, handover, or takedown — your call)"
- Calendar #417 (2026-08-27) — settings tab crashes on non-English locales and
  "breaks the whole plugin after restart"
- Calendar #403, #305 and Periodic Notes #158, #164, #249 — variations of "is
  this still maintained?"
- Periodic Notes #238 — "There appear to be many forks. But the owner of this
  repo seems to have abandoned it without handing off maintenance to anyone, so
  it's pure guesswork as to which one is best to use."

Journals was recommended organically twice, both times in the Periodic Notes
tracker (#195, #39: "It consolidates daily, periodic and calendar for my
purposes"), and never in Calendar's. A comment naming it was added to Calendar
#403 on 2026-09-08.

## Alternatives people are being pointed at

Star counts and last push as of 2026-09-08. For comparison, this plugin was at
390 stars — larger than everything below.

| Plugin                                   | Stars | Last push      | Note                                                        |
| ---------------------------------------- | ----: | -------------- | ----------------------------------------------------------- |
| `Canna71/obsidian-chronology`            |   148 | 2026-05-03     | The most established alternative found                      |
| `karfekr/obsidian-persian-calendar`      |   129 | 2026-08-29     | Jalali calendar — serves the case we declined               |
| `FBarrca/obsidian-calendar-plugin`       |    24 | 2026-03-02     | Calendar fork                                               |
| `mattmaiorana/calendar-plus`             |    10 | 2026-07-13     | Recommended in Calendar #403 as replacing _both_ incumbents |
| `YouFoundJK/plugin-full-calendar`        |     0 | 2026-06-02     | Full Calendar fork                                          |
| `GamerGirlandCo/obsidian-periodic-notes` |     1 | **2023-04-04** | Periodic Notes fork, itself dead                            |

Also named but not verified here: Notebook Navigator (mentioned in prose without
a link, said to include calendar functionality); further Calendar forks by
`aricsangchat`, `Mansarde` and `romansemko`; a Periodic Notes fork on Codeberg by
`khaeru`, whose author says "I am not a JavaScript developer… I wouldn't suggest
you use it".

**Not yet done:** nobody has looked at what any of these actually offer.
`calendar-plus` is the one worth opening first — it is the only one a user
publicly described as displacing both plugins.

## Adjacent plugins, and what they signal

Ranked by how often they are linked across both trackers.

| Plugin                                                        | Mentions | Signals                                                                         |
| ------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------- |
| `argenos/nldates-obsidian`                                    |        7 | Natural-language dates — the most-linked plugin in either tracker. See #192     |
| `SilentVoid13/Templater`                                      |        6 | Already integrated                                                              |
| `lynchjames/obsidian-day-planner`                             |        3 | Time-of-day planning inside a daily note                                        |
| `ryanjamurphy/review-obsidian`                                |        3 | Scheduling a note into a future daily note — adjacent to the tasks work in #344 |
| `shichongrui/obsidian-rollover-daily-todos`                   |        1 | Task rollover, see #73                                                          |
| `ZetabS/datetime-language-changer`                            |        1 | Someone built the locale override we declined                                   |
| `sfsam/Itsycal`                                               |        1 | The count-badge reference behind Calendar #77, see #357                         |
| `iSoron/uhabits`                                              |        1 | Habit streaks, behind Calendar #352's "unbreakable chain"                       |
| `aidenlx/alx-folder-note`, `xpgo/obsidian-folder-note-plugin` |   1 each | Folder-per-day layouts — answered here by notelets                              |
| `Vinzent03/obsidian-hotkeys-for-specific-files`               |        1 | "Prefer existing panes" behavior                                                |
| `nothingislost/obsidian-hover-editor`                         |        1 | Hover previews, adjacent to #119                                                |
| `valentine195/obsidian-fantasy-calendar`                      |        1 | Non-Gregorian calendars                                                         |

## Registry sweep

Taken 2026-09-08 from `obsidianmd/obsidian-releases` — `community-plugins.json`
(7,422 plugins) joined to `community-plugin-stats.json`, filtered on calendar,
journal, daily-note, periodic, timeline, habit and planner vocabulary, ranked by
downloads. This is the whole ecosystem rather than what two trackers happened to
mention.

### Scale

| Plugin             |   Downloads |
| ------------------ | ----------: |
| Tasks              |   4,197,016 |
| Calendar           |   3,082,484 |
| TaskNotes          |   1,404,982 |
| Notebook Navigator |     944,711 |
| Day Planner        |     879,727 |
| Periodic Notes     |     754,036 |
| **Journals**       | **127,941** |

Two dead plugins hold 3.8M downloads between them, which is the size of the
migration audience. Note that GitHub stars mislead here: by stars this plugin
leads every alternative named in Calendar #403, and by installs it is an order of
magnitude behind the incumbents and behind Notebook Navigator, which bundles a
calendar into a file browser.

### A dedicated plugin already exists for several ideas

Existence proves demand and gives a reference implementation; it is not by itself
a reason to build or to skip.

| Plugin               |  Downloads | Bears on                                                               |
| -------------------- | ---------: | ---------------------------------------------------------------------- |
| Rollover Daily Todos |    148,695 | #73 — task rollover                                                    |
| Heatmap Calendar     |    174,912 | A year-scale density view; decorations are cell-scale only             |
| Review               |     64,817 | Adding a link to a future daily note — adjacent to #344                |
| Daily Notes Editor   |     42,469 | Editing a stream of daily notes inline on one page                     |
| Habit Tracker 21     |     33,367 | Streaks, Calendar #352's "unbreakable chain"                           |
| Influx               |     30,918 | Aggregating backlinked clippings — adjacent to #356                    |
| Daily Named Folder   |     29,663 | Folder-per-day layouts, answered here by notelets                      |
| Daily Note Outline   |     24,776 | An outline across several daily notes                                  |
| OZ Calendar          |     22,147 | A calendar driven by any YAML date key — already how this plugin works |
| **Journal Review**   | **21,911** | **#355 — "what happened today last year", the exact feature**          |
| Daily notes calendar |     19,085 | Calendar navigation for daily and weekly notes                         |
| Daily Notes Viewer   |     18,251 | Several recent daily notes on one page                                 |
| Yearly Glance        |     12,231 | Annual events at a glance                                              |

Three of these — Daily Notes Editor, Daily Notes Viewer and Daily Note Outline,
about 85,000 downloads together — are the same missing surface: **reading several
periodic notes at once** rather than one at a time. There is no equivalent here,
and no issue covering it.

### Bases

`calendar-bases` (111,366) and `notion-bases` (20,943) add calendar layouts to
Obsidian's Bases. #344 concluded Bases cannot help _tasks_, because Obsidian does
not cache checkbox list items as properties — that holds, but it does not extend
to notes-with-dates, which is exactly what Bases does cache and what those two
plugins render. Worth taking a deliberate position on rather than inheriting the
tasks conclusion.

### Niche calendars are covered by specialists

`chinese-calendar` (15,758), `dust-calendar` (15,026) and
`karfekr/obsidian-persian-calendar` (129 stars, active) each serve one calendar
system. This supports the decision above not to build non-Gregorian support: the
niche has maintained answers, and each needs domain knowledge this project does
not have.

### Method

`gh api repos/obsidianmd/obsidian-releases/contents/community-plugins.json -H "Accept: application/vnd.github.raw"`
and the same for `community-plugin-stats.json`, then join on plugin id. Both are
about 2MB, so the raw media type is required — the default contents response caps
at 1MB.

## What the survey produced

Opened: #351 (day-start offset), #352 (CLI handlers), #354 (Periodic Notes
settings import), #355 ("On this day"), #356 (referenced-date decoration
condition), #357 (task done-semantics and richer indicators). The migration
sections in `README.md` came from the same pass.

## Ruled out, with reasons

Recorded so they are not re-proposed. Each was checked against the code, not
assumed.

- **Formatting-locale picker.** The demand was a mirage — of four issues, three
  ask for week-start configuration, which week presets already ship. Building it
  would also split name rendering (`CUSTOM_LOCALE`) from name parsing (the global
  locale, read by `templates/format-regex.ts` and `ordinalFor`), which currently
  agree only because the clone differs from the global locale in its week config
  alone.
- **Pre-creating notes on a rolling horizon.** Materialising empty notes destroys
  the meaning of the _has note_ decoration, which the whole decoration system
  rests on. The demand underneath it is mostly "my query tool cannot see a file
  that does not exist".
- **Template loops.** `{{ }}` is a substitution system that has to round-trip out
  of note names. Templater already does loops, and journal variables resolve
  before Templater parses.
- **Non-Gregorian calendars.** Not a formatting option but a second period
  algebra, and the dependency would have to extend Obsidian's shared moment
  instance. `karfekr/obsidian-persian-calendar` serves this niche actively.
- **Canvas files as journal notes.** `FileManager.processFrontMatter` returns
  immediately for any non-`.md` file (verified in Obsidian 1.13.7), so a canvas
  could never carry the journal claim that every consumer reads.
- **iOS share sheet, and the date-property link button.** No API exists for
  either: a share target ships in the app binary, and the property widget is
  constructed only when the core `daily-notes` plugin is enabled and calls
  straight into it.
- **Weekend-as-one-note.** Not expressible — day journals have no weekday filter
  and custom intervals tile at fixed length. Belongs to #198.
- **Ribbon menu labels, cursor placement, weekday label format, hotkeys to page
  the calendar view.** Each is small, each has a workaround, none has demand in
  this project's own tracker.
