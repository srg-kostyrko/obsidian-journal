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

- [ ] **5. Delete journal: `clear` / `delete` note handling** — stubbed.
  - v2: `removeJournal(name, notesProcessing)` with `keep | clear | delete` via `Journal.clearNotes()` / `deleteNotes()` (`src/_old-code/main.ts:233-259`).
  - v3: `src/journals/settings/ui/DeleteJournalModal.vue` hardcodes `{ mode: "keep" }`; `clear`/`delete` options rendered `disabled` with `journal_delete_mode_not_implemented_hint()`. No `clearNotes`/`deleteNotes` equivalent exists.

- [ ] **6. Rename journal does not rewrite note frontmatter** — data-integrity regression. **(highest priority)**
  - v2: `renameJournal` looped the index and rewrote `FRONTMATTER_NAME_KEY` in every connected note (`src/_old-code/main.ts:224-230`).
  - v3: `JournalsRepository.rename` (`src/journals/repository.ts:67-80`) only mutates in-memory config and emits `renamed`; the only listener is `shelves/service.ts`. Existing notes keep the old `journal:` value and become orphaned (`FrontmatterService.parseEntry` looks up config by stored name, `src/journals/frontmatter.ts:24-28`).

- [ ] **7. Calendar sidebar placement (left/right)** — gone.
  - v2: `calendarView.leaf: "left" | "right"` + `placeCalendarView()` using `getLeftLeaf`/`getRightLeaf`, auto-placed on load.
  - v3: `ViewHostService.#open()` (`src/views/view-host.ts:112`) always `getLeaf(true)` → main-area tab. No `leaf` field in `viewSchema`, no sidebar logic.

- [ ] **8. Today highlight in calendar view** — gone.
  - v2: side-panel month grid set `data-today` on the current day (`_old-code` `NotesMonthView.vue:78`).
  - v3: `NotesCalendarCell.vue` / `NotesMonthView.vue` / `NotesWeekView.vue` never compute/emit a today marker. (`isToday`/`data-today` exists only in the unrelated date-picker grid.)

- [ ] **9. today/active cell color customization** — gone.
  - v2: `calendarView.todayStyle` + `activeStyle` (each `{ color, background }` `ColorSettings`), edited with color pickers, applied via `v-bind` on `[data-today]`/`[data-selected]`.
  - v3: cells emit `data-active` only; no configurable color/background, no settings.

- [ ] **10. Week-number column position** — reduced.
  - v2: `calendarView.weeks: "none" | "left" | "right"`.
  - v3: `NotesMonthView.vue` auto-derives `showWeekNumber = scope.week.length > 0`, always left. Cannot force-hide, and "right / after weekdays" is gone.

- [ ] **11. Code-block reference help modal** — gone.
  - v2: `CodeBlockReference.modal.vue` (+ `CodeBlockReferenceHint.vue`) — in-settings syntax docs, timeline mode list, home-block options, alias notes, click-to-copy snippets, live previews.
  - v3: no reference/help surface. Only modal under v3 code-blocks is `editNavBlockRowModal`.

---

## 🟡 Architectural changes — capability survives in a different shape (confirm intent)

- [ ] **12. `change-calendar-shelf` command + global `ui.calendarShelf`** — no palette command.
  - v2: global command (gated on `useShelves`) set `ui.calendarShelf` via `ShelfSuggestModal`.
  - v3: per-view `ShelfSelectorItem` (`src/views/toolbar-items/shelf-selector/`) drives `ViewContext.shelf`. No command-palette/hotkey entry, no global "calendar shelf" concept.

- [ ] **13. `open-calendar` stable command** — replaced by per-view dynamic command.
  - v2: single fixed `open-calendar` command.
  - v3: `view-host.ts` registers `journal:open-view:<id>` per view. Works because a default Calendar view is seeded, but the stable id is gone and disappears if all views are deleted.

- [ ] **14. `useShelves` toggle** — removed.
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

- **Decorations** — all 9 condition types + every operator, all 6 style types + options, border modes, shapes/placements, corner placements, icon options, all 3 `ColorSettings` modes, or/and. v3 adds number/boolean property conditions.
- **Write intervals & end conditions** — day/week/month/quarter/year/custom; never/date/repeats; start bound; custom-interval stored-end anchoring + month-end clamping preserved. (v2 `weekdays` write type was dead code — correctly absent.)
- **Numbering** — enabled/anchor/allowBefore/increment/reset_after, generalized to multi-source.
- **Templates** — nameTemplate, dateFormat, folder, templates[], confirmCreation, autoCreate (now midnight-scheduled), all frontmatter fields, all template variables + modifiers, Templater cursor jump.
- **Code blocks** — all 5 names/aliases (`calendar-timeline`, `calendar-nav`/`interval-nav`/`journal-nav`, `journals-home`); all NavBlockRow fields + link variants; timeline week/month/quarter/calendar modes; home options. Edit-row modal preserved.
- **Commands** — open-next/open-prev; all 9 per-journal `type` variants; all 3 contexts; all 4 open modes; ribbon/icon; plugin-level + shelf-scoped commands (unified superset).
- **Calendar week customization** — dow/doy/global locale with presets.
- **Shelves CRUD** — create/rename/remove (with reassign-on-remove), move journal, settings dashboard, create-journal modal, date picker (richer than v2).
