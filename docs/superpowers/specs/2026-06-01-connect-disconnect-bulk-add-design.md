# Design: Connect / Disconnect / Bulk-add notes (v2 → v3 port)

Date: 2026-06-01
Branch: `v3-ai`

Closes the first three functional regressions in
`docs/2026-06-01-v2-v3-feature-gaps.md`:

1. **Bulk add notes** (gap #1)
2. **Connect note to a journal** (gap #2)
3. **Disconnect note** (gap #3)

Data migration is out of scope. v2 reference lives in `src/_old-code/`.

## Goals

- Restore v2-faithful behavior for connecting, disconnecting, and bulk-adding
  notes, using v3's architecture (flows, modals, services, DI, `AsyncResult`).
- Mirror v2's UX exactly where decided: a single **Connect note to a journal**
  command whose modal also offers **Disconnect** when the note is already
  connected. No standalone disconnect command.
- Reuse existing v3 infrastructure instead of re-porting: the journal index
  auto-syncs from frontmatter, the decoration condition system already
  evaluates title/tag/property predicates, and note path/creation services
  already write frontmatter, render templates, and rename files.

## Non-goals

- A standalone "disconnect note" command (v2 had none).
- A "bulk add" command-palette entry (v2 triggered it only from settings).
- Replicating v2's known bugs (see the override note under Bulk-add).

## Key architectural facts this design relies on

- **The index auto-syncs from frontmatter.** `VaultSubscriptionService` listens
  to `metadata-changed` and re-parses via `FrontmatterService.parseEntry`,
  calling `JournalsIndex.register`/`unregister`. Therefore connect/disconnect
  mutations only write or strip frontmatter and rename files — they never call
  the index directly.
- **Connect is thin orchestration over existing services.**
  `FrontmatterService.buildMetadata` produces metadata; `NotePathService.pathFor`
  computes the configured path; `NotesService.rename` moves/renames;
  `NoteCreationService.attachNote` writes journal frontmatter and renders the
  template only when the note is empty.
- **Date→anchor resolution exists.** `CycleService.anchorOf(name, date)` snaps an
  arbitrary `CalendarDate` to the journal's period anchor (the v2
  `journal.get(date)` equivalent); `TimelineService.contains(name, anchor)`
  checks timeline bounds.
- **Filter predicates exist.** `src/decorations/engine-checks.ts` exposes
  `checkTitle`/`checkTag`/`checkProperty` over `NoteMetadata`, backed by the
  decoration condition config and a built, tested UI condition editor.

## Components

### Shared foundation (built first, before any feature)

**`FrontmatterService.clearMutator(name)`** — parallels the existing
`writeMutator`. Returns `Result<(fm: Record<string, unknown>) => void,
JournalNotFoundError>`. The mutator deletes:

- `FRONTMATTER_NAME_KEY` (`"journal"`)
- `config.frontmatter.dateField`, `startDateField`, `endDateField`
- every `config.numbering.sources[].frontmatterKey`

All other keys are preserved. (v2: `Journal.disconnectNote`.)

**`NoteConnectionService`** (new, `src/journals/notes/note-connection.ts`) — the
orchestration reused by the connect flow and by bulk-add. Ports v2
`Journal.connectNote` / `JournalPlugin.disconnectNote`.

- `connect(journalName, path, anchor, { override?, rename?, move? }):
AsyncResult<{ path: VaultPath }, ConnectError>`
  - Build metadata via `FrontmatterService.buildMetadata(journalName, anchor)`.
  - If another note occupies the anchor (`index.entryByAnchor`) and its path
    differs from `path`: error `AnchorOccupiedError` unless `override`, in which
    case disconnect the occupant first.
  - If `rename` or `move`: derive the configured folder + filename from
    `NotePathService.pathFor(journalName, metadata)`; combine the kept half with
    the current path (move → configured folder + current filename; rename →
    current folder + configured filename; both → fully configured path);
    `NotesService.rename(path, newPath)`; continue with `newPath`.
  - `NoteCreationService.attachNote(journalName, finalPath, metadata)`.
  - Return `{ path: finalPath }`.
- `disconnect(path): AsyncResult<void, DisconnectError>`
  - `index.entryByPath(path)` → journal name. If absent (note carries a
    `journal` key but no live config / no index entry), fall back to stripping
    the default key set, matching v2's orphan handling.
  - Strip frontmatter via `clearMutator(journalName)` (or the default-key
    fallback) through `NotesService.updateFrontmatter`.

**New errors** in `src/journals/notes/errors.ts`: `AnchorOccupiedError`
(anchor already held by another note and `override` not set).

### Feature 1 — Disconnect

No command, no dedicated modal. The feature _is_
`NoteConnectionService.disconnect`, surfaced through the connect modal's
Disconnect button and reused internally by connect-override and bulk-add.

Closes gap #3.

### Feature 2 — Connect note to a journal

**Command** `connect-note`, registered like `JournalNavigationCommands`
registers `open-next`/`open-prev` (`CommandService.register`, `check` = an active
note exists). Either a new eager `NoteConnectionCommands` class or folded into
the existing navigation-commands class.

**`connectNoteModal`** (`src/journals/notes/ui/modals.ts` + `ConnectNoteModal.vue`):

- Props: `{ path: VaultPath }`.
- Result (discriminated): `{ action: "connect"; journalName: string; anchor:
AnchorString; override: boolean; rename: boolean; move: boolean } | { action:
"disconnect" }`.
- If the active note is already connected (`index.entryByPath`): show the current
  journal name and a **Disconnect** button → returns `{ action: "disconnect" }`.
- Otherwise: a journal picker (`journalPickerSuggest`), a date field, and
  `override`/`rename`/`move` toggles shown conditionally —
  - `override` when another note already holds the chosen anchor,
  - `rename` when the current filename differs from configured,
  - `move` when the current folder differs from configured.
  - Toggles reset when the chosen date changes (v2 parity).
- The component computes these previews reactively through injected services
  (`useService` for `JournalsRepository`, `JournalsIndex`, `NotePathService`,
  `CycleService`). Form + buttons use `UiSettingRow`; field errors in the
  `#description` slot.

**`ConnectNoteFlow`** opens the modal and dispatches the result via `match`:
`connect` → `NoteConnectionService.connect`; `disconnect` →
`NoteConnectionService.disconnect`. Modal cancel → `UserAborted`.

Closes gap #2.

### Feature 3 — Bulk add notes

**Entry point:** a button in the per-journal settings UI, placed next to the
journal's Delete action (v2 triggered bulk-add per journal).

**Config schema** (`bulk-add`):

| Field              | Type                                       |
| ------------------ | ------------------------------------------ |
| `folder`           | `string`                                   |
| `datePlace`        | `"title" \| "property"`                    |
| `propertyName`     | `string`                                   |
| `dateFormat`       | `string` (moment format)                   |
| `filterCombinator` | `"no" \| "and" \| "or"`                    |
| `filters`          | decoration title/tag/property conditions   |
| `existingNote`     | `"skip" \| "override" \| "merge" \| "ask"` |
| `otherFolder`      | `"keep" \| "move" \| "ask"`                |
| `otherName`        | `"keep" \| "rename" \| "ask"`              |
| `dryRun`           | `boolean`                                  |

Filters **reuse the decoration condition config and `engine-checks.ts`**
(`checkTitle`/`checkTag`/`checkProperty` over `NoteMetadata`) plus the existing
condition-editor components — same concept, already built and tested.

**Two-stage modal** (mirrors v2 `ConfigureBulkAddNotes` → `BulkProcessNotes`):

1. _Configure_ — collect the params above.
2. _Preprocess_ (a pure, separately-testable planner): for each note under
   `folder` (`NotesService.listInFolder`):
   - skip if already connected (`index.entryByPath`);
   - apply filters per `filterCombinator` (no / and / or);
   - extract the date from the basename (`datePlace: "title"`) or from
     `NoteMetadata.properties[propertyName]` (`datePlace: "property"`);
   - parse with `dateFormat` (moment); skip unparseable;
   - snap to anchor via `CycleService.anchorOf`; reject if outside
     `TimelineService.contains`;
   - build the ordered per-note operation list — `skipping` / `existing-note`
     (decision) / `other-folder` (decision) / `other-name` (decision) /
     `connect` — resolving each decision from the params, or leaving it `"ask"`.
3. _Process_ — render the plan; resolve any `"ask"` decisions inline; then either
   apply or, when `dryRun`, only log:
   - `connect`/`override`/`rename`/`move` reuse `NoteConnectionService`;
   - `merge` = `NotesService.read` the source + `append` to the occupant +
     `delete` the source;
   - collapsible per-note action log.

**Override-branch note:** v2's "override" path disconnected the wrong note
(`noteData.path` instead of the occupant). This design ports the _intent_ —
disconnect the occupant of the target anchor — not the bug.

Closes gap #1.

## i18n

New paraglide messages for: the connect command name, connect/disconnect modal
copy and buttons, and bulk-add configuration + process labels. Weekday/month
names come from `moment` (never duplicated as messages).

## Testing

Per the repo quality gates (colocated `*.test.ts`, behavior-named, one behavior
per test, black-box assertions, `@testing-library/vue` for components):

- Unit: `clearMutator`; `NoteConnectionService` (connect happy path, each of
  override/rename/move, `AnchorOccupiedError` when occupied and not overriding,
  disconnect, orphan fallback).
- The bulk **preprocess planner** is pure — test it thoroughly: filter
  combinators, title vs property date extraction, unparseable/out-of-bounds
  rejection, and operation-list construction including decision resolution.
- Modals via `@testing-library/vue` + `user-event` (conditional toggles,
  disconnect path, returned result).
- Flows via fakes/spies. No index-wiring, barrel-shape, or DI-wiring tests.
- `npm run test`, `npm run check:types`, `npm run check:lint` green at each
  checkpoint.

## Sequencing

One branch (`v3-ai`), landed in dependency order with a review checkpoint after
each:

1. **Shared foundation + Disconnect** — `clearMutator`, `NoteConnectionService`,
   errors → checkpoint.
2. **Connect** — command + `connectNoteModal` + `ConnectNoteFlow` → checkpoint.
3. **Bulk add** — config, preprocess planner, two-stage modal, settings entry →
   checkpoint.
