# Manual Testing Checklist — Journals in Obsidian

Run before tagging a release.

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
| §8 views                 | `view`, `view-blocks`, `view-clone`, `remember-date`, `startup-view`, `existing-navigation`         |
| §9 shelves               | `nav-off-shelf`                                                                                     |
| §10 code blocks          | `code-blocks`, `custom-interval-nav`, `home-index`                                                  |
| §14 settings             | `settings`, `settings-first-journal`                                                                |
| §15 startup / background | `startup-open`, `startup-confirm`, `auto-create`, `auto-attach`, `settings-reload`, `sync-settings` |
| §16 migration            | `legacy-upgrade`, `mid-session-enable`                                                              |
| §17 regression (locale)  | `calendar-locale`                                                                                   |
| §18 URI handler          | `uri-open`                                                                                          |

**Spend your attention where automation cannot reach.** Work the sections in this
order, not top to bottom:

1. §12 styles, §11 conditions, §20 appearance & accessibility — anything whose
   pass condition is "a human looked at it".
2. §19 error & recovery surfaces — mostly beyond automation, and the class most
   prone to failing silently.
3. §17 regression (theme switch, large vault, malformed frontmatter) and §0's
   mobile line.
4. §16 migration against a real user snapshot, if you have one.
5. Everything else, as a sweep, trusting the table above.

---

## 0. Setup & smoke

Setup: clone the repository; `npm run dev` (builds into
`test-vault/.obsidian/plugins/journals` with hot-reload).

- [x] Dev build completes with no errors and writes `main.js`.
- [x] Open `test-vault` in Obsidian → plugin loads, Console (DevTools) shows no
      errors.
- [x] Disable the plugin in Community Plugins → no errors, calendar leaves close.
- [x] Re-enable the plugin → re-initializes, default view available again.
- [x] Reload Obsidian (Ctrl/Cmd+R) → clean re-init, no duplicate ribbon icons.
- [x] Open a **brand-new empty vault**, install the plugin → exactly one Calendar
      view is seeded, it opens on startup, it shows **no** ribbon icon (the seed sets
      `showInRibbon: false`, matching v2, which exposed the calendar by command
      only), and no journals exist.
- [x] First run → the seeded view renders its calendar grid with no empty-state
      message, and does not render a bare divider rule or an empty custom-intervals
      section.
- [x] Open a vault with a v2 `data.json` → loads without crash (migration, §16).
- [ ] Mobile smoke: plugin loads on a mobile/tablet build (full mobile pass is §20).

---

## 1. Journal write types

Setup: Settings → Journals → **Add journal**. For each type below, create one
journal of that type, then trigger creation of "today's" entry (open it via a
command or the calendar).

- [x] **Day** — + name template `{{date}}`, format `YYYY-MM-DD` → note created at
      `YYYY-MM-DD.md` for today.
- [x] **Week** — + format `YYYY-[W]ww` → the week note spans Mon–Sun (per locale).
- [x] **Week** filename → uses the week token (`ww`).
- [x] **Month** — + format `YYYY-MM` → note covers the whole month.
- [x] **Quarter** — + format `YYYY-[Q]Q` → note covers 3 months.
- [x] **Year** — + format `YYYY` → note covers the year.
- [x] **Custom, every N days** — + repeat `10 days`, anchor = a past date →
      stepping next/prev lands exactly 10 days apart, no drift over 12 steps.
- [x] **Custom, every N weeks** — + repeat `2 weeks` → consecutive intervals are
      exactly 14 days apart.
- [x] **Custom, every N weeks** alignment → each interval starts on the anchor's
      weekday.
- [x] **Custom, every N months** — + repeat `1 month`, anchor = Jan 31 →
      Feb interval clamps to Feb 28/29 (month-end clamp). - month got clammped to 28th
- [x] **Custom, every N quarters / years** — interval boundaries correct.

---

## 2. Per-journal configuration

Setup: create one **Day** journal "Cfg". Edit its config in Settings → Journals →
Cfg. After each change, create a _new_ entry to observe the effect. Existing notes
should be untouched — except by the start/end-date toggles, which deliberately
rewrite every connected note (see the item below).

- [x] **Name template** with `{{date}}` → filename is the formatted date.
- [x] **Name template** with `{{journal_name}}` → filename includes "Cfg".
- [x] **Name template** with `{{index}}` — + numbering on (§4) → filename includes
      the number.
- [x] **Name template** with a **shift** — `{{date+1d}}`, `{{date-2w}}` → the
      filename uses the shifted date (units `y q m w d h`).
- [x] **Name template** with a **boundary** — `{{date<startOf=week>}}`,
      `{{date<endOf=month>}}` → snaps to that boundary.
- [x] Boundary unit **`decade`** → snaps to the decade's first/last day.
- [x] Shift **and** boundary together — `{{date+1w<endOf=month>:YYYY-MM-DD}}` → the
      shift applies first, then the boundary.
- [x] **Colliding name template** — `{{date<endOf=month>}}` on a Day journal → the
      name-template field warns, naming the two dates and the shared note path.
- [x] **Unknown boundary unit** — `{{date<startOf=fortnight>}}` → left as-is /
      degrades, no crash.
- [x] **Name template** with an inline **format** — `{{date:YYYY}}` → uses that
      format instead of the journal's.
- [x] **Template body** with `{{journal_link(<journal name>)}}` → resolves to the
      target journal's note path.
- [ ] `{{journal_link(...)}}` whose target is **outside its timeline** → the token is
      left unresolved rather than producing a broken link.
- [x] **Date format** change (e.g. `DD.MM.YYYY`) → new notes use the new format.
- [x] **Date format** change → existing notes keep their old names (no rewrite).
- [x] **Folder** set to `Journals/Cfg` → new note created there.
- [x] **Folder** with a not-yet-existing nested path → folders auto-created.
- [x] **Note path preview** — set **Folder** to `Journals/{{date:YYYY}}/{{date:MM}}` → the
      preview at the top of the Note creation section shows the whole path including `.md`,
      it matches where the created note actually lands, and the deep path wraps onto
      multiple lines instead of overflowing the settings pane.
- [x] **Note path preview** with **Folder** `Journals/{{note_name}}` → the preview
      resolves the folder instead of going blank.
- [x] **Note path preview** with the **name template cleared** → the preview is replaced
      by the empty-note-name warning.
- [x] **Template** — + add `templates/daily template.md` → new note's body is the
      template content.
- [x] **Multiple templates** listed → the _first existing, non-empty_ one wins; the
      rest are a fallback chain, not appended.
- [x] **Multiple templates**, first path missing → falls through to the second.
- [x] **Multiple templates**, first file exists but is empty → falls through to the
      second.
