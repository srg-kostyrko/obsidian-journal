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

- [ ] **12. `change-calendar-shelf` command + global `ui.calendarShelf`** — no palette command.
  - v2: global command (gated on `useShelves`) set `ui.calendarShelf` via `ShelfSuggestModal`.
  - v3: per-view `ShelfSelectorItem` (`src/views/toolbar-items/shelf-selector/`) drives `ViewContext.shelf`. No command-palette/hotkey entry, no global "calendar shelf" concept.

- [ ] **13. `open-calendar` stable command** — replaced by per-view dynamic command.
  - v2: single fixed `open-calendar` command.
  - v3: `view-host.ts` registers `journal:open-view:<id>` per view. Works because a default Calendar view is seeded, but the stable id is gone and disappears if all views are deleted.

- [x] **14. `useShelves` toggle** — removed. **Decided won't-do (2026-06-13): always-on shelves is an intentional design decision.**
  - v2: `PluginSettings.useShelves` gated the whole shelves UI; explanatory copy described shelf scoping.
  - v3: no toggle/slice field; shelves always available (`ShelvesDashboardBlock` unconditionally registered). Explanatory copy gone.

- [ ] **15. Reload-hint UX (`showReloadHint`)** — gone.
  - v2: `showReloadHint` + `requestReloadHint()` + onload reset.
  - v3: no slice/service/UI (grep returns nothing).

- [ ] **16. Dismissable notifications (`dismissedNotifications`)** — gone.
  - v2: `dismissedNotifications[]` + `dismissNotification(id)` + `notifications.ts` registry + dashboard banners with dismiss buttons.
  - v3: no notifications module, slice field, or banner.

- [ ] **17. Journal in multiple shelves** — data model reduced to one shelf per journal.
  - v2: `JournalSettings.shelves: string[]`.
  - v3: membership only on shelf side (`ShelfConfig.journals[]`); `ShelvesService.assign` removes from all other shelves first. v2 runtime already behaved single-shelf, so likely no real-world loss — confirm and close.

---

## 🟢 Behavioral deltas (intentional-looking; were untested in v2)

- [ ] **18. `reset_after` numbering cycle range** — v2 `index %= resetAfter` (0-based, ignores anchor); v3 cycles within `[anchorValue, anchorValue+count-1]` (`src/journals/numbering.ts`, tested). Confirm v3 behavior is desired.
- [ ] **19. `allowBefore` uniformity** — v3 applies `allowBefore` to all numbering sources; v2's `reset_after` before-anchor negative-mirroring branch has no v3 equivalent. Confirm.
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

- [x] **39. `hideWeekends` toggle is dead → reworked into a per-weekday hide picker.** Was: both calendar blocks emitted a `data-hide-weekends` attribute and the config exposed a single toggle, but nothing consumed the attribute, so it did nothing. Reworked (user-requested): the boolean `hideWeekends` is replaced by `hiddenWeekdays: number[]` (Sunday-based moment day indices, 0–6, range-validated) on both `month-calendar` and `week-calendar` schemas; the config UI swaps the lone toggle for a per-weekday checkbox row ordered by first-day-of-week via `Calendar.weekdaysShort()` (mirrors `ConditionWeekday`). The dead attribute is gone — hiding is now real: `NotesMonthView`/`NotesWeekView` filter out the hidden weekdays' day cells _and_ their header labels, and the month grid's column count is driven by a `--day-columns` CSS var so the remaining columns stay aligned. Schema field is `v.optional(..., [])`, so already-stored configs that still carry `hideWeekends` parse cleanly to an empty hidden set (the dead flag's value is dropped — invisible, since it never did anything). Migration (`v3-to-v4`) and `default-view` write `hiddenWeekdays: []`; the e2e-views fixture updated to match. Covered by unit tests at the schema, config-UI, and view-render layers; full e2e suite green.
- [x] **40. View _block_ configs are still not editable after creation.** Fixed. Surfaced while fixing #25: `BlocksList.vue` had the same missing affordance the toolbar list did — add/move/remove only, no edit — so the `configComponent`s of `month-calendar`/`week-calendar` (incl. the #39 `hideWeekends` toggle), `custom-intervals` (journal filter, hide-empty) and `markdown-template` (template path) were unreachable; a block was frozen at its add-time `defaultConfig`. The #25 modal was generalized (`EditToolbarItemModal` → `EditConfigModal`, since it's config-agnostic) and `BlocksList` gained the mirror affordance: a per-row edit pencil (shown only when the definition has a `configComponent`) opening `editBlockModal` and persisting via the already-tested `ViewsService.updateBlockConfig`. Not a v2 regression (the v3 views system is new), but wired up so the views config UI is complete.
