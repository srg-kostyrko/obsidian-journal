# Manual Testing Checklist — Journals v3 in Obsidian

Branch: `v3-ai`. Run before tagging a beta / merging to `main`.

**How to read an item.** Each group opens with a **Setup:** preamble — do it once
for the whole group. Each `[ ]` item is one behavior: it states any extra setup
(`+`), the **action**, then the **expected** result after `→`. If an item has no
`+`, the group Setup is all you need.

Severity for bugs you log: 🔴 data loss / crash · 🟡 feature broken · 🟢 cosmetic.

## What CI already proves — run this pass in priority order

`npm run test:e2e` drives a real Obsidian against fixture vaults. Where a section
below names a spec, that ground is already covered on every run; walk it manually
only when you are investigating a specific report or the spec is red.

| Section                  | Automated by                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| §0 smoke                 | `plugin-activates`, `re-enable`                                                                     |
| §1 write types           | `custom-interval`, `weekly-midweek-start`                                                           |
| §2 config                | `confirm-creation`, `auto-attach-template`, `templater`                                             |
| §2 timeline bounds       | `timeline-bounds`                                                                                   |
| §3 lifecycle             | `delete-journal`, `colliding-journals`                                                              |
| §4 numbering             | `home-index`, `auto-attach-index`, `adoption-guard`, `adoption-guard-custom`                        |
| §5 connection            | `commands` (insert date link)                                                                       |
| §6 bulk add              | `bulk-add`                                                                                          |
| §7 commands              | `commands`, `default-commands`, `dynamic-commands`, `available-command`                             |
| §8 views                 | `view`, `view-blocks`, `view-clone`, `remember-date`, `startup-view`, `defined-navigation`          |
| §9 shelves               | `nav-off-shelf`                                                                                     |
| §10 code blocks          | `code-blocks`, `custom-interval-nav`, `home-index`                                                  |
| §13 settings             | `settings`, `settings-first-journal`                                                                |
| §14 startup / background | `startup-open`, `startup-confirm`, `auto-create`, `auto-attach`, `settings-reload`, `sync-settings` |
| §15 migration            | `legacy-upgrade`, `mid-session-enable`                                                              |
| §16 regression (locale)  | `calendar-locale`                                                                                   |
| §17 URI handler          | `uri-open`                                                                                          |

**Spend your attention where automation cannot reach.** Work the sections in this
order, not top to bottom:

1. §12 styles, §11 conditions, §19 appearance & accessibility — anything whose
   pass condition is "a human looked at it".
2. §18 error & recovery surfaces — mostly beyond automation, and the class where v3
   has historically failed silently.
3. §16 regression (theme switch, large vault, malformed frontmatter) and §0's
   mobile line.
4. §15 migration against a real user snapshot, if you have one.
5. Everything else, as a sweep, trusting the table above.

---

## 0. Setup & smoke

Setup: clone branch `v3-ai`; `npm run dev` (builds into
`test-vault/.obsidian/plugins/journals` with hot-reload).

- [ ] Dev build completes with no errors and writes `main.js`.
- [ ] Open `test-vault` in Obsidian → plugin loads, Console (DevTools) shows no
      errors.
- [ ] Disable the plugin in Community Plugins → no errors, calendar leaves close.
- [ ] Re-enable the plugin → re-initializes, default view available again.
- [ ] Reload Obsidian (Ctrl/Cmd+R) → clean re-init, no duplicate ribbon icons.
- [ ] - Open a **brand-new empty vault**, install the plugin → exactly one Calendar
      view is seeded, it opens on startup, it shows a ribbon icon, and no journals
      exist.
- [ ] First run → the seeded view explains that there are no journals yet and does
      not render a bare divider rule or an empty custom-intervals section around
      that message.
- [ ] - Open a vault with a v2 `data.json` → loads without crash (migration, §15).
- [ ] Mobile smoke: plugin loads on a mobile/tablet build (full mobile pass is §19).

---

## 1. Journal write types

Setup: Settings → Journals → **Add journal**. For each type below, create one
journal of that type, then trigger creation of "today's" entry (open it via a
command or the calendar).

- [ ] **Day** — + name template `{{date}}`, format `YYYY-MM-DD` → note created at
      `YYYY-MM-DD.md` for today.
- [ ] **Week** — + format `YYYY-[W]ww` → the week note spans Mon–Sun (per locale).
- [ ] **Week** filename → uses the week token (`ww`).
- [ ] **Month** — + format `YYYY-MM` → note covers the whole month.
- [ ] **Quarter** — + format `YYYY-[Q]Q` → note covers 3 months.
- [ ] **Year** — + format `YYYY` → note covers the year.
- [ ] **Custom, every N days** — + repeat `10 days`, anchor = a past date →
      stepping next/prev lands exactly 10 days apart, no drift over 12 steps.
- [ ] **Custom, every N weeks** — + repeat `2 weeks` → consecutive intervals are
      exactly 14 days apart.
- [ ] **Custom, every N weeks** alignment → each interval starts on the anchor's
      weekday.
- [ ] **Custom, every N months** — + repeat `1 month`, anchor = Jan 31 →
      Feb interval clamps to Feb 28/29 (month-end clamp).
- [ ] **Custom, every N quarters / years** — interval boundaries correct.

---

## 2. Per-journal configuration

Setup: create one **Day** journal "Cfg". Edit its config in Settings → Journals →
Cfg. After each change, create a _new_ entry to observe the effect. Existing notes
should be untouched — except by the start/end-date toggles, which deliberately
rewrite every connected note (see the item below).

- [ ] **Name template** with `{{date}}` → filename is the formatted date.
- [ ] **Name template** with `{{journal_name}}` → filename includes "Cfg".
- [ ] **Name template** with `{{index}}` — + numbering on (§4) → filename includes
      the number.
- [ ] **Name template** with a **shift** — `{{date+1d}}`, `{{date-2w}}` → the
      filename uses the shifted date (units `y q m w d h`).
- [ ] **Name template** with a **boundary** — `{{date<startOf=week>}}`,
      `{{date<endOf=month>}}` → snaps to that boundary.
- [ ] Boundary unit **`decade`** → snaps to the decade's first/last day.
- [ ] Shift **and** boundary together — `{{date+1w<endOf=month>:YYYY-MM-DD}}` → the
      shift applies first, then the boundary.
- [ ] **Unknown boundary unit** — `{{date<startOf=fortnight>}}` → left as-is /
      degrades, no crash.