- [x] **Templater command** — + with Templater installed, template uses a
      `<% tp.* %>` command → the command is evaluated in the new note.
- [x] **Templater cursor jump** — + template has a cursor marker → cursor jumps
      to it after creation.
- [x] **confirmCreation = on** → navigating to a missing entry prompts before
      creating.
- [x] **confirmCreation = on**, then **cancel** the prompt → no note is created and
      no error is reported.
- [x] **confirmCreation = off** → missing entry created silently.
- [x] **Frontmatter date field** renamed → new note's frontmatter uses the new
      key.
- [x] **Start/end date fields** on a **Day** journal → both written with the
      configured key names (these apply to _every_ write type, not just custom).
- [x] **Start/end date fields** on a **Month** journal → values are the month's
      first/last day.
- [x] **Start/end date fields** on a **custom** journal → values span the interval.
- [x] Toggling **addStartDate / addEndDate** on a journal that already has connected
      notes → every connected note's frontmatter is rewritten immediately (this is
      the one config change that _does_ touch existing notes).

### Timeline bounds

Setup: edit journal Cfg → Timeline.

- [x] **Start bound** set to a future date → navigating before it is blocked / not
      creatable.
- [x] **End = never** → can navigate arbitrarily far forward.
- [x] **End = fixed date** → navigation/creation stops at that date.
- [x] **End = repeat count N** → exactly N entries reachable from start.
- [x] **End = repeat count N** with **no start bound** → the journal stays unbounded
      (repeats need a start); a warning says so.

---

## 3. Journal lifecycle (rename / delete)

Setup: a Day journal "Life" with ≥3 connected notes across different dates, and a
command + a view block targeting it.

- [x] **Rename** Life → "Living" → every connected note's frontmatter _name key_
      is rewritten to "Living".
- [x] After rename → the targeting **command** still resolves (no dangling target).
- [x] After rename → the targeting **view block** still resolves.
- [x] **Rename to a name already taken** → rejected with an error message.
- [x] **Rename to a name already taken** → connected notes' frontmatter left
      untouched.
- [x] **Delete → keep notes** → note files remain, journal frontmatter intact.
- [x] **Delete → clear notes** → files remain, journal frontmatter keys stripped.
- [x] **Delete → delete notes** → notes moved to **trash** (recoverable), not
      permanently erased.
- [x] **Delete → keep notes**, then create a journal with the **same name** → the kept
      notes reconnect immediately (the delete modal counts them again, the calendar
      shows them), with no reload.
- [x] Create a second journal with a **different name** but the same
      `nameTemplate` + `folder` + `dateFormat` → "colliding journals" warning shows
      in the settings dashboard. (Duplicate _names_ are rejected at creation, so
      that is not the collision trigger.)
- [x] The same collision → the warning also shows on each colliding journal's own
      edit subpage.
- [x] Give both colliding journals a `{{journal_name}}` name template → the
      collision clears (the name individualizes the path).

---

## 4. Numbering

Setup: Day journal "Num" → enable Numbering. Use `{{index}}` in its name template
so the number is visible in filenames.

- [x] **Enabled** → consecutive entries increment the index by 1.
- [x] **anchorDate** set → counting starts (index 1) at the anchor period.
- [x] **allowBefore = on** → periods before the anchor receive numbers (negative /
      mirrored).
- [x] **allowBefore = off** → entries before the anchor are blocked.
- [x] **reset_after = N** → index cycles within `[anchor, anchor+N-1]` then
      restarts.
- [x] **Increment / start value** → first index matches the configured start.
- [x] The **allowBefore** toggle only appears when the journal has no timeline
      start _and_ reset is `never` — set `reset_after` first and confirm it hides.
- [x] Set a **timeline start** (§2) → the Sequence section hides its own anchor
      picker and numbering counts from the timeline start instead.

---

## 5. Note connection

Setup: a Day journal "Conn" with a folder + name template; an arbitrary note
`Scratch.md` open.

- [x] **Connect note** command on `Scratch.md` → pick Conn + a date → journal
      frontmatter written to the note.
- [x] Date already has a note → **override** prompt appears → choosing override
      replaces the connection.
- [x] 🔴 Override **with rename+move on**, so the incoming note takes the occupant's
      exact path → the old occupant file is moved to **trash**.
- [x] 🔴 Override **without** rename+move → the old occupant is only _disconnected_
      (frontmatter stripped); its file stays in place as an orphan. Confirm this is
      what you see — the two outcomes differ and only one deletes a file.
- [x] **Rename toggle on** → `Scratch.md` renamed to Conn's name template.
- [x] **Move toggle on** → file moved into Conn's folder.
- [x] **Connect** on an already-connected note → button shows **Disconnect** →
      frontmatter keys stripped.
- [x] Connect a note dated **outside Conn's timeline** → the attempt is refused with
      an explanation; the note's frontmatter is unchanged afterwards.
- [x] **Connect note** in a vault with **no journals** → an empty-state explains why,
      with only Cancel.
- [x] **Insert date link** command in an editor → inserts a journal/date link.
- [x] Click the inserted link → navigates to / creates that entry.

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
- [ ] Dry-run **off** → the run commits directly.

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

- [x] New custom command appears in the **palette** with its label.
- [x] **Icon** set + **show in ribbon** on → ribbon icon appears.
- [x] Ribbon icon click → runs the command.
- [x] **Open mode: active** → opens in the current pane.
- [x] **Open mode: new tab** → opens in a new tab.
- [x] **Open mode: split** → opens in a split.
- [x] **Open mode: new window** → opens in a new window.
- [x] **Context: today** → resolves relative to today's date.
- [x] **Context: open note** → resolves relative to the active journal note (falls
      back when none).
- [x] **Context: only open note** → only runs when a journal note is active;
      otherwise no-op/disabled.
- [x] **Target: all journals** → acts on every journal of the filtered write type.
- [x] **Target: specific journal** → acts only on Cmd.
- [x] **Target: shelf** → acts only on journals in the chosen shelf (§9).
- [x] **Target: shelf** on a shelf holding **mixed write types** → acts only on the
      members matching the command's own write type.
- [x] **Icon** required — turn on show-in-ribbon with no icon → save is blocked with
      a "pick an icon" error.

### Command type variants (depend on write type)

Setup: one command of each `type`, targeting the relevant journal write type.

- [x] **Built-in `Open next`** → next entry of the active journal.
- [x] **Built-in `Open previous`** → previous entry.
- [x] **next_available** — + gaps between existing notes → jumps to the next entry
      that _exists_, skipping the gap (not merely +1 period).
- [x] **previous_available** → jumps to the previous existing entry.
- [x] **next_available** with nothing ahead → an explicit "no next note" notice, not
      silence.
