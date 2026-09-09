# Plugin harvest list

A standing list of Obsidian plugins worth mining for ideas, with what to look for
in each. It is a working queue, not a report: pick a row, examine it, write the
verdict back.

The rows were assembled on 2026-09-08 from download counts, descriptions and
issue-tracker mentions. A row still marked `not examined` has never been opened:
what that plugin actually does, and whether the idea is any good here, is the
work still to do.

## How to work this list

**One plugin per pass.** Finish it before picking the next. A sweep that skims
ten READMEs produces ten shallow verdicts and no issues worth filing.

1. **Pick one row**, preferring high install counts and the **Surfaces we do not
   have** table.
2. **Learn what it actually does.** Read its README, docs and settings
   reference, then read its **source** for anything the docs leave ambiguous or
   that looks worth stealing — marketing copy is not evidence of behavior. The
   "Harvest" column names the reason the row is listed; it is a starting point,
   not a limit.
3. **Read its whole tracker, open and closed.** The ideas are in the issues, not
   the README: what users asked for, what the maintainer declined and why, and
   what was promised and never shipped. Read the bodies — the closing method
   note below records how title-keyword counting invented a demand cluster that
   did not exist.
4. **Check every candidate against our code** before calling it a gap, against
   [what has already been ruled out](#already-ruled-out) below, and against our
   own tracker, open and closed. Prefer a `git grep` of the real symbol over a
   guess at its name: a wrong spelling reads as "we don't have it".
5. **Present the ideas one at a time**, each with its evidence, and settle each
   one before moving to the next. Do not deliver a batch of findings and a
   recommendation — the roadmap calls are the maintainer's.
6. **Record the verdict** in the Status column once the pass is settled:
   `idea → #NNN` when it produced an issue, `nothing new` when it did not,
   `ruled out — reason` when the idea is real but deliberately declined. Issues
   are filed only for ideas the maintainer accepted.

## Refreshing the list

Download counts age. To rebuild:

```bash
gh api repos/obsidianmd/obsidian-releases/contents/community-plugins.json \
  -H "Accept: application/vnd.github.raw" > plugins.json        # 7,422 entries
gh api repos/obsidianmd/obsidian-releases/contents/community-plugin-stats.json \
  -H "Accept: application/vnd.github.raw" > stats.json
```

Join on plugin `id`, filter `name + description` on calendar / journal / diary /
daily note / periodic / timeline / habit / planner vocabulary, sort by downloads.

For plugins **not** in the registry (BRAT and GitHub-only), take the `repo` field
of every registry entry as an exclusion set and diff it against
`gh api "search/repositories?q=obsidian+<term>&sort=stars&per_page=100"` for
calendar, journal, daily notes, periodic notes, diary, habit tracker, and the
`topic:obsidian-plugin` variants.

Known blind spots in both passes: descriptions and topics only, never READMEs;
English vocabulary, so CJK-described plugins never surface; repository search
truncates at the top 100 per query.

## Surfaces we do not have

The highest-value table. Each row is a capability with no equivalent here and, in
most cases, no issue either.

| Plugin                                |      Installs | Harvest                                                                                                                                                        | Status            |
| ------------------------------------- | ------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Daily Notes Editor                    |        42,469 | Editing a stream of daily notes inline on one page, Roam-style. Three plugins and ~85k installs converge on this; we have no multi-note reading surface at all | scoped → #119     |
| Daily Note Outline                    |        24,776 | An outline across several daily notes — headings, links, tags                                                                                                  | not examined      |
| Daily Notes Viewer                    |        18,251 | Several recent daily notes on one page                                                                                                                         | not examined      |
| `Ordeeper/obsidian-journaling-plugin` | 72★, archived | Same idea, Logseq-style. Archived, so read the code rather than installing                                                                                     | not examined      |
| Heatmap Calendar                      |       174,912 | A year-scale density view. Our decorations are cell-scale only — there is no way to see a year of activity at once                                             | idea → #366, #367 |
| Habit Tracker 21                      |        33,367 | Streaks and habit grids. Calendar #352 asked for the "unbreakable chain"                                                                                       | idea → #368       |
| `yirsi/obsidian-habit-heatmap`        |           27★ | Habit tracking rendered as a GitHub heatmap                                                                                                                    | not examined      |
| Yearly Glance                         |        12,231 | A year of annual events at a glance                                                                                                                            | not examined      |

## Direct overlap — what a migrating user compares us against

| Plugin                                     |      Installs | Harvest                                                                                                                                                                                                    | Status           |
| ------------------------------------------ | ------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Notebook Navigator                         |       947,297 | Since 2026-01 its calendar covers day→year with per-type folders, patterns and templates, so it is now a migration destination for **our** users, not only Calendar's — two of its issues are ours by name | idea → #370      |
| Calendar                                   |     3,082,484 | The incumbent. Unmaintained; its tracker is already mined, see [below](#where-this-came-from)                                                                                                              | mined 2026-09-08 |
| Periodic Notes                             |       754,036 | The other incumbent, likewise mined                                                                                                                                                                        | mined 2026-09-08 |
| Chronology                                 |        68,684 | Calendar plus a timeline of note creation and modification                                                                                                                                                 | not examined     |
| `mattmaiorana/calendar-plus`               |   10★, active | The only plugin a user publicly described as replacing **both** incumbents. Open this one first                                                                                                            | idea → #364      |
| `Lam-L/ObJournal`                          | 78★, unlisted | Journal-style list, month view, **On This Day**, image gallery. Overlaps our positioning directly                                                                                                          | not examined     |
| `luiisca/obsidian-periodic-notes-calendar` | 25★, unlisted | Periodic notes daily→yearly with a calendar interface — a BRAT-only direct replacement                                                                                                                     | not examined     |
| OZ Calendar                                |        22,147 | A calendar driven by any YAML date key — the approach we already take, worth comparing                                                                                                                     | not examined     |
| Daily notes calendar                       |        19,085 | Calendar navigation for daily and weekly notes                                                                                                                                                             | not examined     |
| Journal Review                             |        21,911 | "What happened today last year" — the exact feature in #355, already shipped by someone else                                                                                                               | idea → #355      |

## Tasks and dates

Bears on the tasks epic (#344) and its phases.

| Plugin                            |       Installs | Harvest                                                                                                                                      | Status            |
| --------------------------------- | -------------: | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Tasks                             |      4,197,016 | The de facto task vocabulary we have to stay compatible with                                                                                 | scoped → #357     |
| TaskNotes                         |      1,404,982 | Note-per-task with calendar and time tracking; named in #344                                                                                 | not examined      |
| Day Planner                       |        879,727 | Time blocks on an editable timeline, sourced from daily notes                                                                                | not examined      |
| Rollover Daily Todos              |        148,695 | Rolling unchecked boxes into today's note — this is #73, and the largest single-feature demand signal found                                  | idea → #348, #351 |
| Review                            |         64,817 | Adding a link to the current note into a _future_ daily note                                                                                 | not examined      |
| `702573N/Obsidian-Tasks-Calendar` | 949★, unlisted | Dataview-driven task calendar with more stars than most listed plugins — how much of this domain ships as Dataview views rather than plugins | not examined      |
| Time Ruler                        |         64,073 | Drag-and-drop scheduling combining a task list with a calendar                                                                               | not examined      |

## Platform questions

| Plugin         | Installs | Harvest                                                                                                                                                                                                                                   | Status       |
| -------------- | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Calendar Bases |  111,366 | A calendar layout over Obsidian's Bases. #344 concluded Bases cannot help _tasks_ because checkbox items are not cached as properties — that does not extend to notes-with-dates, which is what these render. Needs a deliberate position | idea → #369  |
| Notion Bases   |   20,943 | Table, kanban, gallery, calendar and timeline views over a folder                                                                                                                                                                         | not examined |

## Capture and input

Lower priority; listed because the pattern recurs and we have no capture story.

| Plugin                                              | Installs | Harvest                                                                                     | Status       |
| --------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------- | ------------ |
| Natural Language Dates                              |  516,996 | The most-linked plugin across both incumbent trackers. Bears on #192                        | not examined |
| Jump-to-Date                                        |   21,797 | A popup calendar purely for navigation                                                      | not examined |
| Daily Named Folder                                  |   29,663 | Folder-per-day layouts — we answer this with notelets, worth checking whether that holds up | not examined |
| Influx                                              |   30,918 | Aggregating backlinked clippings into a footer — adjacent to #356                           | not examined |
| `SamSongAI/Trace`, `jameesy/obsidian-quick-capture` | 22★, 25★ | System-level quick capture into the daily note                                              | not examined |

## Deliberately not harvested

Niche calendar systems, each served by an active specialist: Chinese Calendar
(15,758), Dust Calendar (15,026), `karfekr/obsidian-persian-calendar` (129★).
Each needs domain knowledge this project does not have, and the niches already
have maintained answers. See the non-Gregorian entry below.

## Already ruled out

Checked against the code on 2026-09-08 and declined. Do not re-propose without
new information.

- **Formatting-locale picker.** Demand was a mirage — three of four issues ask
  for week-start configuration, which week presets already ship. It would also
  split name rendering (`CUSTOM_LOCALE`) from name parsing (the global locale,
  read by `templates/format-regex.ts` and `ordinalFor`), which agree today only
  because the clone differs from the global locale in its week config alone.
- **Pre-creating notes on a rolling horizon.** Materialising empty notes destroys
  the meaning of the _has note_ decoration that the decoration system rests on.
- **Template loops.** `{{ }}` is a substitution system that must round-trip out
  of note names; Templater already does loops, and our variables resolve first.
- **Non-Gregorian calendars.** A second period algebra, not a formatting option,
  and the dependency would have to extend Obsidian's shared moment instance.
- **Canvas files as journal notes.** `FileManager.processFrontMatter` returns
  immediately for any non-`.md` file (verified in Obsidian 1.13.7), so a canvas
  can never carry the journal claim every consumer reads.
- **iOS share sheet, and the date-property link button.** No API for either: a
  share target ships in the app binary, and the property widget is built only
  when the core `daily-notes` plugin is enabled and calls straight into it.
- **Editable rows in a note stream.** The surface is #119 and it renders read-only.
  Daily Notes Editor buys inline editing by mounting a real editor leaf per note —
  Hover Editor's `nosuper(HoverPopover)`, a hand-built `WorkspaceSplit`, and
  `around()` patches on `Workspace.prototype` and `WorkspaceLeaf.prototype` — and
  22 of its 55 issues come from that, nine still unfixed (four open, five closed
  `not_planned`), and its fixes do not hold: its #46 closed `completed`, then the
  identical report as its #73 closed `not_planned` a year later. None of it is
  reachable below e2e.
- **Weekend-as-one-note.** Day journals have no weekday filter and custom
  intervals tile at fixed length. Belongs to #198.
- **Ribbon menu labels, cursor placement, weekday label format, hotkeys to page
  the calendar view.** Each small, each with a workaround, none with demand in
  this project's tracker.

## Where this came from

A pass on 2026-09-08 over the Periodic Notes tracker (235 issues) and the
Calendar tracker (307 issues), open and closed, plus the registry sweep described
above. It produced #351 (day-start offset), #352 (CLI handlers), #354 (Periodic
Notes settings import), #355 ("On this day"), #356 (referenced-date decoration
condition) and #357 (task done-semantics), and the migration sections in
`README.md`.

Both incumbents are unmaintained — Calendar #418 (2026-09-01) offers a handover
or takedown, and #417 reports a crash that breaks the plugin on non-English
locales — so their trackers are a finished seam rather than a recurring source.
The plugins above are the live one.

One method note worth keeping: counting demand by title keyword invented a
four-issue "locale cluster" that was one ambiguous request plus three asks for
something already shipped. Read the bodies before classifying.
