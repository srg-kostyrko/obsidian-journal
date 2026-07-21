# Manual Testing Checklist — Journals v3 in Obsidian

Branch: `v3-ai`. Run before tagging a beta / merging to `main`.

**How to read an item.** Each group opens with a **Setup:** preamble — do it once
for the whole group. Each `[ ]` item is one behavior: it states any extra setup
(`+`), the **action**, then the **expected** result after `→`. If an item has no
`+`, the group Setup is all you need.

Severity for bugs you log: 🔴 data loss / crash · 🟡 feature broken · 🟢 cosmetic.

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
- [ ] - Open a **brand-new empty vault**, install the plugin → first-run state is
      sane (a default Calendar view seeded, no journals).
- [ ] - Open a vault with a v2 `data.json` → loads without crash (migration, §15).
- [ ] If claiming mobile (`isDesktopOnly: false`): repeat load + open-view on a
      mobile/tablet build.

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
- [ ] - **Rename toggle on** → `Scratch.md` renamed to Conn's name template.
- [ ] - **Move toggle on** → file moved into Conn's folder.
- [ ] **Connect** on an already-connected note → button shows **Disconnect** →
      frontmatter keys stripped.
- [ ] Connect a note dated **outside Conn's timeline** → blocked or warned, not
      silently corrupted.
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
- [ ] **Dry-run preview** → lists each note with connect/skip and a skip _reason_.
- [ ] Per-note decision **connect** → note connected on commit.
- [ ] Per-note decision **merge** → merges into existing entry.
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

### Command type variants (depend on write type)

Setup: one command of each `type`, targeting the relevant journal write type.

- [ ] **Built-in `Open next`** → next entry of the active journal.
- [ ] **Built-in `Open previous`** → previous entry.
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
- [ ] **Delete a view** → its `open-view` command disappears from the palette.
- [ ] **Delete a view** → the remaining views still open normally.
- [ ] **Delete all views** → plugin does not crash; graceful empty state.

### View blocks

Setup: edit a view → add each block type via **Add block**.

- [ ] **month-calendar** renders the current month grid.
- [ ] month-calendar **before = 1** → also shows the previous month.
- [ ] month-calendar **after = 1** → also shows the next month.
- [ ] month-calendar **hiddenWeekdays = Sat+Sun** → those two columns hidden.
- [ ] month-calendar **hiddenWeekdays = a single midweek day** → only that column
      is hidden (it is a per-weekday toggle group, not a weekend switch).
- [ ] month-calendar **weeks = left** → week-number column on the left.
- [ ] month-calendar **weeks = right** → week-number column on the right.
- [ ] month-calendar **weeks = none** → no week column.
- [ ] A week number with **no week journal** still shows as an inactive label.
- [ ] **week-calendar** renders week rows (weeks/before/after behave as on
      month-calendar — spot-check one).
- [ ] **custom-intervals** lists intervals for its assigned journals.
- [ ] custom-intervals **window = month** (etc.) → lists periods at that scale.
- [ ] custom-intervals **hideEmpty** → periods with no note are hidden.
- [ ] **divider** renders a separator line.
- [ ] **markdown-template** + `templatePath` set → renders that file's markdown.
- [ ] **Today highlight — day** → today's day cell is marked `data-today`.
- [ ] **Today highlight — week** → the week cell containing today is marked.
- [ ] **Today highlight — month** → the current month cell is marked.
- [ ] **Today highlight — quarter** → the current quarter cell is marked.
- [ ] **Today highlight — year** → the current year cell is marked.
- [ ] **Active highlight** → opening an entry marks its cell active.

### Toolbar items

Setup: edit a view's toolbar block → add each item.

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
- [ ] **shelf-selector** dropdown → lists the available shelves.
- [ ] **shelf-selector** selection → re-scopes the calendar to that shelf's
      journals.
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
- [ ] Row **addDecorations on** → the journal's decorations show on the row.
- [ ] Edit a row via its edit-row modal → change persists in the rendered block.

### calendar-timeline

- [ ] ` ```calendar-timeline mode: week ` → renders week timeline.
- [ ] `mode: month` → month timeline.
- [ ] `mode: quarter` → quarter timeline.
- [ ] `mode: calendar` → calendar timeline.
- [ ] timeline **weeks = left** → week column on the left.
- [ ] timeline **weeks = right** → week column on the right.
- [ ] timeline **weeks = none** → no week column.
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

### Property conditions (checkbox)

Setup: a linked note with frontmatter `done: true`.

- [ ] **property checkbox — is-true** → decorated.
- [ ] **property checkbox — is-false** → + set `done: false` → decorated.

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
- [ ] **Two styles stacked** → both apply, layered in order.

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
- [ ] **Invalid name template** → field error shown (description slot), save
      blocked.
- [ ] **Bad date format** → field error, save blocked.
- [ ] **Duplicate journal name** → field error, save blocked.
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
- [ ] Open-on-startup does **not** re-fire on later layout changes within a
      session (only genuine launch).
- [ ] - Rename the startup journal → reload → still opens (name reconciled).
- [ ] - Delete the startup journal → reload → fails silently, no crash.
- [ ] **autoCreate** — + a Day journal with autoCreate on; advance system clock
      past local midnight (or reload after midnight) → tomorrow's note appears.
- [ ] autoCreate scheduling does not double-fire across the midnight boundary.
- [ ] **Auto-attach** — + manually create a note matching a journal's
      folder+name pattern within its timeline → journal frontmatter auto-added.
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
- [ ] **Large vault** (hundreds of journal notes) → calendar/timeline render &
      navigate without noticeable lag.
- [ ] Note with **malformed frontmatter** → indexing does not crash.
- [ ] Note with **malformed frontmatter** → other journals still index normally.
- [ ] **Theme switch** light ↔ dark → decoration & calendar colors stay legible.
- [ ] **Custom theme** applied → decoration & calendar colors stay legible.

---

## Sign-off

| Field                 | Value                             |
| --------------------- | --------------------------------- |
| Tester                |                                   |
| Date                  |                                   |
| OS / Obsidian version |                                   |
| Theme                 |                                   |
| Vault(s) tested       | fresh / v2-migrated / v1-migrated |
| Bugs filed            |                                   |