- [ ] **Name template** with an inline **format** — `{{date:YYYY}}` → uses that
      format instead of the journal's.
- [ ] **Template body** with `{{journal_link(<journal name>)}}` → resolves to the
      target journal's note path.
- [ ] `{{journal_link(...)}}` whose target is **outside its timeline** → the token is
      left unresolved rather than producing a broken link.
- [ ] **Date format** change (e.g. `DD.MM.YYYY`) → new notes use the new format.
- [ ] **Date format** change → existing notes keep their old names (no rewrite).
- [ ] **Folder** set to `Journals/Cfg` → new note created there.
- [ ] **Folder** with a not-yet-existing nested path → folders auto-created.
- [ ] **Template** — + add `templates/daily template.md` → new note's body is the
      template content.
- [ ] **Multiple templates** listed → the _first existing, non-empty_ one wins; the
      rest are a fallback chain, not appended.
- [ ] **Multiple templates**, first path missing → falls through to the second.
- [ ] **Multiple templates**, first file exists but is empty → falls through to the
      second.
- [ ] **Templater command** — + with Templater installed, template uses a
      `<% tp.* %>` command → the command is evaluated in the new note.
- [ ] **Templater cursor jump** — + template has a cursor marker → cursor jumps
      to it after creation.
- [ ] **confirmCreation = on** → navigating to a missing entry prompts before
      creating.
- [ ] **confirmCreation = on**, then **cancel** the prompt → no note is created and
      no error is reported.
- [ ] **confirmCreation = off** → missing entry created silently.
- [ ] **Frontmatter date field** renamed → new note's frontmatter uses the new
      key.
- [ ] **Start/end date fields** on a **Day** journal → both written with the
      configured key names (these apply to _every_ write type, not just custom).
- [ ] **Start/end date fields** on a **Month** journal → values are the month's
      first/last day.
- [ ] **Start/end date fields** on a **custom** journal → values span the interval.
- [ ] Toggling **addStartDate / addEndDate** on a journal that already has connected
      notes → every connected note's frontmatter is rewritten immediately (this is
      the one config change that _does_ touch existing notes).

### Timeline bounds

Setup: edit journal Cfg → Timeline.

- [ ] **Start bound** set to a future date → navigating before it is blocked / not
      creatable.
- [ ] **End = never** → can navigate arbitrarily far forward.
- [ ] **End = fixed date** → navigation/creation stops at that date.
- [ ] **End = repeat count N** → exactly N entries reachable from start.
- [ ] **End = repeat count N** with **no start bound** → the journal stays unbounded
      (repeats need a start); a warning says so.

---

## 3. Journal lifecycle (rename / delete)

Setup: a Day journal "Life" with ≥3 connected notes across different dates, and a
command + a view block targeting it.

- [ ] **Rename** Life → "Living" → every connected note's frontmatter _name key_
      is rewritten to "Living".
- [ ] After rename → the targeting **command** still resolves (no dangling target).
- [ ] After rename → the targeting **view block** still resolves.
- [ ] **Rename to a name already taken** → rejected with an error message.
- [ ] **Rename to a name already taken** → connected notes' frontmatter left
      untouched.
- [ ] **Delete → keep notes** → note files remain, journal frontmatter intact.
- [ ] **Delete → clear notes** → files remain, journal frontmatter keys stripped.
- [ ] **Delete → delete notes** → notes moved to **trash** (recoverable), not
      permanently erased.
- [ ] Create a second journal with a **different name** but the same
      `nameTemplate` + `folder` + `dateFormat` → "colliding journals" warning shows
      in the settings dashboard. (Duplicate _names_ are rejected at creation, so
      that is not the collision trigger.)
- [ ] The same collision → the warning also shows on each colliding journal's own
      edit subpage.
- [ ] Give both colliding journals a `{{journal_name}}` name template → the
      collision clears (the name individualizes the path).

---

## 4. Numbering

Setup: Day journal "Num" → enable Numbering. Use `{{index}}` in its name template
so the number is visible in filenames.

- [ ] **Enabled** → consecutive entries increment the index by 1.
- [ ] **anchorDate** set → counting starts (index 1) at the anchor period.
- [ ] **allowBefore = on** → periods before the anchor receive numbers (negative /
      mirrored).
- [ ] **allowBefore = off** → entries before the anchor are blocked.
- [ ] **reset_after = N** → index cycles within `[anchor, anchor+N-1]` then
      restarts (v3 differs from v2 `index %= N`; confirm intended).
- [ ] **Increment / start value** → first index matches the configured start.
- [ ] The **allowBefore** toggle only appears when the journal has no timeline
      start _and_ reset is `never` — set `reset_after` first and confirm it hides.
- [ ] Set a **timeline start** (§2) → the Sequence section hides its own anchor
      picker and numbering counts from the timeline start instead.

---

## 5. Note connection

Setup: a Day journal "Conn" with a folder + name template; an arbitrary note
`Scratch.md` open.

- [ ] **Connect note** command on `Scratch.md` → pick Conn + a date → journal
      frontmatter written to the note.
- [ ] - Date already has a note → **override** prompt appears → choosing override
      replaces the connection.
- [ ] 🔴 Override **with rename+move on**, so the incoming note takes the occupant's
      exact path → the old occupant file is moved to **trash**.
- [ ] 🔴 Override **without** rename+move → the old occupant is only _disconnected_
      (frontmatter stripped); its file stays in place as an orphan. Confirm this is
      what you see — the two outcomes differ and only one deletes a file.
- [ ] - **Rename toggle on** → `Scratch.md` renamed to Conn's name template.
- [ ] - **Move toggle on** → file moved into Conn's folder.
- [ ] **Connect** on an already-connected note → button shows **Disconnect** →
      frontmatter keys stripped.
- [ ] Connect a note dated **outside Conn's timeline** → the attempt is refused with
      an explanation; the note's frontmatter is unchanged afterwards.
- [ ] **Connect note** in a vault with **no journals** → an empty-state explains why,
      with only Cancel.
- [ ] **Insert date link** command in an editor → inserts a journal/date link.
- [ ] Click the inserted link → navigates to / creates that entry.

---

## 6. Bulk add notes

Setup: create ~5 loose notes whose titles contain dates (e.g. `2026-01-05 foo.md`)
and one with a `date:` frontmatter property; a Day journal "Bulk". Open
Settings → Journals → Bulk → **Bulk add**.

- [ ] **Extract date from title** (format/regex) → matching notes detected with
      the right dates.
