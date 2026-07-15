# v2 → v3 Feature Gap Audit

Date: 2026-06-01
Branch: `v3-ai`

Tracks every v2 feature missing or reduced in v3. v2 reference code lives in
`src/_old-code/` (also on `main`); v3 code is in `src/`. Data migration is
explicitly **out of scope** here — it is the last step and is tracked separately.

Each item cites the v2 source and the v3 location (or its absence). Verified by
reading code, not inferred.

---

## How to use this doc

- `[ ]` = gap still open, `[x]` = closed (ported / decided won't-do).
- Severity: 🔴 user-facing feature lost · 🟡 capability moved/changed (confirm intent) · 🟢 behavioral delta.
- When closing an item, append the resolving commit or a short note.

---

## 🔴 Functional regressions (user-facing features lost)

- [x] **1. Bulk add notes** — ported (`20afa42b..7e497b0a`).
  - v2: `src/_old-code/components/modals/bulk-add-notes/` (`ConfigureBulkAddNotes.vue`, `BulkProcessNotes.vue`, `bulk-add-note-utilities.ts`) — extract date from title/property, filter by conditions, dry-run preview, per-note connect/merge/override/move/rename.
  - v3: `src/journals/notes/bulk-add/` — `BulkAddService` (`plan`/`apply`), ported `formatToRegexp`, two-stage configure/process modals (filters reuse decoration title/tag/property conditions; per-note skip reasons; all three "ask" decisions; merge; dry-run), `BulkAddFlow`, launched from the per-journal settings page. Reuses `NoteConnectionService`.

- [x] **2. Connect note to a journal** — ported (`8ae32da9..ffb8cb30`).
  - v2: `connect-note` command (`src/_old-code/main.ts` `#configureCommands`) + `ConnectNote.modal.vue`.
  - v3: `connect-note` command (`NoteConnectionCommands`) → `ConnectNoteModal` (journal/date pickers + conditional override/rename/move toggles, or Disconnect when already connected) → `ConnectNoteFlow` → `NoteConnectionService.connect`.

- [x] **3. Disconnect note** — ported (`8ae32da9..ffb8cb30`).
  - v2: `JournalPlugin.disconnectNote` / `Journal.disconnectNote` strips all journal frontmatter keys from a note.
  - v3: `NoteConnectionService.disconnect` strips the journal's frontmatter keys via `FrontmatterService.clearMutator` (with an orphan fallback to the default key set); surfaced through the connect modal's Disconnect button and reused by connect-override and bulk-add. No standalone command (v2 parity).

- [x] **4. Open on startup** — ported.
  - v2: `PluginSettings.openOnStartup` + `openStartupNote()` opened a chosen journal's note in the `onLayoutReady` hook (`src/_old-code/main.ts:425-433`); kept in sync on rename/remove.
  - v3: `src/journals/startup/` — `startupSlice` ({ journalName }), `StartupOpenService` (opens today's note via `OpenJournalEntryFlow` only on genuine launch, gated on `appStartup = !workspace.layoutReady`; reconciles the stored name on journal `renamed`/`deleted`), `StartupBlock` dashboard block. `WorkspaceService` gained `layoutReady`/`onLayoutReady`. Initialized from `main.ts`.

- [x] **5. Delete journal: `clear` / `delete` note handling** — ported.
  - v2: `removeJournal(name, notesProcessing)` with `keep | clear | delete` via `Journal.clearNotes()` / `deleteNotes()` (`src/_old-code/main.ts:233-259`).
  - v3: `NoteConnectionService.disconnectAll` / `deleteAll` (best-effort, snapshot the journal index via `entriesFor`); `DeleteJournalFlow` dispatches on the modal mode and purges before `repository.delete`. `DeleteJournalModal` returns the chosen mode with all options enabled. Delta: `delete` trashes (recoverable) via `NotesService.delete` rather than v2's permanent `vault.delete`.

- [x] **6. Rename journal does not rewrite note frontmatter** — ported.
  - v2: `renameJournal` looped the index and rewrote `FRONTMATTER_NAME_KEY` in every connected note (`src/_old-code/main.ts:224-230`).
  - v3: `NoteConnectionService.reconnectAll(oldName, newName)` (best-effort, snapshots the journal index via `entriesFor`, reuses the shared `#forEachConnected` helper) rewrites only `FRONTMATTER_NAME_KEY` in every connected note — config field names are unchanged by rename, matching v2. `RenameJournalFlow` calls it after a successful `repository.rename`, so a rejected rename (name taken / unknown) leaves notes untouched.

- [x] **7. Calendar sidebar placement (left/right)** — ported.
  - v2: `calendarView.leaf: "left" | "right"` + `placeCalendarView()` using `getLeftLeaf`/`getRightLeaf`, auto-placed on load.
  - v3: per-view `leaf: "left" | "right" | "tab"` field on `viewSchema` (default `right`); `ViewHostService.#leafFor` resolves the leaf via the matching workspace getter (`?? getLeaf(true)` fallback) and `revealLeaf`s it on `#open`; "Open in" selector in `ViewEditSubpage`. Delta: applies on open, not via a live watcher.

- [x] **8. Today highlight in calendar view** — ported.
  - v2: side-panel month grid set `data-today` on the current day (`_old-code` `NotesMonthView.vue:78`).
  - v3: `NotesCalendarCell` emits `data-today` for any cell whose period contains `CalendarDate.today()` (day/week/month/quarter/year). Extension over v2's day-only highlight.

- [x] **9. today/active cell color customization** — ported.
  - v2: `calendarView.todayStyle` + `activeStyle` (each `{ color, background }` `ColorSettings`), edited with color pickers, applied via `v-bind` on `[data-today]`/`[data-selected]`.
  - v3: global `appearance` slice (`src/notes-calendar/appearance/`) with today/active `{ color, background }` (defaults ported from v2), edited via `AppearanceBlock` dashboard block (reuses `UiColorSettingsPicker`); `CalendarAppearanceBridge` applies them as `--journal-cell-*` CSS vars on the active document body; `NotesCalendarCell` consumes them on `[data-active]`/`[data-today]` (today wins). Scoped to calendar cells.

- [x] **10. Week-number column position** — ported.
  - v2: `calendarView.weeks: "none" | "left" | "right"`.
  - v3: per-block `weeks: "none" | "left" | "right"` (default `left`) on the month/week-calendar blocks; `NotesMonthView`/`NotesWeekView` drive visibility + position from it (`data-weeks`), superseding the journal-presence auto-hide (a week number with no week journal now shows as an inactive label, matching v2). The `calendar-timeline` code block gained its own `weeks` field (source-authored) threaded through all four modes, so its week column is author-controllable too.

- [x] **11. Code-block reference help modal** — ported.
  - v2: `CodeBlockReference.modal.vue` (+ `CodeBlockReferenceHint.vue`) — in-settings syntax docs, timeline mode list, home-block options, alias notes, click-to-copy snippets, live previews.
  - v3: `src/journals/settings/ui/` — `CodeBlockReferenceHint` (in the Templates section, between the variable-reference and Templater-support hints, matching v2 placement) opens `codeBlockReferenceModal` → `CodeBlockReferenceModal`. Documents `journal-nav` (+ `calendar-nav`/`interval-nav` aliases), `calendar-timeline` (modes from the shared `timelineModes` + the v3 `weeks` option), and `journals-home` (show/separator/scale/shelf), with click-to-copy `CodeBlockSnippet`s and live previews rendered via `use-code-block-preview-path` (registers a synthetic `JournalsIndex` entry at today's anchor for the open journal, unregistered on close — v2-literal). Delta: registering the synthetic entry at today's anchor temporarily repoints that anchor's index mapping while the modal is open (v2's latent behavior, explicitly chosen).

---

## 🟡 Architectural changes — capability survives in a different shape (confirm intent)

- [x] **12. `change-calendar-shelf` command + global `ui.calendarShelf`** — restored as per-view dynamic commands (decided 2026-07-15). `ViewHostService` registers `journal:change-shelf:<viewId>` ("Change shelf in <view>") per view, gated on shelves existing and the view being open; it opens `shelfPickerSuggest` (All journals + every shelf) and applies the pick to the open leaves via `JournalViewLeaf.setShelf` — the same reactive leaf state the toolbar selector drives.

- [x] **13. `open-calendar` stable command** — restored as a stable alias (decided 2026-07-15). `ViewHostService` registers the fixed `open-calendar` id alongside the per-view commands; it opens the seeded Calendar view, falls back to the first remaining view, and hides only when no views exist. v2 hotkeys bound to `journals:open-calendar` work again.

- [x] **14. `useShelves` toggle** — removed. **Decided won't-do (2026-06-13): always-on shelves is an intentional design decision.**
  - v2: `PluginSettings.useShelves` gated the whole shelves UI; explanatory copy described shelf scoping.
  - v3: no toggle/slice field; shelves always available (`ShelvesDashboardBlock` unconditionally registered). Explanatory copy gone.

- [x] **15. Reload-hint UX (`showReloadHint`)** — restored (decided 2026-07-15) as the session-scoped `ReloadHintService` (a restart inherently clears the flag, so v2's persist-then-reset-on-load reduces to a session ref). `SettingsDashboard` shows a warning banner while a reload is pending; `CalendarWeekBlock` requests it when the apply-globally toggle flips or a preset change touches the active global week patch.

- [x] **16. Dismissable notifications (`dismissedNotifications`)** — gone. **Decided won't-do (2026-07-15): no current content needs the banner channel; reintroduce if a release notice ever calls for it.**
  - v2: `dismissedNotifications[]` + `dismissNotification(id)` + `notifications.ts` registry + dashboard banners with dismiss buttons.
  - v3: no notifications module, slice field, or banner.

- [x] **17. Journal in multiple shelves** — data model reduced to one shelf per journal. **Decided won't-do (2026-07-15): v2's runtime was effectively single-shelf; v3's one-owner model stands.**
  - v2: `JournalSettings.shelves: string[]`.
  - v3: membership only on shelf side (`ShelfConfig.journals[]`); `ShelvesService.assign` removes from all other shelves first. v2 runtime already behaved single-shelf, so likely no real-world loss — confirm and close.

---

## 🟢 Behavioral deltas (intentional-looking; were untested in v2)

- [x] **18. `reset_after` numbering cycle range** — **v3 semantics confirmed (2026-07-15):** cycle spans [anchorValue, anchorValue+count-1]; v2's 0-based modulo was an off-by-anchor bug.
- [x] **19. `allowBefore` uniformity** — **v3 semantics confirmed (2026-07-15):** allowBefore gates all sources uniformly; v2's negative-mirroring branch stays retired.
- [x] **20. Week cross-year anchor** — v3 `WeekPeriod` (`src/calendar/period-week.ts`) fixes the known v2 bug. Improvement, no action.

---

## ✅ Verified fully ported (no action)

- **Decorations** — all 9 condition types + every operator, all 6 style types + options, border modes, shapes/placements, corner placements, icon options, all 3 `ColorSettings` modes, or/and. v3 adds number/boolean property conditions. _Caveats: the `theme` color picker is now free-text (#26); weekday/date condition inputs and border options changed cosmetically (#31–#33)._
- **Write intervals & end conditions** — day/week/month/quarter/year/custom; never/date/repeats; start bound; custom-interval stored-end anchoring + month-end clamping preserved. (v2 `weekdays` write type was dead code — correctly absent.)
- **Numbering** — enabled/anchor/allowBefore/increment/reset_after, generalized to multi-source.
- **Templates** — nameTemplate, dateFormat, folder, templates[], confirmCreation, autoCreate (now midnight-scheduled), all frontmatter fields, all template variables + modifiers, Templater cursor jump.
- **Code blocks** — all 5 names/aliases (`calendar-timeline`, `calendar-nav`/`interval-nav`/`journal-nav`, `journals-home`); all NavBlockRow fields + link variants; timeline week/month/quarter/calendar modes; home options. Edit-row modal preserved.
- **Commands** — open-next/open-prev; all 9 per-journal `type` variants; all 3 contexts; all 4 open modes; ribbon/icon; plugin-level + shelf-scoped commands (unified superset). _Caveat: fresh installs no longer get the 15 seeded default commands — see #21._
- **Calendar week customization** — dow/doy/global locale with presets.
- **Shelves CRUD** — create/rename/remove (with reassign-on-remove), move journal, settings dashboard, create-journal modal, date picker (richer than v2).

---

# Second-pass audit — 2026-06-13

Deeper UI-focused diff of `_old-code/` vs `src/`. Items below were not caught in
the 2026-06-01 pass. `useShelves` (#14) and the markdown-only template suggester
were reviewed and **dismissed** (intentional design / acceptable). Everything
else is tracked here.

## 🔴 Functional regressions (user-facing features lost)

- [x] **21. Fresh installs get zero command-palette commands.** Fixed (`25e4a9d3`): added a `seed` to `commandCollection` with the 15 v2 defaults. Likely an oversight, not a design choice — the `views` collection seeds a default (`src/views/config.ts:53`) but `commands` did not.
  - v2: 15 seeded defaults on fresh install (Open today's/weekly/monthly/quarterly/yearly + next-period ×5 + last-period ×5) — `src/_old-code/defaults.ts:30-205`.
  - v3: `commandCollection = defineCollection("commands", …)` passes no `options.seed` (`src/commands/config.ts:52`; signature `src/settings/schema.ts:31-38`). Migrated users keep theirs via v2→v3 backfill; new users get none.
  - Fix: add a `seed` to `commandCollection` mirroring the 15 v2 defaults.

- [x] **22. Weekday header row (Mon/Tue/…) gone from every in-view calendar.** Fixed (`581b3af5`): both grids now render a weekday header derived from the actual rendered days (stays aligned with the configured first-day-of-week).
  - v2: `<CalendarWeekdays/>` rendered inside both grids — `src/_old-code/components/notes-calendar/NotesMonthView.vue:69`, `NotesWeekView.vue:68`.
  - v3: neither `src/notes-calendar/ui/NotesMonthView.vue` nor `NotesWeekView.vue` renders a weekday header. Affects month-calendar block, week-calendar block, and timeline month/quarter/calendar modes (all reuse `NotesMonthView`). The primitive still exists in the date-picker (`src/calendar/ui/CalendarMonthView.vue:42`) — just not wired into the notes calendar.

- [x] **23. Connect-note date is no longer bounded to the journal timeline.** Fixed (`a3a367e7`): the Connect button is gated on `TimelineService.contains`, with an explanation when the chosen date is out of bounds. Enforced at the modal (where v2 enforced it via the picker); bulk-add's connect path was already timeline-gated in its plan phase.
  - v2: picker bound `:min`/`:max` to journal start/end — `src/_old-code/components/modals/ConnectNote.modal.vue:160`.
  - v3: bare `<input type="date">` with no bounds (`src/journals/notes/ui/ConnectNoteModal.vue:128`); `anchor` resolves via `cycle.anchorOf` with no `timeline.contains` check, and `buildMetadata` doesn't validate bounds (`src/journals/notes/frontmatter.ts:61-75`). A note can be connected to a date outside the journal's span, then won't surface in bounded views.

- [x] **24. Custom-intervals block lost the active-note highlight.** Fixed (`d2d8a9af`): the entry whose (journal, anchor) matches `ActiveEntryViewModel` gets `data-active` and the shared `--journal-cell-active-*` highlight, mirroring `NotesCalendarCell`.
  - v2: the interval row matching the open note got an `is-active` class using the configured active color/background — `src/_old-code/calendar-view/CalendarViewCustomInterval.vue:36,51-57`.
  - v3: `src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue` has no active-entry highlighting. (Month-calendar cells still highlight; only this section regressed.)

## 🟡 Architectural changes — capability survives in a different shape (confirm intent)

- [x] **25. Toolbar button action-mode + period-button levels not editable after creation.** Fixed (`abee0316`). Root cause turned out to be deeper than the original note: every toolbar item (and block) defines a `configComponent`, and `ViewsService.updateToolbarItemConfig` already existed and was unit-tested, but **no settings UI ever mounted a `configComponent` or called the update** — `ToolbarItemsList`/`BlocksList` only had add/move/remove. So _no_ post-creation editing was reachable, not just mode/levels. The fix wires the missing affordance: a new generic `EditToolbarItemModal` mounts an item's `configComponent` (working copy + Save/Cancel), and `ToolbarItemsList` gained a per-row edit pencil (shown only when the definition has a `configComponent`) that opens it and persists via `updateToolbarItemConfig`. Separately, `ButtonItemConfig.vue` now exposes the behavior dropdown (select-only/navigate/create) and a toggle per period level (day…year, minimum one, kept in canonical order) for `pick-date`/`current` actions; `navigate-step` buttons show neither (they have no mode/levels).
  - v2: persisted `todayMode`/`pickMode` settings (`navigate`/`create`/`switch_date`) — `src/_old-code/types/settings.types.ts:36-37`.
  - v3: the `mode` field exists in the schema (`src/views/toolbar-items/button/button-config.ts:8`) but its config editor was unreachable, so mode/levels were frozen at the add-time preset.

- [x] **26. Theme color picker downgraded to free-text.** Fixed (`5933d96d`). Restored the named-theme-color dropdown + live swatch (`THEME_COLOR_NAMES` + `UiColorSettingsPicker`), reversing the earlier free-text decision per explicit user request. The dropdown lists the ~32 Obsidian theme variables by name; a previously stored variable that isn't a known theme color stays selectable so existing data round-trips.
  - v2: dropdown of ~32 named Obsidian theme colors + live swatch — `src/_old-code/components/ColorPicker.vue:66-71`.
  - v3: single free-text CSS-variable input, no dropdown/swatch — `src/ui/UiColorSettingsPicker.vue:44`. Affects every color control; typos silently yield `var(--typo)`.

## 🟢 Behavioral / cosmetic deltas

- [x] **27. open-next/open-prev lost feedback + editor gating.** Fixed (`124e8166`). The commands stay available whenever a note is active (editor gating, mirroring v2's `editorCallback`) and `execute` shows a `Notice` for each no-op — "not connected to a journal" / "no next/previous note" — instead of silently disabling. v2 ref: `src/_old-code/main.ts:555-601`.
- [x] **28. Bulk-add: date-format live preview dropped.** Fixed (`124e8166`). The existing `DateFormatPreview` now renders live under the date-format field in `ConfigureBulkAddModal`.
- [~] **29. Bulk-add: dry-run default flipped `false`→`true`.** Kept as the intentional v3 default (user confirmed). Preview-first is the safer default; not reverted. `src/journals/notes/bulk-add/config.ts:47`.
- [x] **30. Bulk-add: live per-note progress indicator removed.** Fixed (`124e8166`). `BulkAddService.apply` takes an `onProgress(done, total)` callback fired after each note; `ProcessBulkAddModal` shows "Processing X of N…" while the batch runs.
- [x] **31. Decoration weekday-condition labels changed.** Fixed (`52c4d782`). Short weekday names ordered from the locale's first-day-of-week, carrying each weekday's true Sunday-first index, via a new `Calendar.weekdaysShort()`. Stored indexes unaffected.
- [x] **32. Decoration date-condition month is now a number input.** Fixed (`52c4d782`). Restored the localized month-name dropdown (`Calendar.months()`) in place of the bare 1–12 number input.
- [x] **33. Decoration border `groove` option dropped (`double` added).** Fixed (`52c4d782`). Re-added the `groove` option (kept v3's added `double`); `style` is `v.string()` so no schema change was needed.
- [x] **34. Icon suggestions no longer alphabetically sorted.** Fixed (`52c4d782`). `UiIconSuggest` sorts its filtered results again.
- [x] **35. `UiCollapsibleBlock` dropped `defaultExpanded`.** Verified — no change needed. Audited every call site: the sections v2 opened-by-default (journals/shelves/commands/views dashboards) all initialize their own `expanded` ref to `true` in v3, a superset of v2's "open when non-empty". The dropped prop lost no capability.
- [x] **36. Folder suggester now includes vault root `/`.** Fixed (`52c4d782`). `FolderInput` drops the vault root (`""`/`"/"`) from candidates, matching v2; `listFolders` is unchanged.
- [x] **37. Timeline quarter/calendar connector lines dropped (cosmetic).** Fixed (`5933d96d`). Re-added the faint grid divider-line CSS to `TimelineQuarter`/`TimelineCalendar`.
- [~] **38. Home-block click always opens all journals of an entry.** Kept as the intentional v3 behavior (user confirmed). Opening all journals of an entry is the deliberate simplification; not reverted. `src/code-blocks/home/ui/HomeCodeBlock.vue:62-68`.

## 🐛 Not a regression — new v3 feature that ships non-functional

- [x] **39. `hideWeekends` toggle is dead → reworked into a per-weekday hide picker.** Was: both calendar blocks emitted a `data-hide-weekends` attribute and the config exposed a single toggle, but nothing consumed the attribute, so it did nothing. Reworked (user-requested): the boolean `hideWeekends` is replaced by `hiddenWeekdays: number[]` (Sunday-based moment day indices, 0–6, range-validated) on both `month-calendar` and `week-calendar` schemas; the config UI swaps the lone toggle for a per-weekday checkbox row ordered by first-day-of-week via `Calendar.weekdaysShort()` (mirrors `ConditionWeekday`). The dead attribute is gone — hiding is now real: `NotesMonthView`/`NotesWeekView` filter out the hidden weekdays' day cells _and_ their header labels, and the month grid's column count is driven by a `--day-columns` CSS var so the remaining columns stay aligned. Schema field is `v.optional(..., [])`, so already-stored configs that still carry `hideWeekends` parse cleanly to an empty hidden set (the dead flag's value is dropped — invisible, since it never did anything). Migration (`v3-to-v4`) and `default-view` write `hiddenWeekdays: []`; the e2e-views fixture updated to match. The same option was extended to the `calendar-timeline` code block (user-requested): an optional `hiddenWeekdays: number[]` (0–6, range-validated) field on `timelineBlockSchema`, authored in the fence YAML (e.g. `hiddenWeekdays: [0, 6]`) and threaded through all four modes (week/month/quarter/calendar) into the same `NotesMonthView`/`NotesWeekView` filter; documented in the code-block reference modal. Covered by unit tests at the schema, config-UI, view-render, and timeline-threading layers, plus two e2e specs — the calendar-block config picker (`settings.e2e.ts`: check Saturday → `hiddenWeekdays` persists `[6]`) and the timeline fence (`code-blocks.e2e.ts`: `hiddenWeekdays: [0, 6]` → month grid drops to five weekday columns). Full e2e suite green.
- [x] **40. View _block_ configs are still not editable after creation.** Fixed. Surfaced while fixing #25: `BlocksList.vue` had the same missing affordance the toolbar list did — add/move/remove only, no edit — so the `configComponent`s of `month-calendar`/`week-calendar` (incl. the #39 `hideWeekends` toggle), `custom-intervals` (journal filter, hide-empty) and `markdown-template` (template path) were unreachable; a block was frozen at its add-time `defaultConfig`. The #25 modal was generalized (`EditToolbarItemModal` → `EditConfigModal`, since it's config-agnostic) and `BlocksList` gained the mirror affordance: a per-row edit pencil (shown only when the definition has a `configComponent`) opening `editBlockModal` and persisting via the already-tested `ViewsService.updateBlockConfig`. Not a v2 regression (the v3 views system is new), but wired up so the views config UI is complete.

---

# Third-pass audit — 2026-07-15

Deep behavioral diff (7 parallel domain sweeps: lifecycle/integration, journals
pipeline, index, calendar view UI, code blocks, settings UI, commands/URIs,
utils/migrations). Focus on interaction details, side-effectful operations, and
parsing tolerance — the layers the first two passes' feature checklists missed.
Items marked **[verified]** were confirmed by reading the cited v3 code directly;
the rest cite exact lines from the sweep but haven't been independently re-read.

## 🔴 Functional regressions (user-facing features lost)

- [x] **41. Opening an entry ignores the indexed note's real path → duplicate notes.** [verified] Fixed: `NoteCreationService.ensureNote` now consults `JournalsIndex.entryByAnchor` before the config-derived path — an indexed entry whose file still exists is reused (frontmatter refreshed, `created: false`); a stale index entry (file gone) falls through to creation at the derived path. Unit tests in `note-creation.test.ts` (reuse, no-duplicate, stale-index fallback; all watched red first) + e2e in `uri-open.e2e.ts` ("relocated entry" — red without the fix, green with it).
  - v2: `Journal.get()` returned indexed metadata carrying the real `path`; `getNotePath()` short-circuited on it (`src/_old-code/journals/journal.ts:126-133,538-544`), so an existing note was re-opened wherever it physically lives.
  - v3: `OpenJournalEntryFlow` → `FrontmatterService.buildMetadata` consults the index only for `endDate` (`src/journals/frontmatter.ts:74-75`), and `NoteCreationService.ensureNote` derives the path purely from the current `nameTemplate`/`folder` and checks only that exact path (`src/journals/notes/note-creation.ts:54-61`). `entryByAnchor`'s stored path is never used in the open pipeline.
  - Impact: any connected note whose real path differs from the config-derived one — connected via connect-note without move/rename, manually renamed/moved, or predating a `nameTemplate`/`folder`/`dateFormat` change — is not found on open; a **second note is created for the same (journal, anchor)**. Likely the biggest source of "v3 keeps missing my notes" reports.

- [x] **42. Pick-date button (default view): no recenter, silent no-op without a note.** [verified] Fixed: `applyMode` in `ButtonItem.vue` now calls `context.setRefDate(anchor)` unconditionally (v2 parity — the interaction always moves the displayed period; mode only decides whether an open follows), so a navigate-mode pick of a note-less date recenters instead of no-opping. Component tests cover recenter in navigate/create for both pick-date and current actions (watched red first).
  - v2: `pickDate` always recentered the displayed month (`refDateMoment.value = …`, `src/_old-code/calendar-view/CalendarView.vue:97-115`), then opened/created.
  - v3: `applyMode` calls `context.setRefDate` only in `select-only` mode; `navigate`/`create` rely on follow-active-date (`src/views/toolbar-items/button/ui/ButtonItem.vue:54-70`). The default view ships pick-date as `navigate` (`src/views/default-view.ts:46`), and `OpenDateFlow` with `existingOnly` errs when no note exists — so picking a note-less date does nothing visible. No v3 mode reproduces v2's "always move display AND open if exists".

- [x] **43. Frontmatter start/end-date toggles no longer rewrite existing notes.** [verified] Fixed: `NoteConnectionService.reapplyAll(journalName)` re-applies the frontmatter write mutator to every connected note; `useReapplyFrontmatterOnToggle` (wired in `FrontmatterSection.vue`, mirroring the auto-create-on-enable composable) fires it when either toggle changes (journal-switch guarded). A stored end equal to the new `CycleService.defaultEndOf` (duration-derived, ignores stored extensions) is treated as period metadata and cleared when the toggle goes off; genuine extensions survive — deliberate improvement over v2, whose "keep divergent ends" branch was dead code (its custom `resolveEndDate` returned the stored end, so toggle-off always deleted, extensions included). Unit-tested at service+composable level (watched red first); e2e in `settings.e2e.ts` ("frontmatter toggle rewrite", red without the fix).
  - v2: `toggleFrontmatterStartDate/EndDate` looped every connected note and added/removed the property (`src/_old-code/journals/journal.ts:444-483`).
  - v3: `FrontmatterSection.vue:52,64` binds the toggles straight to config; the fields apply only at creation/connect time (`src/journals/frontmatter.ts:116-132`). No batch rewrite, no warning hint (unlike the field-rename modal, which does hint — see #57).
  - Impact: toggling silently affects future notes only; existing notes keep stale properties or never gain them.

- [x] **44. Custom journals' `offset` decorations no longer paint the day grid.** [verified] Fixed: `useCellDecorations` gained a binding filter; the month/week grids now gather `scope.all` with custom journals restricted to offset-bearing decorations (`hasOffsetCondition`, exported from `@/decorations`), and `CustomIntervalsBlock` applies the inverse filter so offset decorations stay off interval rows — v2's exact two-surface split. The engine already evaluated day-periods for custom journals (`periodMatchesWrite`, `checkOffset` via `cycle.offsets`); only gathering was missing. Component tests pin both directions plus the existing anti-leak guard (watched red first).
  - v2: the day scope explicitly included custom journals' decorations that carry an `offset` condition (`src/_old-code/composables/use-shelf.ts:28`), so "N days into the interval" markers rendered on month-calendar day cells.
  - v3: `NotesMonthView`/`NotesWeekView` gather decorations from `scope.fixed`, which excludes custom journals entirely (`src/notes-calendar/ui/NotesMonthView.vue:82-84`, `src/notes-calendar/use-shelf-scope.ts:37-39`); custom decorations reach only `CustomIntervalsBlock`. The `offset` condition still exists (custom-only, `src/decorations/settings/ui/condition-types.ts:13`) but can no longer mark day cells. (Note: the third-pass sweep initially reported this inverted — as a leak onto day cells — re-verification shows the opposite: exclusion.)

- [x] **45. Right-click menus lost the guaranteed "Delete" item.** Fixed: `WorkspaceService.openFileMenu` appends a trash-icon Delete item after triggering `file-menu`, wired to the undocumented `fileManager.promptForFileDeletion` via a typed optional interface (v2 parity; `openPathsMenu`'s multi-note chooser funnels into the same method). Label from `m.common_action_delete()`, icon from the central `icons.action.delete`. Unit-tested against the menu mock (watched red first).
  - v2: `showContextMenu` appended a trash-icon Delete wired to `fileManager.promptForFileDeletion` after triggering `file-menu` (`src/_old-code/obsidian-manager.ts:46-62`).
  - v3: `WorkspaceService.openFileMenu`/`openPathsMenu` only trigger `file-menu` (`src/infrastructure/host/internal/workspace-service.ts:134-154`); no `promptForFileDeletion` anywhere in v3.
  - Impact: calendar/nav right-click may offer no Delete unless Obsidian core populates one.

## 🟡 Capability changed shape (confirm intent)

- [x] **46. Journal/shelf commands lost their palette name prefix; names forced globally unique.** Fixed: `DynamicCommandRegistry` registers journal commands as `<journal>: <name>` and shelf commands as `Shelf: <shelf>: <name>` (v2 format, via parameterized paraglide messages); `EditCommandFlow` scopes `takenNames` to same-owner commands (`sameCommandOwner` in commands/config.ts — journal by name, shelf by name, plugin-level as one namespace regardless of write type), so two journals can again both hold an "Open today's note". The edit modal regained v2's hint that the owner prefix is added automatically. Unit-tested at registry/flow/modal level (watched red first).
  - v2: palette showed `<journal>: <name>` / `Shelf: <shelf>: <name>` (`src/_old-code/obsidian-manager.ts:16`), ids namespaced per owner so same-named commands across journals coexisted.
  - v3: `command-registry.ts:60-68` registers the raw name; `edit-command.flow.ts:26-28` enforces uniqueness across ALL commands regardless of target. Two journals can't both have "Open today's note", and palette entries don't say which journal they act on.

- [x] **47. Command ids changed shape → every v2 hotkey on a journals command silently unbinds.** Fixed via id stability, not hotkeys.json rewriting: the v3→v4 migration now keys every backfilled command by its v2 registration slug (`v2CommandSlug` — lowercase, whitespace→dashes, prefix = journal name / `Shelf: <name>` / `""`), so the registered Obsidian id comes out byte-identical to v2's and existing `hotkeys.json` bindings keep resolving. Collision guard suffixes `-2`, `-3`… (impossible in a healthy v2 config). New v3-created commands keep nanoid ids; fresh installs keep `default-*` seeds. Bonus over v2: ids no longer embed the journal name, so hotkeys now survive journal renames (which v2 broke). Caveat: pre-existing v3-beta vaults migrated once with nanoid ids and won't re-run — release-note it. Unit tests pin all three slug shapes + collision; the legacy-upgrade e2e asserts `journals::open-today's-note` re-registers after a real v1 vault migration (red without the fix).
  - v2: deterministic slug ids (`journals:<journal>:<command-name>`, `src/_old-code/obsidian-manager.ts:15,68-70`); Obsidian persists hotkeys by id.
  - v3: user commands get `nanoid()` ids (`edit-command.flow.ts:33`), seeds use `default-*` keys (`src/commands/config.ts:62-106`). No remap exists. `open-next`/`open-prev`/`connect-note` keep their ids. Adjacent to the out-of-scope data-migration work — decide whether hotkey continuity is in scope.

- [x] **48. `{{note_name}}`/`{{title}}` no longer resolve in folder or template-file paths.** Fixed: `NotePathService.pathFor` renders the filename first and binds its basename as `note_name`/`title` into the folder context (v2 order); `TemplateContentService.renderFor` uses one note-name-carrying context for both the template's path and body. Both variables are documented again in the variable-reference modal for the folder-path and template-path contexts (not name-template — circular there). Unit-tested at path/template/modal level (watched red first). Note: `candidateFor` (path→metadata inversion, a v3-only feature) still can't invert a folder containing `{{note_name}}` — inherent ambiguity, unchanged.
  - v2: one shared context carried `note_name`/`title` into folder + template-path rendering (`src/_old-code/journals/journal.ts:546-603,608`).
  - v3: `NotePathService.contextFor` (used for filename, folder, and template path) omits both; they exist only in `bodyContextFor` (template content) (`src/journals/notes/note-path.ts:115-142`, `src/journals/notes/template-content.ts:32-39`). A folder like `Journal/{{title}}` now renders the literal token. Also dropped from the variable-reference modal even for contexts where they still work (`src/journals/settings/ui/VariableReferenceModal.vue` vs v2 `VariableReference.modal.vue:28-38`).

- [x] **49. Auto-create ignores the journal timeline.** [verified] Fixed: `AutoCreateService.createCurrent` gates on `TimelineService.contains(name, today)` before creating (covers both the midnight tick and the settings enable-toggle path, which funnels through it). Unit tests for ended-timeline and future-start journals (watched red first); e2e in `auto-create.e2e.ts` (out-of-bounds journal seeded before "daily" in the fixture; asserts raw vault-file absence because metadataCache lag made a frontmatter assertion vacuously green — test verified red without the fix).
  - v2: `autoCreate()` went through `get()` → `#checkBounds`, so no note outside start/end/repeats (`src/_old-code/journals/journal.ts:486-491,668-684`).
  - v3: `AutoCreateService.createCurrent` builds today's metadata and calls `ensureNote` with no `TimelineService.contains` check (`src/journals/notes/auto-create.ts:44-55`); same for the enable-toggle path. A journal whose timeline ended still gets a note every midnight, which bounded views then won't show.

- [x] **50. Strict fence validation turned v2's graceful degradation into error boxes.** Fixed: `homeBlockSchema.show` filters unrecognized entries via a transform (typo'd entry drops out, valid ones render); `timelineBlockSchema.mode` parses an unknown value to `undefined` so the journal-derived mode applies. Structurally malformed fences still show the error panel (better feedback than v2's silent full reset). Schema tests watched red first.
  - Home block: v2 filtered invalid `show` entries and kept rendering (`src/_old-code/code-blocks/home/home-processor.ts:41-55`); v3's strict union fails the whole block into a `code-block-error` panel (`src/code-blocks/home/home-config.ts:5-11`, `code-block-service.ts:50-56`).
  - Timeline: v2 fell back to the journal-derived mode on an invalid `mode` (`TimelineCodeBlock.vue:27-31`); v3 `v.picklist` hard-errors (`src/code-blocks/timeline/timeline-config.ts:5,10`).
  - Impact: a typo that used to degrade now blanks the block.

- [x] **51. Month/quarter/year header badges lost right-click + hover preview in the default view.** Fixed: `PeriodButtonsItem` badges gained `@contextmenu` → `WorkspaceService.openPathsMenu` and `@mouseenter` → `previewFirstPath` (modifier-gated in the service), resolving paths via `JournalsIndex.pathsAt` — mirroring the in-grid header cells. Component tests watched red first.
  - v2: header badges were `NotesCalendarButton`s with context menu + hover preview (`src/_old-code/calendar-view/CalendarView.vue:180-187`).
  - v3: the `period-buttons` toolbar item binds only click/middle-click (`src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue:81-94`); full behavior survives only in the in-grid heading, which the default view disables (`default-view.ts:94`).

- [x] **52. Multi-journal date disambiguation: at-cursor menu → centered suggest modal.** Restored (decided 2026-07-15): `OpenDateFlow` takes an optional `pickAt` mouse event; when present, disambiguation runs through `WorkspaceService.pickFromMenu` (a native menu at the pointer, cancellation deferred a task past onHide — same ordering hazard as SuggestModal.onClose); keyboard, command, and URI entry points keep the centered suggest. Calendar cells, nav rows, toolbar buttons, and period badges thread their click events through.

- [x] **53. Index rejects notes whose stored date isn't the canonical anchor.** Confirmed deliberate — the week-canonical-anchor design decision (a note left by a same-named journal of a different write type must not be silently re-interpreted). No change.
  - v2 indexed any valid date literally (`src/_old-code/journals/journals-index.ts:91-117`); v3 `parseEntry` requires `isCanonicalAnchor` and unregisters off-anchor notes (`src/journals/frontmatter.ts:40-43`, `src/journals/vault-subscription.ts:62-111`). Deliberate per the week-canonical-anchor design decision — confirm and close, but note it silently hides hand-edited/imported notes v2 displayed.

## 🟢 Behavioral deltas

- [x] **54. Auto-create bypasses `confirmCreation`** — confirmed intended: a background midnight timer must not pop a modal. No change. (`src/journals/notes/auto-create.ts:51` passes `skipConfirmation: true`; v2 prompted). Probably the intended fix for a background timer — confirm and close.
- [x] **55. Template pick stops at the first _existing_ file even if empty** — fixed: `TemplateContentService.renderFor` skips strictly-empty template content and falls through to the next candidate (v2's truthy check). Test watched red first.
- [x] **56. Active-note tracking moved from `file-open` to `active-leaf-change` only** — fixed: `WorkspaceService` also subscribes to `file-open`, so same-leaf navigation (link click, open-in-place) updates the active-note signal; consumers are idempotent, so the occasional double emit is harmless. Test watched red first. (`src/_old-code/main.ts:515-519` vs `src/infrastructure/host/internal/workspace-service.ts:31-35`) — same-leaf navigation may not update the calendar highlight depending on host event semantics.
- [x] **57. Frontmatter field rename no longer rewrites note properties** — confirmed intended: the modal explicitly hints notes are not rewritten (contrast #43, whose silent variant WAS fixed). No change. — v2 rewrote every note's key (`src/_old-code/journals/journal.ts:427-442`); v3 changes config only and shows a hint (`EditFrontmatterFieldModal.vue:42`). Hinted, so presumed intentional — confirm and close (contrast with the silent #43).
- [x] **58. Hover preview needs the modifier already held at mouseenter** — restored (decided 2026-07-15): the modifier gate moved from `WorkspaceService.previewFirstPath` into the shared `useModifierHoverPreview` composable, which fires on enter-with-modifier AND on Ctrl/Cmd pressed mid-hover (window keydown listener alive only between enter and leave). Wired into calendar cells, nav rows, and period badges.

---

# Fourth-pass audit — 2026-07-15

Six parallel domain sweeps (journals pipeline/index, calendar view UI, code
blocks, config modals/editors, lifecycle/host/commands, utils/migrations),
targeting the sub-checklist layer the first three passes didn't reach: anchor
canonicalization, UI↔domain sync, per-field validation, and parsing tolerance
edges. Items marked **[verified]** were re-read against v3 source directly in
this pass; the rest cite the sweep's lines and still need an independent read.

## 🔴 Functional regressions (user-facing features lost)

- [x] **59. Auto-create & startup-open write a non-canonical `journal-date` for non-daily journals → orphaned/duplicate notes.** Fixed: both sites now resolve today via `CycleService.anchorOf(name, CalendarDate.today())` before invoking the flow / `buildMetadata` (skipping if the journal can't resolve), matching the command-registry/URI callers; `anchorOf` falls back to pure interval math for custom cycles so it's safe at boot before the index fills. Unit tests in `auto-create.test.ts` + `startup-open.test.ts` (monthly journal → `journal-date` = month anchor, watched red first) and an e2e in `auto-create.e2e.ts` (monthly boot note stamped `…-01`, red without the fix). [verified] `StartupOpenService.#open` (`src/journals/startup/startup-open.ts:40`) and `AutoCreateService.createCurrent` (`src/journals/notes/auto-create.ts:47`) both pass `CalendarDate.today().toAnchor()` — today's _exact_ date — straight into `OpenJournalEntryFlow`/`buildMetadata`. `buildMetadata` uses the anchor verbatim and `writeMutator` writes `fm[dateField] = metadata.anchor` (`src/journals/frontmatter.ts:70-84,110`) with no canonicalization. The `anchor` parameter is a canonical-anchor-by-contract: every other caller resolves it first via `cycle.anchorOf` (`src/commands/command-registry.ts:166`, `src/journals/uri/journal-uri-handler.ts`) or `period.anchor` (calendar cells).
  - v2: `autoCreate()`/startup went through `Journal.get(today)` → `resolveForDate`, which canonicalized to the period anchor before building metadata (`src/_old-code/journals/journal.ts:127,486-491`, `src/_old-code/main.ts:425-433`).
  - Impact: for week/month/quarter/year journals, the auto-created/startup note stores a mid-period `journal-date` (e.g. `2026-07-15` for a monthly). On the next vault walk `parseEntry` rejects it as non-canonical (`frontmatter.ts:40-43`) → the note never indexes/connects, and each midnight/startup re-creates or re-mis-writes it. Custom-interval journals additionally get a wrong _filename_ (today's date, not the interval-start anchor). Not caught by tests: `startup-open.test.ts` uses only day journals; the non-daily journal in `auto-create.test.ts` has `autoCreate:false`. Fix: `cycle.anchorOf(name, CalendarDate.today())` at both sites before invoking the flow / `buildMetadata`.

- [x] **60. Sequential-numbering anchor is never taken from the start date (v3-created journals).** Fixed: `NumberingService` now resolves the effective anchor as `config.timeline.start || config.numbering.anchorDate` (a defined start date wins, matching the settings UI's "Start date is used as anchor date" label and v2's start→anchorDate watch) in both `#compute` and `anchorForNumbers`, with the resolved anchor folded into the per-journal cache fingerprint so a start-date edit invalidates. v2-faithful: migrated journals already carry `anchorDate == start`, and start-empty journals still use the picked `anchorDate`. Unit tests in `numbering.test.ts` (start-as-anchor for `assignNumbers` and `anchorForNumbers`, watched red first — was `index: NaN` / `None`); the real inversion path stays green in `auto-attach-index.e2e.ts`. [verified] `SequenceSection.vue:79-86` hides the anchor picker when `timeline.start` is set and shows "Start date is used as anchor date", but nothing writes `timeline.start` into `numbering.anchorDate` — the sole writer is the hidden picker (`SequenceSection.vue:38`). `NumberingService.#compute` reads `numbering.anchorDate` directly (`src/journals/numbering.ts:47,61`), which stays `EMPTY_ANCHOR` (`""`) for fixed journals (`src/journals/config.ts:310,324`).
  - v2: a `watch` on `config.start` unconditionally synced `config.index.anchorDate = start` (`src/_old-code/settings/JournalSettingsEdit.vue:307-315`), so the domain anchor genuinely mirrored the start date.
  - Impact: a journal **created in v3** with a start date + sequential numbering computes indexes from an empty anchor (absent/wrong "Day N") while the UI claims the start is the anchor. Migrated journals are spared — `v3-to-v4` carries the old `index.anchorDate`. Fix: sync `timeline.start → numbering.anchorDate` (or fall back to `timeline.start` in `NumberingService` when `anchorDate` is empty).

## 🟡 Capability changed shape / behavior changed (confirm intent)

- [x] **61. Today vs pick-date create/navigate roles inverted from v2.** Fixed (user chose restore-v2, 2026-07-15): `default-view.ts` seed swapped back to `pick-date` → `mode: "create"` and `current` (Today) → `mode: "navigate"`, so Today recenters + opens today's note only if it exists (never creates) and the picker creates at the picked date. Only fresh installs (and migrated users who never set `todayMode`/`pickMode`, where the seed shows through) were affected — the v3→v4 migration already maps explicit v2 modes onto the seed. `default-view.test.ts` updated to the restored expectations. [verified] v2 defaults were `todayMode: "navigate"` (Today recenters + opens an _existing_ note, never creates) and `pickMode: "create"` (the picker creates) — `src/_old-code/defaults.ts:161-162`. v3's default view ships `pick-date` as `mode: "navigate"` and Today (`current`) as `mode: "create"` (`src/views/default-view.ts:46,51`); `ButtonItem.applyMode` maps `create → existingOnly:false` (`ButtonItem.vue:65-71`). Net: **clicking Today now silently creates today's note** (v2 never created from Today), and the date-picker no longer creates at the picked date. Not recorded in the deliberate-deviations notes. Decide intent; if unintended, swap the two default modes.

- [x] **62. Year paging (`«` / `»`) snaps the calendar to January.** Fixed: `ButtonItem`'s `navigate-step` branch now shifts the ref date itself by the unit (`CalendarDate.shift(±n, {week:"w",month:"m",quarter:"q",year:"y"})`) instead of snapping to the stepped period's anchor, so paging by a unit coarser than the grid keeps the displayed month (v2 parity — navigate always did `refDate.add(±n, unit)`). Month/week paging is visually unchanged (the grid shows the whole period); the day within the period is now preserved. `ButtonItem.test.ts` updated (month/week keep the day) + a new year-paging-keeps-May test (watched red first: `2027-01-01`→`2027-05-15`); `view.e2e.ts` toolbar month-nav round-trip stays green. [verified] The default view wires prev/next-year as `navigate-step` `unit:"year"` (`default-view.ts:62-87`); `ButtonItem.fire` sets `refDate` to the year period's anchor = Jan 1 (`ButtonItem.vue:87-95`), so paging from July 2026 lands on January 2027. v2 did `refDate.add(±1,'year')`, preserving the displayed month (`src/_old-code/calendar-view/CalendarView.vue:80-88`). Month-step paging is unaffected. Fix: shift the ref date by a year keeping month/day rather than snapping to the year anchor.

- [x] **63. Rename-journal modal hint contradicts what rename now does.** Fixed: removed the `journal_notes_not_rewritten_hint` from `RenameJournalModal` (rename rewrites the journal key in every connected note via `reconnectAll` — the #6 port — so "Existing notes are not rewritten" was false; rename just works, so no hint is warranted per minimal-noise). The message key stays — it's still correct in `EditFrontmatterFieldModal`/`EditSequencePropertyModal` (config-only, #57). Removed the now-invalid presence test. [verified] `RenameJournalModal.vue:41` shows `journal_notes_not_rewritten_hint` — "Existing notes are not rewritten. You may need to update them manually." — but `RenameJournalFlow` calls `NoteConnectionService.reconnectAll`, which rewrites the journal key in every connected note (the #6 port). The copy (likely reused from the frontmatter-field-rename modal #57, where it _is_ correct) tells users the opposite of reality. Fix: drop/replace the hint.

- [~] **64. Bulk-add: several v2 affordances dropped.** 64a + 64c fixed; 64b still open.
  - **64a (property-name required in property mode)** Fixed: `bulkAddParametersSchema` gains a `v.forward(v.partialCheck(...))` requiring a non-blank `propertyName` when `datePlace === "property"` (reusing `journal_property_name_required`), and `ConfigureBulkAddModal` surfaces `errorBag.propertyName` in the field's #description — a blank name now blocks submit with an error instead of silently connecting nothing. Component test watched red first.
  - **64c (date-format prefill)** Fixed: the modal prefills `dateFormat` from the journal's configured format (via `JournalsViewModel.getJournal`), falling back to `YYYY-MM-DD`, matching v2. Component test watched red first.
  - [ ] **64b (conflict-decision row identity)** still open: `ProcessBulkAddModal` shows only `path → anchor` + a bare dropdown; the occupant note and configured-vs-current folder/name (computed in `bulk-add-service.ts`) are never carried onto `PlannedAction` or rendered (v2 `BulkProcessNotes.vue:90-125`).

- [~] **65a. Property decoration condition: value input not gated on operator.** Fixed: `ConditionProperty.vue` gains a `showValueField` computed (`op !== "exists" && op !== "does-not-exist"`) wrapping the text/number/date value inputs, so an existence check no longer shows a meaningless operand field (v2 parity). Component tests for text/`exists` and number/`does-not-exist` (watched red first); the date-derivation test now selects a comparison op to reveal the input. **65b (empty property name → invalid but Save silently no-ops)** still open — that's a form-validation-surfacing change in `EditDecorationModal`, tracked separately below.
- [ ] **65b. Property decoration condition: empty name is schema-invalid but Save stays enabled and silently no-ops.** (sweep-cited) `decorations/config.ts:104` adds `minLength(1)` on property `name`, but `EditDecorationModal` gates Save only on array lengths and `ConditionProperty` never renders the error, so a fresh property condition (seeded `name:""`) looks saveable and `handleSubmit` silently does nothing. Needs the error surfaced + Save disabled/annotated. v3's `ConditionProperty.vue` renders the value input even for `exists`/`does-not-exist` (v2 hid it — `_old-code/.../ConditionProperty.vue:44-46`), and the `minLength(1)` on property `name` (`src/decorations/config.ts:104`) isn't surfaced — Save looks enabled but `handleSubmit` silently no-ops on a fresh (empty-name) property condition.

- [x] **66. Custom week-settings modal doesn't prefill from the active locale.** Fixed: `Calendar.localeWeek()` now exposes the locale's `{dow, doy}`, and `WeekPresetPickerModal` seeds its custom fields from the effective week — `current`'s dow/doy in custom mode, else the locale week — instead of a hardcoded Monday/4. Opening Custom from locale mode no longer risks silently overwriting a non-ISO locale default. Component test seeds a Sunday-start locale and asserts the round-tripped submit (watched red first). [verified] `WeekPresetPickerModal.vue:32-33` seeds the custom day fields from `current.dow/doy` only when `mode==="custom"`; in the default `locale` mode it falls back to hardcoded Monday/`4`, so a non-ISO-locale user clicking "Custom" can silently overwrite their real locale default (v2 always seeded from the effective config — `CalendarWeekSettings.modal.vue:42-54`).

## 🟢 Behavioral / cosmetic deltas

- [x] **67. Code-block parsing tolerance narrower than v2 on new axes (extends #50).** Fixed: both `timelineBlockSchema` and `homeBlockSchema` now front the object schema with `v.pipe(v.unknown(), v.transform(asRecord), v.object({...}))`, so a non-mapping fence (`mode:month`/`show:day` with no space → a bare YAML string) degrades to defaults instead of erroring into a panel. Home field values are tolerant: `separator` uses `v.fallback` (null/wrong-type → `" • "`), and `scale` coerces via `v.fallback` + `n => n || 1` (non-number → 1, and `0` → 1 so the block stays visible), matching v2's `|| ` coercion. `HomeCodeBlock.effectiveShelf` treats an empty `shelf` as unset (current shelf), not a literal `""`. Schema + component tests for each axis watched red first. [verified]
- [x] **68. "Today" highlight over-applied to week-number and month/quarter/year header cells.** Confirmed intentional (decided 2026-07-15): part of the #8 highlight extension; the week-number/header-badge highlight stays. No change. (sweep-cited) `NotesCalendarCell` sets `isToday` for any cell whose period contains today (`NotesCalendarCell.vue:23`), so the current week's week-number cell (and header badges when shown) light up; v2 highlighted only the day cell. Adjacent to the intentional highlight-extension (#8) — but the week-number cell lighting reads as a bug.
- [x] **69. Auto-create timing changed: hourly poll → single next-midnight timer, first tick pre-layout-ready.** Confirmed intentional (decided 2026-07-15): the single next-midnight timer stays; a mid-day-deleted current note returns at next midnight rather than within the hour. No change. (sweep-cited) `auto-create.ts:28-30` reschedules for next local midnight (v2 re-polled hourly — `_old-code/main.ts:456-461`), so a mid-day-deleted current note isn't recreated until midnight and missed-midnight recovery depends on `setTimeout` catch-up on wake; and `#tick` runs during `onload`, not gated on `onLayoutReady` (contrast startup-open/migration). Likely intentional — confirm.
- [x] **70. Focusing the calendar sidebar clears the active-day highlight.** Fixed: the `active-leaf-change` handler now skips leaves with no file, so focusing the calendar `ItemView` no longer emits `active-note-changed(None)` and the highlight persists (v2 tracked only `file-open`; note closes leave the last note active, as in v2). `file-open` still drives same-leaf navigation (#56). Unit test replaced the old None-on-fileless assertion with a persist assertion (watched red first). [verified] the `active-leaf-change` handler emits `active-note-changed(None)` for any non-`MarkdownView` leaf (`workspace-service.ts:41-44`), so focusing the calendar `ItemView` drops `ActiveEntryViewModel.active`; v2 tracked only via `file-open`, which doesn't fire on sidebar focus. Side effect of the #56 change; an `instanceof MarkdownView`/null-file guard restores v2.
- [ ] **71. Minor edits/defaults.** (sweep-cited) `{{relative_date}}` day-mode names the whole ±7 week where v2 said "a week ago/in a week" (`relative-date.ts:39-40`); `src/templates/format-regex.ts` drops the `o` ordinal token, so a `Do`-style `dateFormat` can't be re-derived from a filename via path inversion (bulk-add's copy keeps `o`, so bulk-add is fine); decoration "Add style" defaults changed (transparent color, all border sides off, square/middle) so a freshly-added style renders invisibly/differently than v2; `UiTemplateInput` pops the full path list on empty-focus (v2 returned `[]`); shelf-name placeholder "ex. Work" dropped.