- [x] **previous_available** with nothing behind → an explicit "no previous note"
      notice.
- [x] Day journal — **same** → today's entry.
- [x] Day journal — **next** → +1 day.
- [x] Day journal — **previous** → −1 day.
- [x] Day journal — **same_next_week** → +7 days.
- [x] Day journal — **same_previous_week** → −7 days.
- [x] Day journal — **same_next_month** → same day-of-month, +1 month.
- [x] Day journal — **same_previous_month** → same day-of-month, −1 month.
- [x] Day journal — **same_next_year** → same date, +1 year.
- [x] Day journal — **same_previous_year** → same date, −1 year.
- [x] Week / Year / Custom journal — **same** → current entry.
- [x] Week / Year / Custom journal — **next** → +1 period.
- [x] Week / Year / Custom journal — **previous** → −1 period.
- [x] Month / Quarter journal — **same** → current entry.
- [x] Month / Quarter journal — **next** → +1 period.
- [x] Month / Quarter journal — **previous** → −1 period.
- [x] Month / Quarter journal — **same_next_year** → same month/quarter, +1 year.
- [x] Month / Quarter journal — **same_previous_year** → same month/quarter, −1 year.

### Command reactivity

- [x] Rename a targeted journal → command re-targets automatically.
- [x] Delete a targeted journal → its commands disappear from the palette.
- [x] Delete a targeted **shelf** → its shelf-scoped commands disappear too.
- [x] Palette entries carry their owner prefix: `<journal>: <name>` for journal
      commands, `Shelf: <shelf>: <name>` for shelf commands.
- [x] Two different journals can both hold a command named "Open today's note"
      (uniqueness is per-owner, not global).

---

## 8. Views (calendar sidebar)

Setup: keep the default seeded **Calendar** view; have ≥1 Day journal with notes
so cells are populated.

- [x] Run `Open Calendar` (`journal:open-view:<id>`) → the sidebar view opens with
      its seeded default block layout.
- [x] **Leaf = left** → opens in the left sidebar on next open.
- [x] **Leaf = right** → opens in the right sidebar.
- [x] **Leaf = tab** → opens as a main-area tab.
- [x] View **icon** renders in its tab/header.
- [x] View **show in ribbon** on → ribbon icon opens the view.
- [x] **Default shelf** set → view shows only that shelf's journals.
- [x] **Create a new view** → appears with its own `open-view` command.
- [ ] **Create a new view** → the add dialog offers an icon, pre-filled with the default
      one; the picked icon shows on the new view's subpage and in its tab/header.
- [x] **Rename a view** → its palette command and tab header follow.
- [x] **Clone a view** → the copy carries every block and toolbar item, and edits to
      the copy do not affect the original.
- [x] **Change leaf while the view is open** → a "move open view?" confirm appears.
- [x] Confirm that dialog → the open view relocates immediately.
- [x] Cancel that dialog → the view stays put and the setting reverts.
- [x] **Open on startup** on a view → reload Obsidian → it opens on launch **without
      stealing focus** from the active note.
- [x] Open-on-startup when a leaf for that view was **already restored** by
      Obsidian's saved layout → no duplicate leaf.
- [x] **Remember last viewed date** on → navigate away from today, reload → the view
      reopens on the remembered date.
- [x] Remember-date **off** → the view reopens on today.
- [x] **Follow active note** on → opening a journal entry moves the view's date to
      that entry's date.
- [x] **Follow active note** off → opening an entry leaves the view's date put.
- [x] Turning **Follow active note** on while a journal entry is already open moves the
      view to that entry's date straight away, without waiting for the next note switch.
- [x] Navigate after a follow (e.g. "next month") steps on from the _followed
      note's_ date, not from wherever the view was before the note opened.
- [x] Closing the followed note, or opening a note outside the view's scope, leaves
      the view where it is (no snap-back to the previously navigated date).
- [ ] Open a day note from a greyed-out spillover cell at the edge of the month
      grid: the grid moves to that day's own month and the toolbar's month button
      names the same month as the grid heading. With the month block's `after` set
      to 1, the grid instead keeps both months on screen and the toolbar names the
      neighbor.
- [ ] Click the quarter button while the calendar shows a month inside that
      quarter: the quarter note opens, the quarter button highlights, and the grid
      does not move.
- [x] **Delete a view** → its `open-view` command disappears from the palette.
- [x] **Delete a view** → the remaining views still open normally.
- [x] **Delete all views** → plugin does not crash; graceful empty state.

### View blocks

Setup: edit a view → add each block type via **Add block**. Six block types are
registered: `toolbar`, `month-calendar`, `week-calendar`, `custom-intervals`,
`divider`, `markdown-template` — add every one at least once.

- [x] **Add block** picker lists all six types.
- [x] **toolbar** block adds and renders as an empty strip ("No toolbar items yet").
- [ ] **Reorder blocks** by drag → the new order renders and survives a reload.
- [x] **Remove a block** → it disappears; siblings keep their order.
- [x] A view with **no blocks** → "No blocks yet" empty state, no crash.
- [x] **month-calendar** renders the current month grid.
- [x] month-calendar **before = 1** → also shows the previous month.
- [x] month-calendar **after = 1** → also shows the next month.
- [x] month-calendar **hiddenWeekdays = Sat+Sun** → those two columns hidden.
- [x] month-calendar **hiddenWeekdays = a single midweek day** → only that column
      is hidden (it is a per-weekday toggle group, not a weekend switch).
- [x] month-calendar **weeks = left** → week-number column on the left.
- [x] month-calendar **weeks = right** → week-number column on the right.
- [x] month-calendar **weeks = none** → no week column.
- [x] month-calendar **weeks = default** → inherits the global calendar setting
      (change that setting and confirm the block follows).
- [x] month-calendar **show heading** off → the month/year heading is hidden.
- [x] A week number with **no week journal** still shows as an inactive label.
- [x] **week-calendar** renders week rows (weeks/before/after behave as on
      month-calendar — spot-check one).
- [x] **custom-intervals** lists intervals for its assigned journals.
- [x] custom-intervals **window = month** (etc.) → lists periods at that scale.
- [x] custom-intervals with a journal whose intervals all fall outside the
      window → that journal contributes no section and no divider.
- [x] **divider** renders a separator line.
- [x] **markdown-template** + `templatePath` set → renders that file's markdown.
- [ ] markdown-template with **date-format tokens in the path** → resolves to a
      dated file.
- [x] markdown-template body variables — `date`, `current-date`, `time`,
      `current-time`, `journal-link` → each substitutes.
- [x] markdown-template `journal-link` with a **shift suffix** (e.g. `+1w`) → links
      to the shifted entry.