- [ ] **Extract date from property** → the property-dated note detected.
- [ ] **Filter by title** condition → narrows the candidate set.
- [ ] **Filter by tag** condition → narrows the set.
- [ ] **Filter by property** condition → narrows the set.
- [ ] **Two filters + combinator `and`** → only notes matching both survive.
- [ ] **Two filters + combinator `or`** → notes matching either survive.
- [ ] **Dry-run preview** → lists each note with connect/skip and a skip _reason_.
- [ ] Dry-run **off** → the run commits directly (preview-first is the v3 default;
      confirm the opt-out still works).

The three decisions below each have a **fixed** setting applied silently to every
note _and_ an `ask` setting that produces the per-note dropdown. Test both arms.

- [ ] `existingNote` fixed to **skip** → occupied dates are skipped, and the log says
      so per note.
- [ ] `existingNote` fixed to **override** / **merge** → applied without prompting.
- [ ] `existingNote` = **ask** → per-note dropdown appears.
- [ ] `otherFolder` fixed to **move** vs **keep** → applied without prompting.
- [ ] `otherName` fixed to **rename** vs **keep** → applied without prompting.
- [ ] Per-note decision **connect** → note connected on commit.
- [ ] 🔴 Per-note decision **merge** → the source's content is appended to the
      existing entry **and the source file is deleted**. Verify the deletion is what
      you expect before shipping this to users.
- [ ] Per-note decision **override** → replaces existing entry.
- [ ] Per-note **move** → file moved to journal folder on commit.
- [ ] Per-note **rename** → file renamed to journal template on commit.
- [ ] **Cancel** the flow → vault unchanged.

---

## 7. Commands — open modes, context, target

