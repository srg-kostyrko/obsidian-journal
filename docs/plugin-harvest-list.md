# Plugin harvest list

A standing list of Obsidian plugins worth mining for ideas, with what to look for
in each. It is a working queue, not a report: pick a row, examine it, write the
verdict back.

The rows were assembled on 2026-09-08 from download counts, descriptions and
issue-tracker mentions. A row still marked `not examined` has never been opened:
what that plugin actually does, and whether the idea is any good here, is the
work still to do.

The original 2026-09-08 rows were all worked through by 2026-09-10; the rows
carrying `not examined` today are the **rebuilt queue** added that same day, once
the first sweep's download floor was found and removed. Start with those.

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

Join on plugin `id`, filter `name + description` on two vocabularies, then
**classify the whole result — do not sort by downloads and read the top**:

- **time words** — calendar, journal, diary, daily note, periodic, timeline,
  habit, planner;
- **measurement words** — track, streak, count, logging, stats, statistic,
  metric, progress, tally, heatmap, contribution.

Both are required, and the second was missing until 2026-09-10. See the
vocabulary note under [Where this came from](#where-this-came-from) for what it
cost.

The 2026-09-08 sweep did sort and read the top, and it cost the list roughly 300
rows. Every registry row it produced is 12,231 installs or more, which is not a
threshold anyone chose: it is where reading stopped. The 2026-09-10 re-run found
343 plugins in the domain after noise-filtering, 315 of them never opened.

**Sorting by installs is a popularity prior, and for this list it points the wrong
way.** The list mines _design ideas_. A 200-install plugin is one person's
opinionated answer to a design question, which is the artefact wanted; installs
measure distribution, packaging and age. The highest-yield rows so far bear this
out — stickers came from a 25★ plugin, the streak-engine findings from a 27★ one
with no published releases at all, while several million-install rows returned
`nothing new`. Read the small ones.

For plugins **not** in the registry (BRAT and GitHub-only), take the `repo` field
of every registry entry as an exclusion set and diff it against
`gh api "search/repositories?q=obsidian+<term>&sort=stars&per_page=100"` for
calendar, journal, daily notes, periodic notes, diary, habit tracker, and the
`topic:obsidian-plugin` variants. Vary `sort` between `stars` and `updated` —
each returns a different 100, which is the cheapest way around the truncation.

**Then filter by `manifest.json`.** This is the step that makes the GitHub half
usable: repository search for these terms returns mostly _vaults, note templates,
dotfiles, CLI scripts, MCP servers and VTT importers_, not plugins.
`gh api repos/<repo>/contents/manifest.json` settles it in one call each. The
2026-09-10 run went 60 queries → 828 non-registry repos → 130 plausible by
description → **60 actual plugins**.

Expect this half to yield much less than the registry half, and budget it
accordingly. Of those 60, all but a handful were ≤41★ personal projects, and the
sweep produced one cluster row plus a reference — against 22 rows from the
registry pass the same day. Its real value is that BRAT-only plugins are where
someone builds an idea nobody has shipped yet, so it is worth running, just not
worth running first.

Known blind spots in both passes: descriptions and topics only, never READMEs;
English vocabulary, so CJK-described plugins never surface; repository search
truncates at the top 100 per query.

## Surfaces we do not have

The highest-value table. Each row is a capability with no equivalent here and, in
most cases, no issue either.

| Plugin                                |                        Installs | Harvest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status                  |
| ------------------------------------- | ------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Daily Notes Editor                    |                          42,469 | Editing a stream of daily notes inline on one page, Roam-style. Three plugins and ~85k installs converge on this; we have no multi-note reading surface at all                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | scoped → #119           |
| Daily Note Outline                    |                          24,776 | An outline across several daily notes — headings, links, tags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | scoped → #119, #356     |
| Daily Notes Viewer                    |                          18,251 | Several recent daily notes on one page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | scoped → #119           |
| `Ordeeper/obsidian-journaling-plugin` |                   72★, archived | Same idea, Logseq-style, but the same **mechanism as Daily Notes Viewer** — 442 lines that rewrite a real `Journaling.md` of `![[embeds]]` per folder on a 15s `setInterval`. Its tracker re-confirms the costs already on #119 rather than adding any                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | nothing new             |
| Heatmap Calendar                      |                         174,912 | A year-scale density view. Our decorations are cell-scale only — there is no way to see a year of activity at once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | idea → #366, #367       |
| Habit Tracker 21                      |                          33,367 | Streaks and habit grids. Calendar #352 asked for the "unbreakable chain"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | idea → #368             |
| `yirsi/obsidian-habit-heatmap`        |                             27★ | Habit tracking rendered as a GitHub heatmap. A **source-only read** — its one issue is an install failure, since the repo publishes no releases. The yield was its streak engine (the loop iterates notes, so a missing day is never a miss) and its write affordance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | idea → #367, #368       |
| Yearly Glance                         |                          12,231 | A curated register of birthdays, anniversaries and holidays, lunar dates included. The **grid** we have — `calendar-timeline` in `calendar` mode is the same twelve decorated months; the **named dated thing** we do not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | idea → #373, #356       |
| Heatmap Tracker                       |                          47,790 | **The live successor to Heatmap Calendar**, which #366 and #367 are both built on. The yield was its **Export tab** — ~2,400 lines that compile a date range's notes into a Markdown or self-contained HTML report — which no row predicted and which raises the _Periodic review and synthesis_ cluster below from a curiosity to a real surface. Its streak engine and the `excludeFalsy` saga (its #67 → #80 → #72) settle three things on #367. The four leads this row used to name were duds: cell-click-to-open (its #113) asks for a setting we answer with modifiers (`define-open-mode.ts`), unfilled days (its #87) was a documentation miss, and the seven-issue date-offset cluster (its #7, #25, #29, #35, #38, #81, #103) is entirely self-inflicted — `new Date()` over a filename, mixed with UTC — which journal-owned name templates make unreachable here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | idea → #378, #366, #367 |
| Contribution Graph                    |                          60,865 | The other big heatmap, and it just came back from a two-year release gap (0.10.0 in 2024-09, 0.11.0 on 2026-09-08, whose headline fix was replacing luxon with Obsidian's moment to settle its timezone bugs). The row's "shades by **file activity**" premise holds but splits: _created_ is durable, _modified_ is **lossy by construction** and cannot work — `mtime` is one scalar per file, so editing a note erases its earlier contributions, reported four times (its #74, #90, #109, #112) and answered by the maintainer with the line worth keeping, that a heatmap computes statistics and has no way to write data. Its #122 shows sync rewriting `ctime` too. The yield was that plus the cell-period parameter (its #98, #106)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | idea → #366, #375       |
| `pyrochlore/obsidian-tracker`         |                 362,705, 1,953★ | **The largest plugin in this domain after the incumbents**, found 2026-09-10 by a filter the earlier sweeps never ran. It **corroborates and sharpens #367's cadence taxonomy rather than overturning it** — the warning this row used to carry was discharged, not confirmed. The yield was an axis beneath all three cadence models: its whole streak engine is one truthiness test (`expr.ts:175`), so `null`, `0` and `false` are the same thing, and seven threads over five years are people asking for a period that neither extends nor breaks a run (its #250, #175, #180, #198, #299, #253). Four amendments to #367 — predicate arity, streaks over non-day periods (its #118) with the conflation to avoid, one evaluation of the predicate rather than two (its #184, #198, #60, #364), and "current" meaning as of today rather than as of the last note (its #489, #176). Three to #364: the lifted **text mark** is the most-demanded style (its #24, #156, #354, #522) and the most expensive, since `renderIcon` is `getIcon` and no style arm renders text; the discrete value-to-appearance map (its #105, #460, #463) is already N `property eq` decorations. Every one of those is a consequence of not owning the calendar, which is the boundary to keep. **Maintainer changed**: pyrochlore went quiet around 2023 and `lazyguru` now holds write access and is releasing (1.19.0, 2026-04), so "never shipped" here means asked-and-not-built, not a dead repo. Its `src/heatmap.ts` is an abandoned 2021 stub and its #24/#86 end with the maintainer deferring to Heatmap Calendar — a data point for #366. Duds, so they are not re-chased: its less-than / invert / break-a-bad-habit cluster (its #195, #246, #253, #225) is answered by our typed `propertyCondition`, its date-in-folder-hierarchy cluster (its #122, #285) by journal-owned name templates, and its annotation overflow (its #111) by our `+N` badge | idea → #367, #364       |
| Writing-activity and streak engines   | 32,941 + 25,418 + 6,108 + 4,654 | `Keep the Rhythm` (_"watching your word count go up is all the motivation you need"_), `Daily Stats` (_"track your daily word count"_, and the plugin Contribution Graph's #88 sends people to), `Tracker+` (a successor speaking `Tracker` Markdown), `YourPulse` (_"like your Github profile, but for your vault — daily streak, average daily word count"_, and what a commenter on Contribution Graph's #107 recommends over it). The same sub-sweep as the row above. All four measure **writing** over time rather than notes over time, which is the one shade source #366 lists that we cannot compute — worth knowing whether that is a gap or a boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | not examined            |
| Life-in-weeks and linear-year grids   | 4,422 + 1,734 + 696 + 415 + 124 | `Linear Calendar`, `Life in Weeks Calendar`, `Linear Year Map`, `Life in Weeks`, `My Life Calendar`. A year or a lifetime as one **linear** run of cells rather than a month grid. **Re-annotated 2026-09-10:** not necessarily a separate layout question — Contribution Graph's #106 asks for exactly this (a 90×52 week matrix, citing Wait But Why) as a feature of a _heatmap_, and its #98 asks for a week cell for an unrelated reason, so the cell period is a parameter of #366 rather than a different grid. Whether the linear layout is a mode of that block or its own surface is what this row is now for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | not examined            |
| Thino                                 |                         430,370 | Memo capture plus a sidebar heatmap, and the largest plugin in this whole domain. **Closed source**, so it is a behaviour-and-tracker read only. Bears on #377                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | not examined            |

## Direct overlap — what a migrating user compares us against

| Plugin                                     |                            Installs | Harvest                                                                                                                                                                                                                                                                                                                                    | Status              |
| ------------------------------------------ | ----------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Notebook Navigator                         |                             947,297 | Since 2026-01 its calendar covers day→year with per-type folders, patterns and templates, so it is now a migration destination for **our** users, not only Calendar's — two of its issues are ours by name                                                                                                                                 | idea → #370         |
| Calendar                                   |                           3,082,484 | The incumbent. Unmaintained; its tracker is already mined, see [below](#where-this-came-from)                                                                                                                                                                                                                                              | mined 2026-09-08    |
| Periodic Notes                             |                             754,036 | The other incumbent, likewise mined                                                                                                                                                                                                                                                                                                        | mined 2026-09-08    |
| Chronology                                 |                              68,684 | Calendar plus a timeline of note creation and modification                                                                                                                                                                                                                                                                                 | scoped → #366, #355 |
| `mattmaiorana/calendar-plus`               |                         10★, active | The only plugin a user publicly described as replacing **both** incumbents. Open this one first                                                                                                                                                                                                                                            | idea → #364         |
| `Lam-L/ObJournal`                          |                       78★, unlisted | Journal-style list, month view, **On This Day**, image gallery. A **source-only read** — its tracker is one issue titled "Great work", so it is evidence of what an implementer builds unprompted, never of demand. The yield was its stats bar and its On This Day surface                                                                | idea → #367, #355   |
| `luiisca/obsidian-periodic-notes-calendar` |                       25★, unlisted | Periodic notes daily→yearly with a calendar interface — a BRAT-only direct replacement. Its format subsystem is answered here twice over (`useInvertibilityCheck`, bulk add's arbitrary `dateFormat`, `{{date+1w<endOf=week>}}`); the yield was its **stickers** — an emoji tag authored from the date cell                                | idea → #364, #376   |
| OZ Calendar                                |                              22,147 | A calendar driven by any YAML date key — the approach we already take, worth comparing                                                                                                                                                                                                                                                     | idea → #356         |
| Daily notes calendar                       |                              19,085 | Feature-for-feature the closest thing to us: day→year notes, configurable name and folder formats, date-math template variables, a created-on-date listing. Nearly all of it already answered here — the yield was the one condition it has and we do not                                                                                  | idea → #375         |
| Journal Review                             |                              21,911 | "What happened today last year" — the exact feature in #355, already shipped by someone else                                                                                                                                                                                                                                               | idea → #355         |
| Diarian                                    |                        11,452, 115★ | All-in-one journaling toolkit, active. Dots per note on each day tile, the day's first attached image on the tile, an **interval-based** "on this day" (every 3 months rather than anniversaries), emoji ratings from a property, an importer from the Diarium app, and a date-format converter for pre-existing notes                     | not examined        |
| Prisma Calendar                            |                              28,064 | _"Turns any note with a date into a flexible planning system… no rigid schemas."_ The property-date approach again, at scale. Above the old reading floor and skipped anyway                                                                                                                                                               | not examined        |
| Obligator                                  |                              12,981 | _"A fully featured replacement for the built-in daily notes plugin"_, working as a virtual bullet journal. A direct-overlap row that was never opened                                                                                                                                                                                      | not examined        |
| Periodic-note calendar tail                |         ~15 plugins, 133–6,955 each | `Calendar for Daily Notes`, `CalendarZ`, `Calendar Panel`, `Chrono Notes`, `Periodic Calendar`, `Period Calendar`, `FlexiCal`, `Mantle Calendar`, `Almanac`, `Calendar Note View`, `Calendar of Notes`, `Note Diary`, `Vault Calendar`, `Link Calendar Navigator`, `Daily Preview Calendar`. One pass over the cluster, not fifteen passes | not examined        |
| Note-storage models                        | 7,839 + 4,662 + 2,272 + 2,130 + 842 | `Single File Daily Notes` (every day in one file), `Journalyst` (topic-specific journals), `Folder Periodic Notes`, `Streams` (several parallel daily-note streams), `Multiple Daily Notes` (several notes per day, with a past-midnight offset → #351). Shapes our one-note-per-period model cannot express                               | not examined        |

## Tasks and dates

Bears on the tasks epic (#344) and its phases.

| Plugin                            |                            Installs | Harvest                                                                                                                                                                                                                                                                                                                | Status                         |
| --------------------------------- | ----------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Tasks                             |                           4,197,016 | The de facto task vocabulary we have to stay compatible with                                                                                                                                                                                                                                                           | scoped → #357                  |
| TaskNotes                         |                           1,404,982 | Note-per-task with calendar and time tracking; named in #344                                                                                                                                                                                                                                                           | scoped → #349                  |
| Day Planner                       |                             879,727 | Time blocks on an editable timeline, sourced from daily notes                                                                                                                                                                                                                                                          | scoped → #350                  |
| Rollover Daily Todos              |                             148,695 | Rolling unchecked boxes into today's note — this is #73, and the largest single-feature demand signal found                                                                                                                                                                                                            | idea → #348, #351              |
| Review                            |                              64,817 | Adding a link to the current note into a _future_ daily note                                                                                                                                                                                                                                                           | idea → #372, #348              |
| `702573N/Obsidian-Tasks-Calendar` |                      949★, unlisted | Dataview-driven task calendar with more stars than most listed plugins — how much of this domain ships as Dataview views rather than plugins                                                                                                                                                                           | nothing new                    |
| Time Ruler                        |                              64,073 | Drag-and-drop scheduling combining a task list with a calendar                                                                                                                                                                                                                                                         | scoped → #344, #350, #349, #70 |
| Rollover cluster                  | 7,122 + 4,302 + 2,474 + 1,252 + 348 | `Auto Tasks`, `Nested Daily Todos` (carries over grouped by header, with nesting), `Rollover Weekly Todo`, `Task Mover`, `Rollover Daily Todos with Context`. Five more converging on #73/#348 beyond the one already listed — the header-grouping and "with context" variants are the part that is not already scoped | not examined                   |

## Platform questions

| Plugin                          |                          Installs | Harvest                                                                                                                                                                                                                                                                      | Status            |
| ------------------------------- | --------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Calendar Bases                  |                           111,366 | A calendar layout over Obsidian's Bases. #344 concluded Bases cannot help _tasks_ because checkbox items are not cached as properties — that does not extend to notes-with-dates, which is what these render. Needs a deliberate position                                    | idea → #369       |
| Notion Bases                    |                            20,943 | **Not a Bases question.** A Notion-database clone competing with core Bases — its own engine, `minAppVersion` 1.8.7, predating Bases; nothing in it bears on #369. Its value here is the carrier: its rows are notes whose date is a frontmatter property and never the path | idea → #374, #356 |
| Bases cluster                   | 4,752 + 3,644 + 1,888 + 953 + 427 | `Journal Bases` (Base views for journaling and periodic reviews), `Note Database`, `Bases heatmap view`, `Power Bases`, `Yabacavi`. #369 needs a position on Bases and this is the evidence base for it — five plugins beyond the two already listed                         | not examined      |
| Local REST API - Periodic Notes |                             1,514 | Adds daily→yearly endpoints to the Local REST API plugin. The external-integration question from the other side of #377, and it bears on [`docs/plugin-api.md`](plugin-api.md)                                                                                               | not examined      |

## Capture and input

Lower priority; listed because the pattern recurs and we have no capture story.

| Plugin                                              |                                   Installs | Harvest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Status                    |
| --------------------------------------------------- | -----------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Natural Language Dates                              |                                    516,996 | The most-linked plugin across both incumbent trackers. Bears on #192                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | scoped → #192             |
| Jump-to-Date                                        |                                     21,797 | A popup calendar purely for navigation — 673 lines registering two commands. Its typed-date half is #192's third bullet; the plain half is ruled out below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ruled out — see below     |
| Daily Named Folder                                  |                                     29,663 | Folder-per-day layouts. Answered by the **folder template**, not by notelets: `folder: "Journal/{{note_name}}"` puts each note in a folder of its own name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | nothing new               |
| Influx                                              |                                     30,918 | Aggregating backlinked clippings into a footer. Bears on #356 directly, not just adjacently: frontmatter links are a separate cache it has to merge by hand, and its excerpt-scoping issues are the argument for keeping that condition a count                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | idea → #356               |
| `SamSongAI/Trace`, `jameesy/obsidian-quick-capture` |                                   22★, 25★ | System-level quick capture into the daily note. **Neither is an Obsidian plugin** — Trace is a native macOS app, quick-capture a Raycast extension. Capture always lives outside Obsidian, so the yield is making our path resolution callable from outside                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | idea → #377               |
| Capture-into-the-daily-note cluster                 |                    ~15 plugins, 86–430,370 | `Thino` (430,370), `Journal Partner` (8,432), `Telegram Inbox` (6,776), `Memos Sync` (3,874), `Wrot` (3,490), `WeChat Diary`, `Quick Memo`, `Spark Memo`, `Interstitial Journal`, `Memos View`, `Kotonoha`, `Themed Journal Capture`, `Shiju`, `Omnichannel Diary`, `Feishu Diary`. The single largest convergence in the whole registry sweep, and the direct evidence base for #377 — several of them capture from **outside Obsidian** (Telegram, WeChat, Feishu bots)                                                                                                                                                                                                                                                                             | idea → #377, not yet read |
| Automatic creation and backfill                     |    6,347 + 6,099 + 2,389 + 655 + 521 + 518 | `Auto Periodic Notes`, `Auto Journal`, `Daily note creator`, `Auto Daily Note`, `Daily Notes Automater`, `Daily Note Plus`. Six plugins for automatic creation, which we already have. The one distinct idea is **Auto Journal's backfill** — creating the notes for days Obsidian was never opened. That is not the ruled-out rolling horizon below: this fills the past, not the future                                                                                                                                                                                                                                                                                                                                                             | not examined              |
| Rotating and random prompts                         |                        8,162 + 1,463 + 328 | `Random Structural Diary` (_"pick random questions from a prepared list and answer different questions each time"_), `Daily Prompt`, `Daily Journal Plus`. Our Questions ask the same set every time; these rotate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | not examined              |
| Importers from outside Obsidian                     |                           3,490 + 182 + 86 | `Day One Importer`, `Apple Journal Importer`, `Journalistic Importer`, plus Diarian's Diarium importer and its date-format converter. #354 covers importing another _plugin's_ settings; this is importing another _app's_ journal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | not examined              |
| Emoji and mood decoration                           |        25,981 + 711 + 355 + 217 + 151 + 91 | `Mood Tracker`, `Better Bujo` (bullet-journal markers: events, migration, future log, emotions), `Better Calendar` (_"mark days that match your own highlight rules"_), `Mood Calendar` (_"a mood emoji displayed beneath"_ each day), `Mood Quarter Calendar` (custom SVG faces), `Simple Calendar` (_"a minimal calendar you can lightly decorate"_). The lifted-value consumers #364 is about                                                                                                                                                                                                                                                                                                                                                      | not examined              |
| Habit and streak tail                               |                     ~17 plugins, 54–11,529 | `Habit Calendar`, `Easy Tracker`, `Daily Routine`, `Tiny Habits`, `Kikijiki Habit Tracker`, `Habit Tracker Dashboard`, `Habit Check-in`, `Square`, `Atomic Tracker`, `Banshan`, `Routine Streaks`, `Pixel Habits`, `Property Streak`, `Streak Heatmap`, `YACHT`, `Habit Heatmap Calendar`, `Pix Vault Habits`. One cluster pass for #367/#368, not seventeen. **`Streak Heatmap` first**: _"click a day to mark or unmark it"_ is a third answer to #368's write-affordance question                                                                                                                                                                                                                                                                  | not examined              |
| Note-stream tail                                    |                     ~11 plugins, 116–4,643 | `Daily Notes Timeline View`, `Journal View` (_"one continuous, editable journal"_), `Dayframe`, `Diary View`, `Today Pane`, `Memos View`, `Timeflow Periodic`, `Better Daily Notes` (infinite scroll), `Daily Preview Calendar` (previews inside day cells), `Day Echo`, `Simple Journal`. #119's cluster is eleven plugins larger than the three it was scoped from                                                                                                                                                                                                                                                                                                                                                                                  | not examined              |
| "On this day" cluster                               | 4,807 + 1,528 + 556 + 324 + 159 + 105 + 70 | `Reflection`, `LongtimeDiary`, `On This Day I`, `Yearly Diary Comparator`, `Daily Echoes`, `Daily Note Lookback`, `Time Canvas`. Seven independent implementations beyond Journal Review and Diarian, and they do not agree on the window — anniversaries, "this week/month/quarter in past years", and fixed intervals are three different features under one name. Bears directly on #355's open questions                                                                                                                                                                                                                                                                                                                                          | not examined              |
| Periodic review and synthesis                       |                        838 + 184 + 84 + 62 | `Review Builder` (_"combining many Daily and Weekly notes"_), `Periodic Notes Synthesizer`, `Journal Recap`, `Confidant`. Generating a weekly/monthly review note _from_ the period's notes. Distinct from the note-stream surface and from the period-window idea ruled out below. **Raised in priority 2026-09-10:** the Heatmap Tracker pass found a 47,790-install plugin shipping exactly this as a ~2,400-line Export tab, so the four small installs here understate the surface. Read these four before designing #378                                                                                                                                                                                                                        | not examined              |
| BRAT-only tail (2026-09-10 GitHub sweep)            |                 60 confirmed plugins, ≤41★ | The whole non-registry half, and it is thin. Worth a single pass over the few that are not already covered by a registry row: `Real1tyy/Periodix-Planner` (24★, _"automatic periodic notes + time budgets"_ — same author as the registry's Prisma Calendar), `TheMMstick/obsidian-linear-calendar` (3★, weekday-aligned year-at-a-glance), `aurelien81/continuous-journaling` (2★, #119 again), `tariquesani/obsidian-merge-dailynotes` (3★, merge a date range into one note), `chippy1402/otd-photo-gallery` (2★, "on this day" for photos), `Haoo-7/Obsidian-Dayline` (2★, moods/weather/photos on a timeline), `frankolson/obsidian-tomorrows-daily-note` (36★, creates **tomorrow's** note — narrower than the ruled-out rolling horizon below) | not examined              |
| Collect today's work into today's note              |     15,902 + 2,127 + 412 + 302 + 163 + 118 | `List Modified` (_"link all modified files meeting certain criteria to a daily note"_), `Daily Note Collector`, `Atoms`, `Easy Link to Daily Note`, `Diary Linker`, `LJ OS` (git activity snapshots). The inverse of every other row here: not "show me the day", but "write what I did today **into** the day's note". We have no surface that writes a summary of anything into a note                                                                                                                                                                                                                                                                                                                                                              | not examined              |
| Daily-note plumbing and navigation                  |                     ~13 plugins, 37–10,291 | `Daily Note Pinner`, `Daily Note Navbar`, `Daily notes opener` (also _"quick append new line to"_ → #377), `Upcoming`, `Previous Daily Note`, `Daily Day Nav`, `Weekday Commands`, `Monthly notes`, `Daily Notes Prefix Matcher`, `Pinned Daily Notes`, `Daily Checkbox Focus`, `Daily Note Icon`, `Open File by Magic Date`. Almost certainly `nothing new` — these are our commands, nav block and view — but the cluster is worth one pass to confirm, and it is the best available census of what people bolt onto a bare daily note                                                                                                                                                                                                              | not examined              |
| Folder and structure utilities                      |      3,581 + 2,498 + 1,209 + 741 + 29 + 25 | `Journal Folder`, `Templated daily notes`, `Organized daily notes` (Year/Month/Week hierarchies), `Daily Note Structure`, `Journal Creater`, `Daily Notes from Others`. Folder templates and note templates are ours already; the row exists so that claim is checked rather than assumed                                                                                                                                                                                                                                                                                                                                                                                                                                                             | not examined              |
| In-note journaling markup                           |               4,693 + 538 + 212 + 102 + 75 | `BuJo Bullets` (alternate checkbox types for bullet-journal notation), `Journal Mode` (washi-tape dividers, animations), `Color Marker`, `Property Annotations` (inline annotations for properties in daily notes), `Time Logger`. Decoration _inside_ the note rather than on the calendar — a surface this plugin deliberately does not touch, and the row is here to record that boundary rather than to cross it                                                                                                                                                                                                                                                                                                                                  | not examined              |
| `Canvas Daily Note`                                 |                                      3,567 | Puts a live node for today's note on a canvas. Worth one look against the ruled-out **canvas files as journal notes** entry below: that ruling is about a canvas _being_ a journal note, and this is the opposite direction — a canvas _referencing_ one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | not examined              |

## Deliberately not harvested

Niche calendar systems, each served by an active specialist: Chinese Calendar
(15,758), Dust Calendar (15,026), `karfekr/obsidian-persian-calendar` (129★),
and from the 2026-09-10 sweep `Japanese Calendar` (4,060, wareki and rokuyo),
`Note Calendar` (1,399, lunar dates and solar terms), `Open Taiwan Calendar`,
`Mix Calendar`, `Eleven Days`. Each needs domain knowledge this project does not
have, and the niches already have maintained answers. See the non-Gregorian entry
below.

**Event calendars.** A large, high-install group renders _events_ — from ICS
feeds, Google Calendar, or event properties — rather than notes-for-periods:
`Full Calendar` (460,069), `Tasks Calendar Wrapper` (74,064), `Big Calendar`
(66,213), `ICS Calendar` (30,923), `Markwhen` (45,031), `MD Calendar`,
`Schedule Calendar`, `Itinerary`, `MagicCalendar`, and every `* Calendar Sync`
row. They answer "what is happening at 3pm", which this plugin does not attempt.
The 2026-09-08 sweep excluded them too but never wrote it down, so the exclusion
got re-made by hand each time. It is written down now. The one thing worth
watching is where an event calendar starts _writing period notes_ — `Full
Calendar` is the row to re-check if that ever happens.

**Storytelling and fictional timelines** (`April Automatic Timelines`,
`Chronos Timeline`, `Timelines (Revamped)`, `StoryLine`, `Calendarium`), and
**activity dashboards that measure the vault rather than the journal**
(`Activity Heatmap`, `Vault Pulse`, `Note Heatmap`, `Cognitive Glow`,
`File Heatmap`, `Edit History Heatmap`, `Visit History`, `Knowledge Heatmap`,
`YourPulse`, `Wordflow Tracker`, `Daily Writing Stats`). The second group is
worth one line in #366 as a contrast — they shade by **file mtime**, we would
shade by note content — but they are not rows.

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
- **A note-stream window anchored to the host note's own period.** The one
  candidate from the `Ordeeper/obsidian-journaling-plugin` pass: a #119 fence in
  a monthly note streaming the days inside that month, the way that plugin's
  users faked it with a folder-per-year include path (its #3 and the rollup
  request commented on it). Declined 2026-09-10 — #119's timeframe stays
  relative.
- **Weekend-as-one-note.** Day journals have no weekday filter and custom
  intervals tile at fixed length. Belongs to #198.
- **Ribbon menu labels, cursor placement, weekday label format, hotkeys to page
  the calendar view.** Each small, each with a workaround, none with demand in
  this project's tracker.
- **A "jump to a date I pick" command.** Jump-to-Date's whole product, and every
  piece of it already exists here — `datePickerModal` is opened from
  `insert-journal-link.flow.ts`, a toolbar `ButtonItem` and a settings field,
  just never from the palette; every command's date comes from today or the open
  note. Declined for the same reason as the paging hotkeys above: the calendar
  view is the workaround, and the demand is 21,797 ecosystem installs rather
  than anything in this tracker. The typed-entry half stays with #192.

  Worth keeping from that pass: their nldates-dependent command is **not
  registered at all** when the dependency is missing, rather than registered and
  guarded. Since `CommandRegistration.check` filters the palette only — a ribbon
  click or bound hotkey reaches `execute` regardless — not registering is the
  stronger form for a command that cannot work without an optional plugin. Their
  version's cost is that installing the dependency later leaves the command
  missing until restart.

## Not plugins, but worth knowing

Artifacts the sweeps turned up that are not harvest rows and should not be filed
as ones.

- **`liamcain/obsidian-daily-notes-interface`** (110★, last commit 2026-05). The
  shared library Calendar, Periodic Notes and a long tail of others use to
  resolve "where is the daily/weekly/monthly note". It is the closest thing this
  ecosystem has to an interop contract for periodic-note paths, which makes it
  the reference for #354 (importing Periodic Notes settings) and for #377 (an
  external tool that wants our path resolution). Read it before designing either.
- **`liamcain/obsidian-calendar-ui`** (38★) — the UI package behind the Calendar
  plugin, if its rendering behaviour ever needs settling precisely.
- **`quanru/obsidian-example-lifeos`** (1,140★) — a _vault_, not a plugin:
  P.A.R.A. composed with Periodic Notes. The most-starred thing in the domain
  outside the registry, and evidence of how people assemble periodic notes when
  no single plugin does it for them.
- **`702573N/Obsidian-Tasks-Timeline`** (519★) — sibling of the already-harvested
  `Obsidian-Tasks-Calendar`; same Dataview-view-not-a-plugin shape.

## Where this came from

**The list was rebuilt on 2026-09-10.** The registry sweep was re-run without the
download floor described under [Refreshing the list](#refreshing-the-list): 7,452
registry entries, 343 in the domain after noise-filtering, **315 of them never
opened by the first sweep**. The rows added that day are the clustered result —
where many plugins converge on one idea they are one row, because the convergence
is the evidence and fifteen separate passes would produce fifteen shallow
verdicts. Nothing in that batch has been examined yet.

**The arithmetic, so the next sweep can check it.** The registry pass produced 343
domain plugins, 28 already listed, 315 new. Those 315 resolve as:

- **159 named explicitly in the rows above**, most inside a cluster row rather
  than on a row of their own.
- **137 excluded by category**, counted rather than waved at: 36 that sync an
  external service into the daily note (Toggl, Strava, Things, Granola, Immich,
  Telegram, Garmin…), 29 domain trackers (food, fitness, money, media, study,
  faith), 27 task and project managers, 22 vault-wide dashboards and activity
  meters that measure the vault rather than the journal, 14 AI assistants over
  the journal, and 9 event calendars.
- That leaves **19 unaccounted for**, and the honest reason is that a cluster row
  names _exemplars_, not every member: several of the 19 (`Daymark`,
  `Quick Daily Note`, `Mood Journal`, `Memo Lite`, `Life Journal`,
  `Banshan Habits Tracker`, `Daily Habit`, `Writing Habit`) belong to the mood,
  habit and capture clusters and will be picked up when those rows are worked.
  The genuine leftovers are out of domain — `Password Protection`, `Geulo`,
  `HikerScrolls`, `Tag Lens`, `Solomon Chat`, `askMyu`, `AccountingCalendar`,
  `On This Day in History` (fetches Wikipedia, not your notes).

So the cluster rows are the unit of work, and a name that appears in one is an
example of the cluster rather than the boundary of it. Work the cluster, not the
list of names in it.

If a future sweep's numbers do not add up like this, the difference is rows that
were dropped without a decision — which is the failure mode that cost this list
300 rows the first time.

One caution about the exclusion buckets: they were produced by keyword matching
and the first attempt was wrong in a way worth remembering — a substring test for
`ai` matched **d-ai-ly**, inflating the "AI assistant" bucket from 14 to 86.
Match on word boundaries and read the resulting lists before trusting a count.

The GitHub half ran the same day: 60 queries across the terms and both sort
orders, 828 non-registry repositories, 130 plausible by description, 60 with an
actual `manifest.json`. It produced the BRAT-only tail row and the reference
section above, and nothing else — which is the calibration to keep for next
time.

A pass on 2026-09-08 over the Periodic Notes tracker (235 issues) and the
Calendar tracker (307 issues), open and closed, plus the registry sweep described
above. It produced #351 (day-start offset), #352 (CLI handlers), #354 (Periodic
Notes settings import), #355 ("On this day"), #356 (referenced-date decoration
condition) and #357 (task done-semantics), and the migration sections in
`README.md`.

Both incumbents are unmaintained — Calendar #418 (2026-09-01) offers a handover
or takedown, and #417 reports a crash that breaks the plugin on non-English
locales — so their trackers are a finished seam rather than a recurring source.

The plugins above are not uniformly livelier, and the split runs by table rather
than by plugin. Last releases as of 2026-09-09, for the rows examined so far:

- **Stalled.** Daily Notes Viewer 2022-04, Natural Language Dates 2023-12 (its
  README declares the repository unmaintained, the registry points at a fork
  whose org has since been renamed `community-archive`, and installs 404'd for
  part of 2026), Daily Note Outline 2024-03, Heatmap Calendar 2024-06. Daily
  Notes Editor 2025-04 and Rollover Daily Todos 2025-05 are slowing, and Daily
  notes calendar's last release was 2026-04.
- **Active.** Notebook Navigator 2026-09, Notion Bases 2026-09, TaskNotes 2026-08, Tasks 2026-08, Day
  Planner 2026-07, calendar-plus 2026-07, Yearly Glance 2026-07, Calendar Bases
  2026-04, Habit Tracker 21 2026-03. ObJournal's last release was 2026-03 and
  its recent history is Obsidian plugin-scan fixes, so it is a submission in
  flight rather than an abandoned plugin — but it has been quiet six months. `yirsi/obsidian-habit-heatmap` is a
  fortnight of commits in 2026-04/05 and nothing since, with no releases
  published at all. `luiisca/obsidian-periodic-notes-calendar`
  last released 2026-02, and is the one row so far whose tracker is mostly the
  maintainer's own development todos rather than user reports.

So **Surfaces we do not have** is mostly abandoned plugins with live install
bases, while **Tasks and dates** and **Platform questions** are maintained. That
changes what each kind of row yields. A stalled tracker is a closed record: it
can be mined exhaustively, its unfixed clusters are permanent, and the "fixes
that did not hold" pattern is legible end to end. A live tracker is a moving
target whose maintainer may ship the idea first, so a row there is worth
re-checking before acting on a verdict written months earlier.

One method note worth keeping: counting demand by title keyword invented a
four-issue "locale cluster" that was one ambiguous request plus three asks for
something already shipped. Read the bodies before classifying.

A third, from the 2026-09-10 Contribution Graph pass, and the most expensive so
far: **the domain describes itself in two vocabularies and the sweeps only ever
filtered on one.** Both sweeps matched _time_ words. A plugin that says what it
measures rather than when — `Tracker`, _"track occurrences and numbers in your
notes"_ — contains no time word in its name or description and was therefore
invisible, at **362,705 installs**: larger than Heatmap Calendar, Contribution
Graph and Heatmap Tracker combined, and the streak engine users of two of those
three cite by name.

Re-running the registry filter with measurement vocabulary added gives 524 raw
rows on time words — the same set the 2026-09-10 sweep noise-filtered down to its
343 — and **484 more on measurement words alone**.
The great majority of those 484 is noise the time filter was right to miss — task
managers, time trackers, TTRPG initiative trackers, per-file word counts, ebook
readers — but it is not all noise: `Tracker`, plus the four in the
_Writing-activity and streak engines_ row, plus `Life Tracker` (40,411, and a
**Bases view**, so it belongs to the Bases cluster and #369). Those six are rows
now.

Two cautions for whoever classifies the remaining 478. Use word boundaries — an
early pass at this claimed 23 of the 484 were already listed, which was wrong:
`Tracker` "matched" the list only because the word occurs inside _Heatmap
Tracker_, and `Linear`, `Library` and `Harvest` matched the same way. That is the
`ai` matching `d-ai-ly` mistake again, in a new place. And match on `repo`, which
is unique, rather than on `name`.

A second one, from the 2026-09-10 Heatmap Tracker pass: **a row's Harvest column
can be confidently wrong about where its own value is.** That row named four
upstream issues as "our open questions" and all four were duds — one asking for a
setting we already answer with modifiers, one a documentation miss, and a
seven-issue cluster of a self-inflicted defect we cannot have. The find was the
plugin's _Export tab_, which no row mentions, because rows are built from registry
descriptions and issue titles and that feature appears in neither. The blind spot
already recorded for the sweep — descriptions and topics only, never READMEs —
therefore applies to the **row annotations** as well, which is the stronger claim:
read the README and the source before trusting what a row says to look for, and
correct the Harvest column when the pass proves it wrong.