- [x] markdown-template **"Supported variables" help** modal lists them.
- [x] **Today highlight — day** → today's day cell is marked `data-today`.
- [x] **Today highlight — week** → the week cell containing today is marked.
- [x] **Today highlight — month** → the current month cell is marked.
- [x] **Today highlight — quarter** → the current quarter cell is marked.
- [x] **Today highlight — year** → the current year cell is marked.
- [x] **Active highlight** → opening an entry marks its cell active.

### Toolbar items

Setup: edit a view's toolbar block → add each item. Five item types are registered:
`button`, `shelf-selector`, `spacer`, `period-buttons`, `existing-navigation` — add
every one at least once.

- [x] **Add item** picker lists all five types, including the three button presets
      ("Pick date", "Open note", "Navigate by step").
- [x] **Reorder toolbar items** by drag → the new order survives a reload.
- [x] **Remove a toolbar item** → it disappears; siblings keep their order.
- [x] **spacer** → pushes the items after it to the far edge of the strip.
- [x] **existing-navigation**, direction **previous** → steps back at its configured
      target.
- [x] existing-navigation, direction **next** → steps forward.
- [x] existing-navigation **target = active** → follows the active note's journal
      rather than a fixed period.
- [x] existing-navigation targets **day / week / month / quarter / year / custom** →
      each steps at that scale.
- [x] **button → pick-date** → click opens a date picker.
- [x] pick-date **day** level → selecting a day navigates to that day.
- [x] pick-date **week** level → selecting a week navigates to that week.
- [x] pick-date **month** level → selecting a month navigates to that month.
- [x] pick-date **quarter** level → selecting a quarter navigates to that quarter.
- [x] pick-date **year** level → selecting a year navigates to that year.
- [ ] **button → current** → jumps to the current period at its configured level.
- [ ] **button → navigate-step**, amount 1, forward → steps +1 unit.
- [ ] navigate-step amount 1, **backward** → steps −1 unit.
- [ ] navigate-step **amount = 3** → steps by 3 units.
- [x] button **custom icon** → configured icon renders.
- [x] button **custom label** → configured label renders.
- [x] button **custom tooltip** → configured tooltip shows on hover.
- [ ] Add a toolbar button from the **"Pick a date"** preset, clear its icon → the
      button renders without one after closing the editor.
- [ ] Press the icon field's **reset control** → the crosshair icon returns.
- [x] button **mode = select-only** → clicking moves the displayed period but opens
      nothing.
- [x] button **mode = navigate** → opens an existing entry; a date with no note does
      nothing visible.
- [x] button **mode = create** → opens _or creates_ the entry.
- [x] button with **two or more levels** configured → clicking pops a menu to choose
      the level instead of acting directly.
- [x] button **bound to a specific journal** → acts on that journal regardless of the
      view's shelf scope.
- [x] **shelf-selector** dropdown → lists the available shelves.
- [x] **shelf-selector** selection → re-scopes the calendar to that shelf's
      journals.
- [x] shelf-selector selection **persists** across closing and reopening the view.
- [x] **Delete the selected shelf** → the selector falls back gracefully rather than
      showing a dangling name.
- [x] **period-buttons — week** toggle → shows/hides the week level.
- [x] **period-buttons — month** toggle → shows/hides the month level.
- [x] **period-buttons — quarter** toggle → shows/hides the quarter level.
- [x] **period-buttons — year** toggle → shows/hides the year level.

---

## 9. Shelves

Setup: 3 Day journals (A, B, C); open Settings → dashboard → Shelves block.

- [x] **Create** a shelf "S1".
- [x] **Assign A → S1** via the journal's Shelf section.
- [x] **Assign A → S2** (a second shelf) → A _moves_ off S1 (one shelf per
      journal).
- [x] **Rename** S1 → its journal membership is preserved.
- [x] **Rename** S1 → its shelf-scoped commands re-target the renamed shelf.
- [x] **Delete** a shelf → its journals become unassigned, not deleted.
- [x] **Add journal from inside a shelf's edit subpage** → the new journal is
      auto-assigned to that shelf (the Add-journal modal itself has no shelf field).
- [x] **Delete a shelf → pick a destination shelf** → its journals move there
      instead of becoming unassigned.
- [x] **Delete a journal** that sits on a shelf → the shelf's membership list drops
      it.
- [x] Once any shelf exists → the dashboard's Journals block retitles to "Journals
      not on a shelf" and lists only unshelved journals.