Setup: a Day journal "Cmd"; create a custom command in Settings → Commands (or
the journal's Commands section).

- [ ] New custom command appears in the **palette** with its label.
- [ ] **Icon** set + **show in ribbon** on → ribbon icon appears.
- [ ] Ribbon icon click → runs the command.
- [ ] **Open mode: active** → opens in the current pane.
- [ ] **Open mode: new tab** → opens in a new tab.
- [ ] **Open mode: split** → opens in a split.
- [ ] **Open mode: new window** → opens in a new window.
- [ ] **Context: today** → resolves relative to today's date.
- [ ] **Context: open note** → resolves relative to the active journal note (falls
      back when none).
- [ ] **Context: only open note** → only runs when a journal note is active;
      otherwise no-op/disabled.
- [ ] **Target: all journals** → acts on every journal of the filtered write type.
- [ ] **Target: specific journal** → acts only on Cmd.
- [ ] **Target: shelf** → acts only on journals in the chosen shelf (§9).
- [ ] **Target: shelf** on a shelf holding **mixed write types** → acts only on the
      members matching the command's own write type.
- [ ] **Icon** required — turn on show-in-ribbon with no icon → save is blocked with
      a "pick an icon" error.

### Command type variants (depend on write type)

Setup: one command of each `type`, targeting the relevant journal write type.

- [ ] **Built-in `Open next`** → next entry of the active journal.
- [ ] **Built-in `Open previous`** → previous entry.
- [ ] **next_available** — + gaps between existing notes → jumps to the next entry
      that _exists_, skipping the gap (not merely +1 period).
- [ ] **previous_available** → jumps to the previous existing entry.
- [ ] **next_available** with nothing ahead → an explicit "no next note" notice, not
      silence.
- [ ] **previous_available** with nothing behind → an explicit "no previous note"
      notice.
- [ ] Day journal — **same** → today's entry.
- [ ] Day journal — **next** → +1 day.
- [ ] Day journal — **previous** → −1 day.
- [ ] Day journal — **same_next_week** → +7 days.
- [ ] Day journal — **same_previous_week** → −7 days.
- [ ] Day journal — **same_next_month** → same day-of-month, +1 month.
- [ ] Day journal — **same_previous_month** → same day-of-month, −1 month.
- [ ] Day journal — **same_next_year** → same date, +1 year.
- [ ] Day journal — **same_previous_year** → same date, −1 year.
- [ ] Week / Year / Custom journal — **same** → current entry.
- [ ] Week / Year / Custom journal — **next** → +1 period.
- [ ] Week / Year / Custom journal — **previous** → −1 period.
- [ ] Month / Quarter journal — **same** → current entry.
- [ ] Month / Quarter journal — **next** → +1 period.
- [ ] Month / Quarter journal — **previous** → −1 period.
- [ ] Month / Quarter journal — **same_next_year** → same month/quarter, +1 year.
- [ ] Month / Quarter journal — **same_previous_year** → same month/quarter, −1 year.

### Command reactivity

- [ ] Rename a targeted journal → command re-targets automatically.
- [ ] Delete a targeted journal → its commands disappear from the palette.
- [ ] Delete a targeted **shelf** → its shelf-scoped commands disappear too.
- [ ] Palette entries carry their owner prefix: `<journal>: <name>` for journal
      commands, `Shelf: <shelf>: <name>` for shelf commands.
- [ ] Two different journals can both hold a command named "Open today's note"
      (uniqueness is per-owner, not global).

---

## 8. Views (calendar sidebar)

Setup: keep the default seeded **Calendar** view; have ≥1 Day journal with notes
so cells are populated.

- [ ] Run `Open Calendar` (`journal:open-view:<id>`) → the sidebar view opens with
      its seeded default block layout.
- [ ] **Leaf = left** → opens in the left sidebar on next open.
- [ ] **Leaf = right** → opens in the right sidebar.
- [ ] **Leaf = tab** → opens as a main-area tab.
- [ ] View **icon** renders in its tab/header.
- [ ] View **show in ribbon** on → ribbon icon opens the view.
- [ ] **Default shelf** set → view shows only that shelf's journals.
- [ ] **Create a new view** → appears with its own `open-view` command.
- [ ] **Rename a view** → its palette command and tab header follow.
- [ ] **Clone a view** → the copy carries every block and toolbar item, and edits to
      the copy do not affect the original.
- [ ] **Change leaf while the view is open** → a "move open view?" confirm appears.
- [ ] Confirm that dialog → the open view relocates immediately.
- [ ] Cancel that dialog → the view stays put and the setting reverts.
- [ ] **Open on startup** on a view → reload Obsidian → it opens on launch **without
      stealing focus** from the active note.
- [ ] Open-on-startup when a leaf for that view was **already restored** by
      Obsidian's saved layout → no duplicate leaf.
- [ ] **Remember last viewed date** on → navigate away from today, reload → the view
      reopens on the remembered date.
- [ ] Remember-date **off** → the view reopens on today.
- [ ] **Delete a view** → its `open-view` command disappears from the palette.
- [ ] **Delete a view** → the remaining views still open normally.
- [ ] **Delete all views** → plugin does not crash; graceful empty state.

### View blocks

Setup: edit a view → add each block type via **Add block**. Six block types are
registered: `toolbar`, `month-calendar`, `week-calendar`, `custom-intervals`,
`divider`, `markdown-template` — add every one at least once.

- [ ] **Add block** picker lists all six types.
- [ ] **toolbar** block adds and renders as an empty strip ("No toolbar items yet").
- [ ] **Reorder blocks** by drag → the new order renders and survives a reload.
- [ ] **Remove a block** → it disappears; siblings keep their order.
- [ ] A view with **no blocks** → "No blocks yet" empty state, no crash.
- [ ] **month-calendar** renders the current month grid.
- [ ] month-calendar **before = 1** → also shows the previous month.
- [ ] month-calendar **after = 1** → also shows the next month.
- [ ] month-calendar **hiddenWeekdays = Sat+Sun** → those two columns hidden.
- [ ] month-calendar **hiddenWeekdays = a single midweek day** → only that column
      is hidden (it is a per-weekday toggle group, not a weekend switch).
- [ ] month-calendar **weeks = left** → week-number column on the left.
- [ ] month-calendar **weeks = right** → week-number column on the right.
- [ ] month-calendar **weeks = none** → no week column.
- [ ] month-calendar **weeks = default** → inherits the global calendar setting
      (change that setting and confirm the block follows).
- [ ] month-calendar **show heading** off → the month/year heading is hidden.
- [ ] **Follow active note** on → opening a journal entry moves the calendar to that
      entry's period.
- [ ] **Follow active note** off → opening an entry leaves the displayed period put.
- [ ] A week number with **no week journal** still shows as an inactive label.
- [ ] **week-calendar** renders week rows (weeks/before/after behave as on
      month-calendar — spot-check one).
- [ ] **custom-intervals** lists intervals for its assigned journals.
- [ ] custom-intervals **window = month** (etc.) → lists periods at that scale.
- [ ] custom-intervals **hideEmpty** → periods with no note are hidden.
- [ ] **divider** renders a separator line.
- [ ] **markdown-template** + `templatePath` set → renders that file's markdown.
- [ ] markdown-template with **date-format tokens in the path** → resolves to a
      dated file.
- [ ] markdown-template body variables — `date`, `current-date`, `time`,
      `current-time`, `journal-link` → each substitutes.
- [ ] markdown-template `journal-link` with a **shift suffix** (e.g. `+1w`) → links
      to the shifted entry.
- [ ] markdown-template **"Supported variables" help** modal lists them.
- [ ] **Today highlight — day** → today's day cell is marked `data-today`.
- [ ] **Today highlight — week** → the week cell containing today is marked.
- [ ] **Today highlight — month** → the current month cell is marked.
- [ ] **Today highlight — quarter** → the current quarter cell is marked.
- [ ] **Today highlight — year** → the current year cell is marked.
- [ ] **Active highlight** → opening an entry marks its cell active.

### Toolbar items

Setup: edit a view's toolbar block → add each item. Five item types are registered:
`button`, `shelf-selector`, `spacer`, `period-buttons`, `defined-navigation` — add
every one at least once.

- [ ] **Add item** picker lists all five types, including the three button presets
      ("Pick date", "Open note", "Navigate by step").
- [ ] **Reorder toolbar items** by drag → the new order survives a reload.
- [ ] **Remove a toolbar item** → it disappears; siblings keep their order.
- [ ] **spacer** → pushes the items after it to the far edge of the strip.
- [ ] **defined-navigation**, direction **previous** → steps back at its configured
      target.
- [ ] defined-navigation, direction **next** → steps forward.
- [ ] defined-navigation **target = active** → follows the active note's journal
      rather than a fixed period.
- [ ] defined-navigation targets **day / week / month / quarter / year / custom** →
      each steps at that scale.
- [ ] **button → pick-date** → click opens a date picker.
- [ ] pick-date **day** level → selecting a day navigates to that day.
- [ ] pick-date **week** level → selecting a week navigates to that week.
- [ ] pick-date **month** level → selecting a month navigates to that month.
- [ ] pick-date **quarter** level → selecting a quarter navigates to that quarter.
- [ ] pick-date **year** level → selecting a year navigates to that year.
- [ ] **button → current** → jumps to the current period at its configured level.
- [ ] **button → navigate-step**, amount 1, forward → steps +1 unit.
- [ ] navigate-step amount 1, **backward** → steps −1 unit.
- [ ] navigate-step **amount = 3** → steps by 3 units.
- [ ] button **custom icon** → configured icon renders.
- [ ] button **custom label** → configured label renders.
- [ ] button **custom tooltip** → configured tooltip shows on hover.
- [ ] button **mode = select-only** → clicking moves the displayed period but opens
      nothing.
- [ ] button **mode = navigate** → opens an existing entry; a date with no note does
      nothing visible.
- [ ] button **mode = create** → opens _or creates_ the entry.
- [ ] button with **two or more levels** configured → clicking pops a menu to choose
      the level instead of acting directly.
- [ ] button **bound to a specific journal** → acts on that journal regardless of the
      view's shelf scope.
- [ ] **shelf-selector** dropdown → lists the available shelves.
- [ ] **shelf-selector** selection → re-scopes the calendar to that shelf's
      journals.
- [ ] shelf-selector selection **persists** across closing and reopening the view.
- [ ] **Delete the selected shelf** → the selector falls back gracefully rather than
      showing a dangling name.
- [ ] **period-buttons — week** toggle → shows/hides the week level.
- [ ] **period-buttons — month** toggle → shows/hides the month level.
- [ ] **period-buttons — quarter** toggle → shows/hides the quarter level.
- [ ] **period-buttons — year** toggle → shows/hides the year level.

---

## 9. Shelves

Setup: 3 Day journals (A, B, C); open Settings → dashboard → Shelves block.

- [ ] **Create** a shelf "S1".
- [ ] **Assign A → S1** via the journal's Shelf section.
- [ ] **Assign A → S2** (a second shelf) → A _moves_ off S1 (one shelf per
      journal).
- [ ] **Rename** S1 → its journal membership is preserved.
- [ ] **Rename** S1 → its shelf-scoped commands re-target the renamed shelf.
- [ ] **Delete** a shelf → its journals become unassigned, not deleted.
- [ ] **Add journal from inside a shelf's edit subpage** → the new journal is
      auto-assigned to that shelf (the Add-journal modal itself has no shelf field).
- [ ] **Delete a shelf → pick a destination shelf** → its journals move there
      instead of becoming unassigned.
- [ ] **Delete a journal** that sits on a shelf → the shelf's membership list drops
      it.
- [ ] Once any shelf exists → the dashboard's Journals block retitles to "Journals
      not on a shelf" and lists only unshelved journals.
- [ ] **Delete a shelf** that a view uses as its default → the view falls back to
      all journals (not to the delete-modal's destination shelf).
- [ ] **Delete a shelf** that a shelf-scoped command targets → the command
      disappears from the palette.
- [ ] **Shelf-scoped command** (Settings → shelf → Commands) → acts only on that
      shelf's journals.
- [ ] View **shelf-selector** set to S1 → calendar shows only S1's journals.

---

## 10. Code blocks (in notes)

Setup: a Day journal "CB" with notes, and a `navBlock`/`intervalBlock` configured
with ≥2 rows. Insert each code block in a markdown note and switch to reading/live
preview.

### journals-home

- [ ] ` ```journals-home ` with `show: [day, week, month]` → links for each listed
      period render.
- [ ] **separator** option → appears between entries.
- [ ] **scale** option → sizing changes.
- [ ] **shelf** option → limits to that shelf's journals.
- [ ] Clicking a link opens/creates the right entry.

### journal-nav (aliases calendar-nav, interval-nav)

- [ ] ` ```journal-nav ` → renders CB's configured nav rows.
- [ ] Alias `calendar-nav` → same output.
- [ ] Alias `interval-nav` → same output.
- [ ] Row variable **`{{date}}`** → substitutes the formatted date.
- [ ] Row variable **`relative_date`** → substitutes the relative date.
- [ ] Row variable **`journal_name`** → substitutes the journal name.
- [ ] Row variable **`index`** → substitutes the numbering index.
- [ ] Row style **fontSize** → text size changes.
- [ ] Row style **bold** → text is bolded.
- [ ] Row style **italic** → text is italicized.
- [ ] Row style **color** → text color changes.
- [ ] Row style **background** → row background changes.
- [ ] Row **link = self** → click opens the containing entry.
- [ ] Row **link = journal** → click opens the journal's entry.
- [ ] Row **link = day** → click navigates to the day entry.
- [ ] Row **link = week** → click navigates to the week entry.
- [ ] Row **link = month** → click navigates to the month entry.
- [ ] Row **link = quarter** → click navigates to the quarter entry.
- [ ] Row **link = year** → click navigates to the year entry.
- [ ] Row **link = none** → the row renders as plain text, not a link.
- [ ] Row variable **`{{start_date}}`** / **`{{end_date}}`** → substitute the
      period's bounds (the default custom-interval rows use these).
- [ ] Row **addDecorations on** → the journal's decorations show on the row.
- [ ] Block-level **decorate whole block** on → decorations apply to the block as a
      whole rather than per row.
- [ ] Nav block **type = create** → prev/next cycle through periods whether or not a
      note exists, and clicking creates.
- [ ] Nav block **type = existing** → prev/next only reach periods that already have
      notes.
- [ ] Edit a row via its edit-row modal → change persists in the rendered block.

### calendar-timeline

- [ ] ` ```calendar-timeline mode: week ` → renders week timeline.
- [ ] `mode: month` → month timeline.
- [ ] `mode: quarter` → quarter timeline.
- [ ] `mode: calendar` → calendar timeline.
- [ ] timeline **weeks = left** → week column on the left.
- [ ] timeline **weeks = right** → week column on the right.
- [ ] timeline **weeks = none** → no week column.
- [ ] timeline **hiddenWeekdays: [0, 6]** → those columns are hidden.
- [ ] timeline **hiddenWeekdays** with an out-of-range entry → the valid entries
      still apply, the block does not error.
- [ ] **shelf** option → scopes the timeline to that shelf.

### Reference help

- [ ] Settings → a journal → Templates section → **Code-block reference** opens a
      modal with syntax docs, click-to-copy snippets, and live previews.
- [ ] Closing the modal → today's anchor index mapping is restored (no leftover
      synthetic entry).

---

## 11. Decorations — conditions

Setup: Day journal "Deco" with notes on several dates, **plus a custom-interval
journal "DecoX"** — the offered condition types differ by write type (`date` and
`weekday` are day-only; `offset` is custom-only). Open a calendar view showing
them. Add decorations via Settings → Journals → &lt;journal&gt; → Decorations. For each
condition below, pair it with an obvious style (e.g. background red) so the match
is visible.

- [ ] On a **Week/Month/Quarter/Year** journal → the condition dropdown offers
      neither `date`, `weekday`, nor `offset`.

- [ ] **date** — + month=current, day=today, year=_any_ → today's cell decorated.
- [ ] **date, year=any** → the same month/day in a _different_ year is also
      decorated.
- [ ] **date, year-pinned** — + set year=current → only this year's cell.
- [ ] **weekday** — + select Mon+Fri → every Monday and Friday cell decorated.
- [ ] **offset = +1** (on DecoX) → the cell one position after the journal's anchor
      is decorated.
- [ ] **offset = −1** (on DecoX) → the cell one position before the anchor is
      decorated.
- [ ] **has-note** → only cells that have a linked entry are decorated.
- [ ] **has-open-task** — + a linked note with an unchecked `- [ ]` task → that
      cell is decorated.
- [ ] **has-open-task** reactivity — check the task → the decoration clears.
- [ ] **all-tasks-completed** — + a linked note with all tasks checked → the cell
      is decorated.
- [ ] **all-tasks-completed** reactivity — uncheck a task → the decoration clears.
- [ ] **tag — contains** — + condition tag contains `journal` on a note tagged
      `#journal` → decorated.
- [ ] **tag — starts-with** → matches by tag prefix.
- [ ] **tag — ends-with** → matches by tag suffix.
- [ ] **title — contains** → matches when the title contains the substring.
- [ ] **title — starts-with** → matches by title prefix.
- [ ] **title — ends-with** → matches by title suffix.

### Property conditions (text)

Setup: a linked note with frontmatter `mood: happy`.

- [ ] **property text — exists** → decorated when `mood` present.
- [ ] **property text — does-not-exist** → decorated when `mood` absent.
- [ ] **property text — equals** `happy` → decorated.
- [ ] **property text — not-equals** → decorated when value differs.
- [ ] **property text — contains** `app` → decorated.
- [ ] **property text — does-not-contain** → decorated when substring absent.
- [ ] **property text — starts-with** `ha` → decorated.
- [ ] **property text — ends-with** `py` → decorated.

### Property conditions (number)

Setup: a linked note with frontmatter `rating: 5`.

- [ ] **property number — equals** `5` → decorated.
- [ ] **property number — not-equals** → decorated when ≠ 5.
- [ ] **property number — less-than** `6` → decorated.
- [ ] **property number — less-than-or-equal** `5` → decorated.
- [ ] **property number — greater-than** `4` → decorated.
- [ ] **property number — greater-than-or-equal** `5` → decorated.
- [ ] **property number — exists / does-not-exist** → decorated on presence/absence.

### Property conditions (date)

Setup: a linked note with frontmatter `reviewed: 2026-03-05`.

- [ ] **property date — exists** → decorated when `reviewed` present.
- [ ] **property date — does-not-exist** → decorated when absent.
- [ ] **property date — equals** `2026-03-05` → decorated.
- [ ] **property date — not-equals** → decorated when the date differs.
- [ ] **property date — less-than** a later date → decorated.
- [ ] **property date — less-than-or-equal** the same date → decorated.
- [ ] **property date — greater-than** an earlier date → decorated.
- [ ] **property date — greater-than-or-equal** the same date → decorated.
- [ ] The condition editor offers a **date picker** for the value (the value type is
      auto-derived from the vault's property registry, not chosen by hand).

### Property conditions (checkbox)

Setup: a linked note with frontmatter `done: true`.

- [ ] **property checkbox — is-true** → decorated.
- [ ] **property checkbox — is-false** → + set `done: false` → decorated.
- [ ] **property checkbox — exists / does-not-exist** → decorated on
      presence/absence.

### Condition combination

- [ ] Two conditions with **AND** → cell decorated only when both match.
- [ ] Two conditions with **OR** → cell decorated when either matches.

---

## 12. Decorations — styles

Setup: a decoration with a single always-true condition (e.g. has-note) on Deco,
so every entry cell is styled. Swap the style per item.

- [ ] **background** color → cell background changes.
- [ ] **color** (text) → cell text color changes.
- [ ] **border — uniform** (width/style/color) → all four sides bordered.
- [ ] **border — left** only → only the left edge is bordered.
- [ ] **border — right** only → only the right edge is bordered.
- [ ] **border — top** only → only the top edge is bordered.
- [ ] **border — bottom** only → only the bottom edge is bordered.
- [ ] **shape — square** → square marker renders.
- [ ] **shape — circle** → circle marker renders.
- [ ] **shape — triangle up** → up arrow renders.
- [ ] **shape — triangle down** → down arrow renders.
- [ ] **shape — triangle left** → left arrow renders.
- [ ] **shape — triangle right** → right arrow renders.
- [ ] shape **size** → marker resizes.
- [ ] shape **x placement = right** → marker sits at the right edge.
- [ ] shape **y placement = bottom** → marker sits at the bottom.
- [ ] **corner — top-left** → dot in the top-left corner.
- [ ] **corner — top-right** → dot in the top-right corner.
- [ ] **corner — bottom-left** → dot in the bottom-left corner.
- [ ] **corner — bottom-right** → dot in the bottom-right corner.
- [ ] **icon** → chosen icon renders.
- [ ] icon **size** → icon resizes.
- [ ] icon **placement** → icon position changes.
- [ ] icon **color** → icon color changes.
- [ ] **Color mode: transparent** → no fill.
- [ ] **Color mode: theme** (by name) → uses the Obsidian theme color.
- [ ] **Color mode: custom** (hex/rgb) → uses the literal color.
- [ ] **corner color** → the corner dot uses the configured color.
- [ ] **Two styles stacked** in one decoration → both apply, layered in order.
- [ ] **Two separate decorations** whose conditions both match the same cell, each
      setting a **background** → the first decoration in the list wins. Reorder them
      and confirm the winner changes.

---

## 13. Settings UI navigation & validation

Setup: open the Journals settings tab.

- [ ] Dashboard renders blocks in order: colliding-journals, shelves, journals,
      commands, views, startup, calendar-week, calendar-appearance, logging.
- [ ] **Journals** block → click a journal → journal edit subpage opens (shelf,
      commands, interval-block, decorations sections).
- [ ] Back from journal subpage → returns to dashboard.
- [ ] **Views** block → click a view → opens its view edit subpage.
- [ ] **Shelves** block → click a shelf → opens its shelf edit subpage.
- [ ] **Commands** block → global command editor.
- [ ] Journal subpage sections render in order: note-creation, templates, timeline,
      sequence, frontmatter, shelf, commands, interval-block, decorations.
- [ ] Back from a **view** and a **shelf** subpage → each returns to the dashboard
      with the list scrolled where you left it.

Field validation lives in §18 — it is one behavior class and testing it in one
sitting is faster than rediscovering the pattern per screen.

- [ ] **calendar-week** — change week-start day → calendar grids shift to the new
      first day.
- [ ] **calendar-week** — change week-start day → week numbers recompute.
- [ ] **calendar-week** — locale preset → dow/doy update to the preset.
- [ ] **calendar-appearance** — today color picker → applies live to today's cell.
- [ ] **calendar-appearance** — today background picker → applies live to today's
      cell.
- [ ] **calendar-appearance** — active color picker → applies live to the active
      cell.
- [ ] **calendar-appearance** — active background picker → applies live to the
      active cell.
- [ ] **calendar-appearance** — a cell that is both today and active → today's
      style wins.
- [ ] **logging** — raise log level → more console output.
- [ ] **logging** — lower log level → less console output.

---

## 14. Startup & background behaviors

- [ ] **Open on startup** — + set startup journal = a Day journal; reload Obsidian
      → today's entry opens automatically on launch.
- [ ] Startup journal = a **Month** (or Week/Quarter/Year/custom) journal → reload →
      the current period's entry opens, stamped with the period's canonical anchor,
      not today's exact date.
- [ ] Open-on-startup does **not** re-fire on later layout changes within a
      session (only genuine launch).
- [ ] - Rename the startup journal → reload → still opens (name reconciled).
- [ ] - Delete the startup journal → reload → fails silently, no crash.
- [ ] **autoCreate** — + a Day journal with autoCreate on; advance system clock
      past local midnight (or reload after midnight) → tomorrow's note appears.
- [ ] autoCreate scheduling does not double-fire across the midnight boundary.
- [ ] **Auto-attach** — + manually create a note matching a journal's
      folder+name pattern within its timeline → journal frontmatter auto-added.
- [ ] Auto-attach on **rename** — rename an unrelated note _into_ a matching
      folder+name → it is attached the same as a fresh creation.
- [ ] Auto-attach does **not** double-process a note the plugin itself just
      created (self-write guard, ~5s window).
- [ ] Auto-attach leaves a note untouched when **multiple journals** could match
      (ambiguous).

---

## 15. Migration (existing data)

Setup: **back up `data.json` first.** Reload after each load to let the async note
migration run.

A v1 `data.json` runs the **whole** chain (v1→v2→v3→v4) in one load, so the
shipped `e2e/fixtures/e2e-legacy-v1` vault exercises every step below — copy it
into a scratch vault to run this section. A separate v2- or v3-era snapshot is
only needed to test _entering_ the chain part-way; if you have a real one from a
user report, use it, otherwise note in sign-off that only the full chain was
covered.

- [ ] **v1 → v2** — load v1 config → calendar journals split into per-period
      journals; interval journals preserved with unique names; shelves created;
      default commands present.
- [ ] **v1→v2 note rewrite** (async, after load) → connected notes get the new
      journal name; old keys (e.g. `journal-section`) removed; interval indexes
      migrated to numbering keys; orphaned keys stripped.
- [ ] No note left **half-migrated** after the async pass completes.
- [ ] **v2 → v3** — commands collection added.
- [ ] **v2 → v3** — `shelf.commands` array present.
- [ ] **v3 → v4** — journals/shelves stay keyed by **name**; migrated commands are
      keyed by their **v2 hotkey slug** so existing hotkey bindings survive. (Only
      commands created fresh in v3 get a nanoid id — migration mints none.)
- [ ] **v3 → v4** — per-journal/shelf command arrays flattened into the global
      commands collection.
- [ ] **v3 → v4, week journals** — the async pass rewrites each week note's date
      field to the canonical week anchor.
- [ ] **v3 → v4** — startup slice added.
- [ ] **v3 → v4** — views reshaped to the new config.
- [ ] **Idempotent** — reload a migrated vault a second time → no duplicate
      journals/commands/shelves.
- [ ] Existing notes in a migrated vault still **open and navigate**.
- [ ] (v1→v2 migration is **non-interactive** in v3 by design — confirm, don't
      file as a bug.)

---

## 16. Regression / edge cases

- [ ] **Cross-year week** — + a week spanning Dec→Jan → anchors to the correct
      owning year (the v2 `{{date:YYYY}}` bug stays fixed).
- [ ] Rapidly create+delete journals/views/commands → no leaked leaves, ribbon
      icons, or palette entries.
- [ ] Change **global locale / week-start** → month/week calendars update to the
      new first day.
- [ ] Change **global locale / week-start** → `calendar-timeline` blocks update to
      match.
- [ ] Change **global locale / week-start** → week numbers recompute consistently.
- [ ] **Large vault** — generate ≥1000 journal notes across ≥3 journals → the
      calendar view paints within ~1s of opening, and a month step feels immediate
      (no visible stall). Record the numbers in sign-off rather than judging "lag".
- [ ] Note with **malformed frontmatter** → indexing does not crash.
- [ ] Note with **malformed frontmatter** → other journals still index normally.
- [ ] Note with **malformed `data.json`** (hand-corrupt one journal entry) → that
      entry resets to defaults, the rest of the settings survive.

---

## 17. Opening: modes, modifiers, and menus

Setup: a Day journal "Open" with a few existing entries; a calendar view, a
`journal-nav` block, and a `journals-home` block all visible.

### Click modifiers

The same modifier map applies to every affordance below: **Ctrl/Cmd → new tab**,
**Ctrl/Cmd+Alt → split**, **middle-click → new tab**, plain click → active pane.

- [ ] **Calendar day cell** — Ctrl/Cmd+click → opens in a new tab.
- [ ] Calendar day cell — **middle-click** → opens in a new tab.
- [ ] Calendar day cell — Ctrl/Cmd+Alt+click → opens in a split.
- [ ] **Week number / month / year header** cell → same modifier behavior.
- [ ] **`journal-nav` row** → same modifier behavior.
- [ ] **`journal-nav` prev / next arrows** → same modifier behavior.
- [ ] **`journals-home` link** → same modifier behavior.
- [ ] **Toolbar button** → same modifier behavior.
- [ ] **Period badge** (period-buttons item) → same modifier behavior.
- [ ] **Defined-navigation arrow** → same modifier behavior.

### Context menus

- [ ] **Right-click a calendar cell with a note** → native file menu appears.
- [ ] That menu includes a **Delete** entry (appended by the plugin; Obsidian does
      not guarantee one).
- [ ] Deleting from that menu → the note goes to trash and the cell empties.
- [ ] **Right-click a period badge** → same menu.
- [ ] **Right-click a `journal-nav` row** → same menu.
- [ ] Right-click a cell with **no** note → no menu / no crash.

### Multi-journal disambiguation

Setup: two Day journals whose entries land on the same date.

- [ ] **Click** a date served by both → a centered suggest modal lists both.
- [ ] Pick one → that journal's entry opens.
- [ ] **Dismiss** the suggest modal (Esc) → nothing opens, no error notice.
- [ ] Trigger the same date from a **command** or keyboard → centered suggest
      (not the at-pointer menu).

### URI handler (`obsidian://`)

Covered by `uri-open`; walk manually only when investigating.

- [ ] `journal=Open&date=today` → opens today's entry.
- [ ] `type=day&date=2026-03-05` → opens that day via write-type targeting.
- [ ] `date=+3d` / `-2w` / `+1m` / `+1q` / `-1y` → relative offsets resolve.
- [ ] `mode=tab` / `split` / `window` → honored.
- [ ] **Neither `journal` nor `type`** → error notice, no note created.
- [ ] **Unknown write type** (`type=fortnight`) → error notice.
- [ ] **Unreadable date** (`date=not-a-date`) → error notice.
- [ ] **Unknown open mode** (`mode=sideways`) → error notice.
- [ ] `journal=` a name that does not exist → error notice, not a silent no-op.

---

## 18. Error & recovery surfaces

This is the class v3 has historically failed **silently** — an item passes only if
the user is actually told. "Nothing happened" is a bug here, not a pass.

### Flow failures reach the user

Setup: journal "Err" whose template path points at a missing file.

- [ ] Open today's entry from the **palette** → a failure notice appears.
- [ ] Same failure from the **ribbon** → notice appears.
- [ ] Same failure from a **calendar cell** click → notice appears.
- [ ] Same failure from a **code block** link → notice appears.
- [ ] **Cancelling** a confirm-creation prompt → _no_ error notice (a user cancel
      is not a failure).
- [ ] A command whose **timeline has ended** → either it is absent from the palette,
      or running it explains why nothing opened. Never listed-but-silent.

### Code-block errors

- [ ] Code block with **malformed YAML** → an error panel says the options could not
      be read; the note still renders.
- [ ] Code block with a **wrong-typed option** (e.g. `mode: 42`) → schema error panel
      or documented graceful degrade, not a blank block.
- [ ] Code block with an **unrecognized option** → a warning names the ignored key
      and the block still renders.
- [ ] `journal-nav` in a note **not connected** to any journal → "not connected"
      message, not an empty block.

### View errors

- [ ] Leave a view's tab open, **delete the view** → the tab shows a "view deleted"
      panel, not a crash or a blank pane.
- [ ] Hand-edit `data.json` to give a block an **unknown type** → that block shows an
      unknown-block panel; sibling blocks still render.
- [ ] Hand-edit a block's config to something **invalid** → config-error panel,
      siblings unaffected.
- [ ] A calendar block with **no journals at all** → "No journals yet".
- [ ] A calendar block **scoped to a shelf** with no members → "No journals on this
      shelf."
- [ ] `markdown-template` pointing at a **missing file** → read-error message.

### Settings load & sync

- [ ] Hand-corrupt `data.json` **wholesale** → a notice explains the load failed and
      the plugin disables itself; Obsidian does not crash.
- [ ] Corrupt a **single collection entry** → only that entry resets to defaults, with
      a console warning; other journals survive.
- [ ] Edit `data.json` **externally** (simulate sync) → settings reload, commands
      re-register, and the vault re-scans without a restart.
- [ ] An external edit that is **invalid** → a reload-failed notice, previous
      settings retained.
- [ ] Change the **week start / locale preset** → a "reload required" banner appears
      in settings.
- [ ] **Dump logs** button → writes a `journal-log-*.md` note.
- [ ] Dump logs with **no buffered logs** → an empty-state notice, no stray note.

### Field validation

Every one of these should block save and show the message in the field's own
description slot — not a notice, not a silent revert.

- [ ] Journal: **empty name**, **duplicate name**, **invalid name template**,
      **bad date format**.
- [ ] Journal name template with **no per-entry variable** → collision warning (all
      entries would share one note).
- [ ] Journal name template that is **not invertible** (function token, unknown
      variable, or a clock variable) → warning that auto-attach cannot recover a
      date from the filename.
- [ ] Journal name template or date format containing **`/`** → the "move this into
      the folder setting" nudge appears, and its apply-link works.
- [ ] Date format or name template using **uppercase `W`/`WW`** → wrong-week warning
      (ISO week is locale-independent; `ww` is the locale week).
- [ ] Timeline **end = repeats** with **no start** set → warning that repeats need a
      start to be bounded.
- [ ] Shelf: **empty name**, **duplicate name**, **unchanged name**.
- [ ] Command: **empty name**, **duplicate name within the same owner**.
- [ ] Command: **show in ribbon on with no icon** → "pick an icon" error.
- [ ] View: **empty name**, **unchanged name**.
- [ ] Nav-block row: **no journal selected**, **empty template**.
- [ ] Numbering: **anchor date required** when the mode needs one.
- [ ] Bulk add: **folder not found**, **date format required**, **property name
      required** when dating by property.
- [ ] Theme color inputs: **invalid color value** → field error.

---

## 19. Appearance & accessibility

No automated check can judge any of this. It is the reason a human runs this pass.

### Theme & legibility

- [ ] **Theme switch** light ↔ dark → decoration & calendar colors stay legible.
- [ ] **Custom theme** applied → decoration & calendar colors stay legible.
- [ ] Decoration **color mode: theme** under both light and dark → follows the theme.
- [ ] Today vs. active cell styling stays distinguishable in both themes.

### Keyboard

- [ ] **Tab** through a calendar view → every interactive cell and toolbar control is
      reachable.
- [ ] Every focused control shows a **visible focus ring**. (Known open: calendar
      cells are focusable with no ring — parity item 124.)
- [ ] **Enter / Space** on a focused calendar cell → opens the entry.
- [ ] Block and toolbar-item controls in the **view editor** are reachable without a
      mouse. (Known open: they are hover-only — parity item 123.)
- [ ] Modals trap focus and **Esc** closes them.

### Screen reader / labels

- [ ] Calendar cells announce a usable label (date + whether an entry exists).
- [ ] Icon-only toolbar buttons announce their purpose.
- [ ] The **shelf selector** announces the _selected shelf_, not a static label — its
      visible text is data, not a name.

### Mobile

`manifest.json` sets `isDesktopOnly: false`, so mobile is a supported target.

- [ ] Plugin loads on a **mobile/tablet** build.
- [ ] Calendar view opens and renders at phone width.
- [ ] Tapping a day cell opens the entry.
- [ ] Settings dashboard and journal subpages are usable at phone width.
- [ ] View-editor block/toolbar controls are reachable **without hover**.
- [ ] Modals fit the viewport and can be dismissed.

### Localization

The plugin's UI language follows **Obsidian's** language setting; it is not
selectable inside the plugin. 11 bundles ship (`de en es fr it ja ko pt ru uk zh`).

- [ ] Switch Obsidian to a shipped language → plugin UI is translated.
- [ ] Switch to a **regional variant** (e.g. `de-AT`) → falls back to the base
      language, not to English.
- [ ] Switch to an **unshipped** language → falls back to English, no blank strings
      or raw message keys.
- [ ] In a translated locale, long strings do not clip or overflow their controls.
- [ ] Weekday and month names come from the **calendar locale**, and stay correct
      when the UI language and calendar locale differ.

---

## Sign-off

| Field                    | Value                                    |
| ------------------------ | ---------------------------------------- |
| Tester                   |                                          |
| Date                     |                                          |
| OS / Obsidian version    |                                          |
| Theme(s)                 |                                          |
| Vault(s) tested          | fresh / v1-migrated / real user snapshot |
| Mobile build tested      | yes / no — device:                       |
| UI language(s) tested    |                                          |
| Large-vault note count   |                                          |
| Large-vault paint / step | ms / ms                                  |
| Sections skipped         |                                          |
| Bugs filed               |                                          |