- [x] **Delete a shelf** that a view uses as its default → the view falls back to
      all journals (not to the delete-modal's destination shelf).
- [x] **Delete a shelf** that a shelf-scoped command targets → the command
      disappears from the palette.
- [x] **Shelf-scoped command** (Settings → shelf → Commands) → acts only on that
      shelf's journals.
- [x] View **shelf-selector** set to S1 → calendar shows only S1's journals.

---

## 10. Code blocks (in notes)

Setup: a Day journal "CB" with notes, and a `navBlock`/`intervalBlock` configured
with ≥2 rows. Insert each code block in a markdown note and switch to reading/live
preview.

### journals-home

- [x] ` ```journals-home ` with `show: [day, week, month]` → links for each listed
      period render.
- [x] **separator** option → appears between entries.
- [x] **scale** option → sizing changes.
- [x] **shelf** option → limits to that shelf's journals.
- [x] Clicking a link opens/creates the right entry.

### journal-nav (aliases calendar-nav, interval-nav)

- [x] ` ```journal-nav ` → renders CB's configured nav rows.
- [x] Alias `calendar-nav` → same output.
- [x] Alias `interval-nav` → same output.
- [x] Row variable **`{{date}}`** → substitutes the formatted date.
- [x] Row variable **`relative_date`** → substitutes the relative date.
- [x] Row variable **`journal_name`** → substitutes the journal name.
- [x] Row variable **`index`** → substitutes the numbering index.
- [x] Row style **fontSize** → text size changes.
- [x] Row style **bold** → text is bolded.
- [x] Row style **italic** → text is italicized.
- [x] Row style **color** → text color changes; theme mode's variable list holds
      only text variables.
- [x] Row style **background** → row background changes; theme mode's variable
      list holds only background variables.
- [x] Row **link = self** → click opens the containing entry.
- [x] Row **link = journal** → click opens the journal's entry.
- [x] Row **link = day** → click navigates to the day entry.
- [x] Row **link = week** → click navigates to the week entry.
- [x] Row **link = month** → click navigates to the month entry.
- [x] Row **link = quarter** → click navigates to the quarter entry.
- [x] Row **link = year** → click navigates to the year entry.
- [x] Row **link = none** → the row renders as plain text, not a link.
- [ ] Row variable **`{{start_date}}`** / **`{{end_date}}`** → substitute the
      period's bounds (the default custom-interval rows use these).
- [x] Row **addDecorations on** → the journal's decorations show on the row.
- [ ] Block-level **decorate whole block** on → decorations apply to the block as a
      whole rather than per row.
- [x] Nav block **type = create** → prev/next cycle through periods whether or not a
      note exists, and clicking creates.
- [x] Nav block **type = existing** → prev/next only reach periods that already have
      notes.
- [x] Edit a row via its edit-row modal → change persists in the rendered block.

### calendar-timeline

- [x] ` ```calendar-timeline mode: week ` → renders week timeline.
- [x] `mode: month` → month timeline.
- [x] `mode: quarter` → quarter timeline.
- [x] `mode: calendar` → calendar timeline.
- [x] timeline **weeks = left** → week column on the left.
- [x] timeline **weeks = right** → week column on the right.
- [x] timeline **weeks = none** → no week column.
- [x] timeline **hiddenWeekdays: [0, 6]** → those columns are hidden.
- [x] timeline **hiddenWeekdays** with an out-of-range entry → the valid entries
      still apply, the block does not error.
- [x] **shelf** option → scopes the timeline to that shelf.
- [ ] timeline **mode: week** with **before: 1** and **after: 1** → the previous,
      current and next week render stacked in that order.
- [ ] timeline **mode: month** with **before: 1** → the previous month renders
      above the current one.
- [ ] timeline **before/after** under **mode: quarter** or **mode: calendar** →
      ignored, and the block does not report an unrecognized option.
- [ ] timeline **before: -1** or a non-numeric **after** → treated as unset, the
      block does not error.

### Reference help

- [x] Settings → a journal → Templates section → **Code-block reference** opens a
      modal with syntax docs, click-to-copy snippets, and live previews.
- [x] Closing the modal → today's anchor index mapping is restored (no leftover
      synthetic entry).

---

## 11. Decorations — conditions

Setup: Day journal "Deco" with notes on several dates, **plus a custom-interval
journal "DecoX"** — the offered condition types differ by write type (`date` and
`weekday` are day-only; `offset` is custom-only). Open a calendar view showing
them. Add decorations via Settings → Journals → &lt;journal&gt; → Decorations. For each
condition below, pair it with an obvious style (e.g. background red) so the match
is visible.

- [x] On a **Week/Month/Quarter/Year** journal → the condition dropdown offers
      neither `date`, `weekday`, nor `offset`.

- [x] **date** — + month=current, day=today, year=_any_ → today's cell decorated.
- [x] **date, year=any** → the same month/day in a _different_ year is also
      decorated.
- [x] **date, year-pinned** — + set year=current → only this year's cell.
- [x] **weekday** — + select Mon+Fri → every Monday and Friday cell decorated.
- [x] **offset — From start, day 1** (on DecoX) → the interval's first day (the
      journal's anchor cell) is decorated.
- [x] **offset — From end, day 1** (on DecoX) → the interval's last day is
      decorated.
- [x] **has-note** → only cells that have a linked entry are decorated.
- [x] **has-open-task** — + a linked note with an unchecked `- [ ]` task → that
      cell is decorated.
- [x] **has-open-task** reactivity — check the task → the decoration clears.
- [ ] **all-tasks-completed** — + a linked note with all tasks checked → the cell
      is decorated.
- [x] **all-tasks-completed** reactivity — uncheck a task → the decoration clears.
- [x] **tag — contains** — + condition tag contains `journal` on a note tagged
      `#journal` → decorated.
- [x] **tag — starts-with** → matches by tag prefix.
- [x] **tag — ends-with** → matches by tag suffix.
- [x] **title — contains** → matches when the title contains the substring.
- [x] **title — starts-with** → matches by title prefix.
- [x] **title — ends-with** → matches by title suffix.

### Property conditions (text)

Setup: a linked note with frontmatter `mood: happy`.

- [x] **property text — exists** → decorated when `mood` present.
- [x] **property text — does-not-exist** → decorated when `mood` absent.
- [x] **property text — equals** `happy` → decorated.
- [x] **property text — not-equals** → decorated when value differs.
- [x] **property text — contains** `app` → decorated.
- [x] **property text — does-not-contain** → decorated when substring absent.
- [x] **property text — starts-with** `ha` → decorated.
- [x] **property text — ends-with** `py` → decorated.

### Property conditions (number)

Setup: a linked note with frontmatter `rating: 5`.

- [x] **property number — equals** `5` → decorated.
- [x] **property number — not-equals** → decorated when ≠ 5.
- [x] **property number — less-than** `6` → decorated.
- [x] **property number — less-than-or-equal** `5` → decorated.
- [x] **property number — greater-than** `4` → decorated.
- [x] **property number — greater-than-or-equal** `5` → decorated.
- [x] **property number — exists / does-not-exist** → decorated on presence/absence.

### Property conditions (date)

Setup: a linked note with frontmatter `reviewed: 2026-03-05`.

- [x] **property date — exists** → decorated when `reviewed` present.
- [x] **property date — does-not-exist** → decorated when absent.
- [x] **property date — equals** `2026-03-05` → decorated.
- [x] **property date — not-equals** → decorated when the date differs.
- [x] **property date — less-than** a later date → decorated.
- [x] **property date — less-than-or-equal** the same date → decorated.
- [x] **property date — greater-than** an earlier date → decorated.
- [x] **property date — greater-than-or-equal** the same date → decorated.
- [x] The condition editor offers a **date picker** for the value (the value type is
      auto-derived from the vault's property registry, not chosen by hand).

### Property conditions (checkbox)

Setup: a linked note with frontmatter `done: true`.

- [x] **property checkbox — is-true** → decorated.
- [x] **property checkbox — is-false** → + set `done: false` → decorated.
- [x] **property checkbox — exists / does-not-exist** → decorated on
      presence/absence.

### Condition combination

- [x] Two conditions with **AND** → cell decorated only when both match.
- [x] Two conditions with **OR** → cell decorated when either matches.

---

## 12. Decorations — styles

Setup: a decoration with a single always-true condition (e.g. has-note) on Deco,
so every entry cell is styled. Swap the style per item.

- [x] **background** color → cell background changes.
- [x] **color** (text) → cell text color changes.
- [x] **border — uniform** (width/style/color) → all four sides bordered.
- [x] **border — left** only → only the left edge is bordered.
- [x] **border — right** only → only the right edge is bordered.
- [x] **border — top** only → only the top edge is bordered.
- [x] **border — bottom** only → only the bottom edge is bordered.
- [x] **shape — square** → square marker renders.
- [x] **shape — circle** → circle marker renders.
- [x] **shape — triangle up** → up arrow renders.
- [x] **shape — triangle down** → down arrow renders.
- [x] **shape — triangle left** → left arrow renders.
- [x] **shape — triangle right** → right arrow renders.
- [x] shape **size** → marker resizes.
- [x] shape **x placement = right** → marker sits at the right edge.
- [x] shape **y placement = bottom** → marker sits at the bottom.
- [x] **corner — top-left** → dot in the top-left corner.
- [x] **corner — top-right** → dot in the top-right corner.
- [x] **corner — bottom-left** → dot in the bottom-left corner.
- [x] **corner — bottom-right** → dot in the bottom-right corner.
- [x] **icon** → chosen icon renders.
- [x] icon **size** → icon resizes.
- [x] icon **placement** → icon position changes.
- [x] icon **color** → icon color changes.
- [x] **Color mode: transparent** → no fill.
- [x] **Color mode: theme** (by name) → uses the Obsidian theme color.
- [x] **Color mode: custom** (hex/rgb) → uses the literal color.
- [x] **color** (text) style, theme mode → the variable list holds only text variables;
      `Primary background` is absent.
- [x] **background** style, theme mode → the variable list holds only background variables;
      `Normal text` is absent, `Selected text background` is present.
- [x] **border** style, theme mode → the list is split under **Border** and **Text**
      headings, and each grouped option's label stays fully readable (no truncation)
      despite the native `<select>` indent and the picker's `12em` width cap.
- [x] **shape** style, theme mode → the list is split under **Text** and **Background**
      headings, with no border variables, and every grouped label stays fully readable
      under the same constraints.
- [x] A decoration saved before this change with an out-of-role variable (e.g. a text color
      of `Primary background`) → reopening it still shows that variable selected under its
      friendly label, and the cell renders exactly as before.
- [x] **corner color** → the corner dot uses the configured color.
- [x] **Two styles stacked** in one decoration → both apply, layered in order.
- [x] **Two separate decorations** whose conditions both match the same cell, each
      setting a **background** → the first decoration in the list wins. Reorder them
      and confirm the winner changes.

---

## 13. Decorations — calendar and shelf lists

Setup: two shelves "Work" and "Home", a day journal on each, notes on a few dates,
and a calendar view open. Vault-wide decorations live in Settings → **Calendar
decorations** (dashboard block); a shelf's live in Settings → Shelves → &lt;shelf&gt; →
**Shelf decorations**. Give each one an obvious, distinct style so precedence is
visible.

Only `date` and `weekday` are offered here — everything else needs a journal's
note. Automated by `view` (a vault-wide decoration painting a day cell).

- [x] The journal page's section is titled **Journal decorations** (not "Calendar
      decorations" — that name now belongs to the vault-wide block).
- [x] A calendar or shelf decoration's condition dropdown offers **only** `date`
      and `weekday` — no `has-note`, `tag`, `title`, `property`, or `offset`.
- [x] **Vault-wide, weekday** — + select Sat+Sun → every weekend cell decorated in a
      calendar showing **all journals**.
- [x] The same decoration still paints when the view is scoped to a **shelf**.
- [x] **Shelf decoration on Work** → paints while the view is scoped to Work.
- [x] Switch the view to **Home** → the Work decoration is gone, the vault-wide one
      remains.
- [x] Switch the view to **all journals** → shelf decorations are gone, vault-wide
      remains. Neither shelf's list leaks in.
- [x] **Nav code block in a daily note** → its day rows pick up vault-wide
      decorations.
- [x] **Nav code block in a weekly note** → its week rows do **not** (day cells
      only, by design).
- [x] **Custom-interval rows** → not decorated by vault-wide rules, even when an
      interval starts on a matching day.
- [x] **Toolbar period badges** (week/month/quarter/year) → unaffected.
- [x] **Timeline code block** in a note whose journal sits on Work → paints Work's
      shelf decorations, same as the calendar view.

### Precedence between owners

Setup: a journal decoration, a shelf decoration and a vault-wide one whose
conditions all match the same day cell.

- [x] **Background** — the journal's wins; remove it and the shelf's wins; remove
      that and the vault-wide one shows. Same for **text color**.
- [x] **Border** — the **vault-wide** one wins over the journal's. This is
      last-wins and is documented, not a bug (see the design spec's Precedence
      section).
- [x] **Shape / corner / icon** — every owner's renders; they stack rather than
      compete.

### Lifecycle

- [x] Add a vault-wide decoration **while a calendar view is open** → the cells
      update without reopening the view or reloading.
- [x] Edit it → the change lands live. Delete it → the cells clear.
- [x] Delete a shelf, then reopen settings → no orphaned decoration UI.
- [x] Open a vault whose `data.json` predates this feature → shelves keep **all
      their journals**, both lists start empty, and nothing is reset to defaults.

---

## 14. Settings UI navigation & validation

Setup: open the Journals settings tab.

- [x] Dashboard renders blocks in order: colliding-journals, shelves, journals,
      commands, views, startup, calendar-week, calendar-appearance, logging.
- [x] **Journals** block → click a journal → journal edit subpage opens (shelf,
      commands, interval-block, decorations sections).
- [x] Back from journal subpage → returns to dashboard.
- [x] **Views** block → click a view → opens its view edit subpage.
- [x] **Shelves** block → click a shelf → opens its shelf edit subpage.
- [x] **Commands** block → global command editor.
- [x] Journal subpage sections render in order: note-creation, templates, timeline,
      sequence, frontmatter, shelf, commands, interval-block, decorations.
- [x] Back from a **view** and a **shelf** subpage → each returns to the dashboard
      with the list scrolled where you left it.

Field validation lives in §19 — it is one behavior class and testing it in one
sitting is faster than rediscovering the pattern per screen.

- [x] **calendar-week** — change week-start day → calendar grids shift to the new
      first day.
- [x] **calendar-week** — change week-start day → week numbers recompute.
- [x] **calendar-week** — locale preset → dow/doy update to the preset.
- [x] **calendar-appearance** — today color picker → applies live to today's cell;
      theme mode's variable list holds only text variables.
- [x] **calendar-appearance** — today background picker → applies live to today's
      cell; theme mode's variable list holds only background variables.
- [x] **calendar-appearance** — active color picker → applies live to the active
      cell; theme mode's variable list holds only text variables.
- [x] **calendar-appearance** — active background picker → applies live to the
      active cell; theme mode's variable list holds only background variables.
- [x] **calendar-appearance** — a cell that is both today and active → today's
      style wins.
- [x] **logging** — raise log level → more console output.
- [x] **logging** — lower log level → less console output.

---

## 15. Startup & background behaviors

- [x] **Open on startup** — + set startup journal = a Day journal; reload Obsidian
      → today's entry opens automatically on launch.
- [x] Startup journal = a **Month** (or Week/Quarter/Year/custom) journal → reload →
      the current period's entry opens, stamped with the period's canonical anchor,
      not today's exact date.
- [x] Open-on-startup does **not** re-fire on later layout changes within a
      session (only genuine launch).
- [x] Rename the startup journal → reload → still opens (name reconciled).
- [x] Delete the startup journal → reload → fails silently, no crash.
- [x] **autoCreate** — + a Day journal with autoCreate on; advance system clock
      past local midnight (or reload after midnight) → tomorrow's note appears.
- [x] autoCreate scheduling does not double-fire across the midnight boundary.
- [x] **Auto-attach** — + manually create a note matching a journal's
      folder+name pattern within its timeline → journal frontmatter auto-added.
- [x] Auto-attach on **rename** — rename an unrelated note _into_ a matching
      folder+name → it is attached the same as a fresh creation.
- [x] Auto-attach does **not** double-process a note the plugin itself just
      created (self-write guard, ~5s window).
- [x] Auto-attach leaves a note untouched when **multiple journals** could match
      (ambiguous).

---

## 16. Migration (existing data)

Setup: **back up `data.json` first.** Reload after each load to let the async note
migration run.

A v1 `data.json` runs the **whole** chain (v1→v2→v3→v4) in one load, so the
shipped `e2e/fixtures/e2e-legacy-v1` vault exercises every step below — copy it
into a scratch vault to run this section. A separate v2- or v3-era snapshot is
only needed to test _entering_ the chain part-way; if you have a real one from a
user report, use it, otherwise note in sign-off that only the full chain was
covered.

- [x] **v1 → v2** — load v1 config → calendar journals split into per-period
      journals; interval journals preserved with unique names; shelves created;
      default commands present.
- [x] **v1→v2 note rewrite** (async, after load) → connected notes get the new
      journal name; old keys (e.g. `journal-section`) removed; interval indexes
      migrated to numbering keys; orphaned keys stripped.
- [x] No note left **half-migrated** after the async pass completes.
- [x] **v2 → v3** — commands collection added.
- [x] **v2 → v3** — `shelf.commands` array present.
- [x] **v3 → v4** — journals/shelves stay keyed by **name**; migrated commands are
      keyed by their **v2 hotkey slug** so existing hotkey bindings survive. (Only
      commands created fresh in v3 get a nanoid id — migration mints none.)
- [x] **v3 → v4** — per-journal/shelf command arrays flattened into the global
      commands collection.
- [x] **v3 → v4, week journals** — the async pass rewrites each week note's date
      field to the canonical week anchor.
- [x] **v3 → v4** — startup slice added.
- [x] **v3 → v4** — views reshaped to the new config.
- [x] **Idempotent** — reload a migrated vault a second time → no duplicate
      journals/commands/shelves.
- [x] Existing notes in a migrated vault still **open and navigate**.
- [x] (v1→v2 migration is **non-interactive** in v3 by design — confirm, don't
      file as a bug.)

---

## 17. Regression / edge cases

- [ ] **Cross-year week** — + a week spanning Dec→Jan → anchors to the correct
      owning year (the v2 `{{date:YYYY}}` bug stays fixed).
- [x] Rapidly create+delete journals/views/commands → no leaked leaves, ribbon
      icons, or palette entries.
- [x] Change **global locale / week-start** → month/week calendars update to the
      new first day.
- [x] Change **global locale / week-start** → `calendar-timeline` blocks update to
      match.
- [x] Change **global locale / week-start** → week numbers recompute consistently.
- [x] **Large vault** — generate ≥1000 journal notes across ≥3 journals → the
      calendar view paints within ~1s of opening, and a month step feels immediate
      (no visible stall). Record the numbers in sign-off rather than judging "lag".
- [ ] Note with **malformed frontmatter** → indexing does not crash.
- [ ] Note with **malformed frontmatter** → other journals still index normally.
- [ ] Note with **malformed `data.json`** (hand-corrupt one journal entry) → that
      entry resets to defaults, the rest of the settings survive.

---

## 18. Opening: modes, modifiers, and menus

Setup: a Day journal "Open" with a few existing entries; a calendar view, a
`journal-nav` block, and a `journals-home` block all visible.

### Click modifiers

The same modifier map applies to every affordance below: **Ctrl/Cmd → new tab**,
**Ctrl/Cmd+Alt → split**, **middle-click → new tab**, plain click → active pane.

- [x] **Calendar day cell** — Ctrl/Cmd+click → opens in a new tab.
- [x] Calendar day cell — **middle-click** → opens in a new tab.
- [x] Calendar day cell — Ctrl/Cmd+Alt+click → opens in a split.
- [x] **Week number / month / year header** cell → same modifier behavior.
- [x] **`journal-nav` row** → same modifier behavior.
- [x] **`journal-nav` prev / next arrows** → same modifier behavior.
- [x] **`journals-home` link** → same modifier behavior.
- [x] **Toolbar button** → same modifier behavior.
- [x] **Period badge** (period-buttons item) → same modifier behavior.
- [x] **Existing-notes navigation arrow** → same modifier behavior.

### Entry already open

`uri-open` covers this seam through the URI handler; walk it here for the
affordances the harness cannot drive.

Setup: pop a journal entry out into its own window (drag its tab out, or open it
with **Open mode: new window**), then click back into the main window.

- [ ] **Open that same entry** from a command, a calendar cell, or a `journal-nav`
      row → it opens in the window you are in. Focus must not jump to the popout.
- [ ] Repeat with the popout focused → the entry opens there, and no second pane
      appears in the main window.
- [ ] **Ctrl/Cmd+click** a cell whose note is already open in the current window →
      a second pane appears; the existing pane is not merely focused.

### Context menus

- [x] **Right-click a calendar cell with a note** → native file menu appears.
- [x] That menu includes a **Delete** entry (appended by the plugin; Obsidian does
      not guarantee one).
- [x] Deleting from that menu → the note goes to trash and the cell empties.
- [x] **Right-click a period badge** → same menu.
- [x] **Right-click a `journal-nav` row** → same menu.
- [x] Right-click a cell with **no** note → no menu / no crash.

### Multi-journal disambiguation

Setup: two Day journals whose entries land on the same date.

- [x] **Click** a date served by both → a centered suggest modal lists both.
- [x] Pick one → that journal's entry opens.
- [x] **Dismiss** the suggest modal (Esc) → nothing opens, no error notice.
- [x] Trigger the same date from a **command** or keyboard → centered suggest
      (not the at-pointer menu).

### URI handler (`obsidian://`)

Covered by `uri-open`; walk manually only when investigating.

Setup: `test-vault` open, with its stock journals `day`, `week` and `month`
(no `quarter` or `year` journal — some items below depend on that). Every item's
link fires the request: click it from a renderer that allows the `obsidian://`
scheme (Obsidian reading view — open the repo as a vault, or copy this section
into a note). Where clicking does nothing, the renderer is blocking the scheme,
not the plugin: copy the target and run `xdg-open '<url>'`, quoted, `&` is a
shell operator. Between items, close what opened so the next result is unambiguous.

**Journal targeting**

- [ ] [journal=day&date=today](obsidian://journals?vault=test-vault&journal=day&date=today)
      → opens today's `day` entry.
- [ ] [journal=day, no date](obsidian://journals?vault=test-vault&journal=day) → same
      entry; an absent date means today.
- [ ] [journal=week&date=2026-03-05](obsidian://journals?vault=test-vault&journal=week&date=2026-03-05)
      → opens the **week** containing 2026-03-05, not a day note.
- [ ] [journal=month&date=2026-03-05](obsidian://journals?vault=test-vault&journal=month&date=2026-03-05)
      → opens 2026-03.

**Write-type targeting**

- [x] [type=day&date=2026-03-05](obsidian://journals?vault=test-vault&type=day&date=2026-03-05)
      → opens that day through the `day` journal.
- [x] [type=month&date=2026-03-05](obsidian://journals?vault=test-vault&type=month&date=2026-03-05)
      → opens 2026-03.
- [x] + a **second** Day journal covering the same dates:
      [type=day&date=today](obsidian://journals?vault=test-vault&type=day&date=today)
      → centered suggest modal lists both; picking one opens it, Esc opens nothing and
      shows no error.
- [x] [type=quarter&date=today](obsidian://journals?vault=test-vault&type=quarter&date=today)
      → notice naming the write type — a valid type with no journal behind it, not a
      silent no-op.

**Relative dates** (all against `journal=day`; check the opened note's date)

- [x] [date=+3d](obsidian://journals?vault=test-vault&journal=day&date=%2B3d) → today +
      3 days.
- [x] [date=-2w](obsidian://journals?vault=test-vault&journal=day&date=-2w) → 14 days
      back.
- [x] [date=+1m](obsidian://journals?vault=test-vault&journal=day&date=%2B1m) → same
      day-of-month, next month.
- [x] [date=+1q](obsidian://journals?vault=test-vault&journal=day&date=%2B1q) → three
      months on.
- [x] [date=-1y](obsidian://journals?vault=test-vault&journal=day&date=-1y) → same date,
      last year.
- [x] [date=+3d, raw `+` instead of `%2B`](obsidian://journals?vault=test-vault&journal=day&date=+3d)
      → either resolves the same as the `%2B` item above or shows the unreadable-date
      notice; never opens the wrong date silently.

**Open modes**

- [x] [mode=tab](obsidian://journals?vault=test-vault&journal=day&mode=tab) → new tab.
- [x] [mode=split](obsidian://journals?vault=test-vault&journal=day&mode=split) → split
      pane.
- [x] [mode=window](obsidian://journals?vault=test-vault&journal=day&mode=window) →
      popout window. Close it before the next item — a stray popout steals later opens.
- [x] [mode=active](obsidian://journals?vault=test-vault&journal=day&mode=active) →
      reuses the active leaf, same as omitting `mode`.

**Failure modes** — each must produce a notice; "nothing happened" is a bug

- [x] [neither journal nor type](obsidian://journals?vault=test-vault&date=today) →
      error notice, no note created.
- [x] [type=fortnight](obsidian://journals?vault=test-vault&type=fortnight&date=today) →
      error notice naming `fortnight`.
- [x] [date=not-a-date](obsidian://journals?vault=test-vault&journal=day&date=not-a-date)
      → error notice naming the unreadable date.
- [x] [mode=sideways](obsidian://journals?vault=test-vault&journal=day&mode=sideways) →
      error notice naming the unknown mode.
- [x] [journal=Missing](obsidian://journals?vault=test-vault&journal=Missing&date=today)
      → error notice naming the journal, not a silent no-op.
- [x] + set the `day` journal's timeline start to 2026-01-01:
      [journal=day&date=2025-12-31](obsidian://journals?vault=test-vault&journal=day&date=2025-12-31)
      → notice, no note created. (Stock `test-vault` journals are unbounded, so without
      that setup the date resolves and the item proves nothing.) Clear the start
      afterwards.

---

## 19. Error & recovery surfaces

This is the class most prone to failing **silently** — an item passes only if
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
- [ ] Journal whose **note name template is empty** → the settings field shows a
      warning, and running the journal's open command shows a notice naming the
      journal. No `.md` dotfile appears in the vault.

### Code-block errors

- [x] Code block with **malformed YAML** → an error panel says the options could not
      be read; the note still renders.
- [x] Code block with a **wrong-typed option** (e.g. `mode: 42`) → schema error panel
      or documented graceful degrade, not a blank block.
- [x] Code block with an **unrecognized option** → a warning names the ignored key
      and the block still renders.
- [x] `journal-nav` in a note **not connected** to any journal → "not connected"
      message, not an empty block.

### View errors

- [x] Leave a view's tab open, **delete the view** → the tab shows a "view deleted"
      panel, not a crash or a blank pane.
- [x] Hand-edit `data.json` to give a block an **unknown type** → that block shows an
      unknown-block panel; sibling blocks still render.
- [x] Hand-edit a block's config to something **invalid** → config-error panel,
      siblings unaffected.
- [x] A calendar block with **no journals at all** → the grid still renders, with no
      empty-state message; its cells are inert.
- [x] A calendar block **scoped to a shelf** with no members → same as above.
- [x] `markdown-template` pointing at a **missing file** → read-error message.

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

## 20. Appearance & accessibility

No automated check can judge any of this. It is the reason a human runs this pass.

### Theme & legibility

- [x] **Theme switch** light ↔ dark → decoration & calendar colors stay legible.
- [x] **Custom theme** applied → decoration & calendar colors stay legible.
- [x] Decoration **color mode: theme** under both light and dark → follows the theme.
- [x] Today vs. active cell styling stays distinguishable in both themes.

### Keyboard

- [ ] **Tab** through a calendar view → every interactive cell and toolbar control is
      reachable.
- [ ] Every focused control shows a **visible focus ring**. (Known open: calendar
      cells are focusable with no ring — parity item 124.)
- [ ] **Enter / Space** on a focused calendar cell → opens the entry.
- [ ] Block and toolbar-item controls in the **view editor** are reachable without a
      mouse. (Known open: they are hover-only — parity item 123.)
- [ ] Modals trap focus and **Esc** closes them.

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
