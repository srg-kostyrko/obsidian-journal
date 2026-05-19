# v3 Note Creation Flow — Design

**Stage:** Note creation, opening, and auto-attach for the v3 plugin rewrite
**Date:** 2026-05-19
**Status:** Draft for review

## Purpose

Bring v3 to v2-parity for the user-facing note creation paths and fix the
v2 bug where notes created outside the plugin (wiki-link clicks, rename
into a journal folder, drag-and-drop, etc.) stayed unconnected to their
journal until first opened through the plugin — and even then v2 only
wrote frontmatter, never applying the template content.

In v2, three call sites duplicated the orchestration around "given a date,
open the right journal note": `openDate` in `journals/open-date.ts`,
`registerPluginCommand`, and `NavigationBlock.vue`. Each filtered
applicable journals, branched single-vs-picker, and called
`openDateInJournal`. Aborts and errors were inconsistently handled.

This spec consolidates that orchestration into two flows
(`OpenDateFlow` for the date-to-journal dispatch, `OpenJournalEntryFlow`
for the per-journal create-and-open), backed by a small set of services
(`NotePathService`, `TemplateContentService`, `NoteCreationService`). It
adds a reactive `AutoAttachService` that connects externally-created
notes whose path matches a journal's `nameTemplate + folder`, and a
`AutoCreateService` that fires per-journal `autoCreate` on plugin load
and reschedules itself across midnight so a long-running Obsidian
session keeps creating today's note each day.

The reverse-parse machinery from the template engine spec
(`TemplateEngine.parse`) is the foundation for the auto-attach path:
given a vault path, recover the date that produced it.

## Non-goals

- **No Templater bridge.** v2's `tryApplyingTemplater` + cursor-jump
  hook stays in `_old-code` and lands in a separate spec, including the
  `isNew` signaling already returned from `ensureNote`.
- **No per-journal Obsidian commands.** v2's `JournalCommand` list and
  the ribbon-icon path are a separate commands spec. The v3 Flows
  infrastructure is in place; commands wire flows to surfaces.
- **No mouse-menu picker variant from v2.** The calendar UI does not yet
  have a right-click menu in v3, and the type-ahead suggest covers the
  same use case. Re-add later if needed.
- **No content overwrite for non-empty externally-created notes.** If
  the user has already typed something, the attach step writes
  frontmatter only.
- **No backfill of missed days on system sleep.** If the laptop sleeps
  through midnight, `AutoCreateService` ticks on the actual current date
  when it next fires. Skipped days are not retroactively created
  (v2-parity, no surprise file creation).
- **No new template syntax.** Uses the existing `TemplateEngine`. The
  `nameTemplate` is validated for invertibility by the existing
  validator walker in the engine; settings-UI integration of that
  validator is in the journal-settings-UI spec.
- **No settings-change reactivity for `autoCreate`.** Flipping the flag
  takes effect on the next daily tick or the next plugin load
  (v2-parity).

## Architecture

### Layout

```
src/infrastructure/host/suggests/         # new primitive — mirrors modals/
├── index.ts
├── define-suggest.ts                     # defineSuggest({ fetch, render, placeholder? })
├── internal/suggest-service.ts           # SuggestService.open(def, input) → AsyncResult<T, SuggestCancelled>
├── internal/suggest-service.test.ts
├── errors.ts                             # SuggestCancelled
├── testing.ts                            # fake SuggestService
└── module.ts                             # (or folded into createHostModule)

src/journals/notes/                       # new
├── index.ts
├── note-path.ts                          # NotePathService
├── note-path.test.ts
├── template-content.ts                   # TemplateContentService
├── template-content.test.ts
├── note-creation.ts                      # NoteCreationService
├── note-creation.test.ts
├── auto-attach.ts                        # AutoAttachService (eager)
├── auto-attach.test.ts
├── auto-create.ts                        # AutoCreateService
├── auto-create.test.ts
├── journal-picker.ts                     # journalPickerSuggest definition
├── errors.ts                             # NoApplicableJournals, JournalNoteCreationError base
├── module.ts                             # journalNotesModule
└── testing.ts                            # builders + fakes for the services

src/journals/flows/                       # new
├── index.ts
├── open-date.ts                          # OpenDateFlow
├── open-date.test.ts
├── open-journal-entry.ts                 # OpenJournalEntryFlow
├── open-journal-entry.test.ts
├── module.ts                             # journalFlowsModule
└── testing.ts
```

Top-level `src/journals/module.ts` adds both sub-modules so external
consumers continue to register just `journalsModule`.

### Dependencies

`src/journals/notes/` depends on:

- `@/templates` — `TemplateEngine`, `TemplateContext`, `tokenize`
- `@/calendar` — `CalendarDate`, `AnchorString`, `Clock`
- `@/infrastructure/host` — `NotesService`, `WorkspaceService`,
  `ModalService`, `SuggestService`
- `@/journals` peers — `JournalsIndex`, `FrontmatterService`,
  `TimelineService`, `CycleService`, `NumberingService`, `JournalConfig`
- `@/settings` — `SettingsService`, `journalConfigCollection`
- `@/infrastructure/result`, `@/infrastructure/di`, `@/infrastructure/logger`

`src/journals/flows/` depends additionally on
`@/infrastructure/flows` (the `Flow` interface and `FlowError`).

The new `src/infrastructure/host/suggests/` depends on Obsidian's
`SuggestModal` and on the existing `InternalObsidianAppToken`. It has no
cross-feature dependencies.

## Config extensions

`JournalConfig` in `src/journals/config.ts` gains:

| Field             | Type       | Default      | Notes                                                            |
| ----------------- | ---------- | ------------ | ---------------------------------------------------------------- |
| `nameTemplate`    | `string`   | `"{{date}}"` | Rendered with `config.dateFormat` as the default date format.    |
| `folder`          | `string`   | `""`         | Empty = vault root.                                              |
| `templates`       | `string[]` | `[]`         | Ordered; first template whose rendered path exists wins.         |
| `confirmCreation` | `boolean`  | `false`      | Plugin-triggered creation only; not consulted by auto-attach.    |
| `autoCreate`      | `boolean`  | `false`      | Creates today's note on plugin load and at every local midnight. |

Per-write-type formatting continues to come from `config.dateFormat`
(unchanged). Schema validators added in `journalConfigSchema`:
`nameTemplate` and `folder` are strings (parseability into a tokenizable
template is enforced by the settings-UI walker, not the schema);
`templates` is an array of strings; the two flags are booleans.

`journalDefaultsFor(write, name?)` is extended to include the five new
fields with the defaults above. Existing tests for `journalDefaultsFor`
gain coverage for the new fields.

## Components

### `NotePathService` (`src/journals/notes/note-path.ts`)

Owns path computation in both directions for one journal.

```ts
class NotePathService {
  pathFor(name: string, metadata: JournalMetadata): Result<VaultPath, JournalNotFoundError | TemplateRenderError>;

  candidateFor(name: string, path: VaultPath): Option<JournalMetadata>;
}
```

**Forward.** Render `config.folder` and `config.nameTemplate + ".md"`
through the engine with a context built from the metadata:

- `date` (the anchor) with `config.dateFormat`
- `start_date` (via `CycleService.startOf`) with `config.dateFormat`
- `end_date` (via `CycleService.endOf` or `metadata.endDate` if present)
  with `config.dateFormat`
- `journal_name` = `config.name`
- One date variable per numbering source (`source.variable` name) when
  `metadata.numbers[source.variable]` is set — bound as a `number` kind
- `current_date`, `current_time`, `time` from `Clock` — `current_*`
  using fixed v2 formats, `time` using `"HH:mm"`

Final path is
`normalizePath(folder ? folder + "/" + filename : filename)`.

**Reverse.** Build a single combined template
`folder + "/" + nameTemplate + ".md"` (folder-less collapses to
`nameTemplate + ".md"`), tokenize, and call
`TemplateEngine.parse(stream, path, context)`. The context here is a
"reverse" context — date variables get the journal's `dateFormat` as
their default; numbering variables are declared as `number` kinds.

If parse returns `Ok(bindings)`:

- Extract `bindings.get("date")` → `CalendarDate` → `AnchorString`.
- For each numbering source, pull `bindings.get(source.variable)` if
  present, into `metadata.numbers[source.variable]`.
- Return `Some(metadata)`.

If parse returns `Err` (no-match or multi-binding conflict), return
`None`. Single-journal path ambiguity is treated the same as no match.

### `TemplateContentService` (`src/journals/notes/template-content.ts`)

```ts
class TemplateContentService {
  renderFor(name: string, metadata: JournalMetadata): AsyncResult<string, JournalNotFoundError | NoteReadError>;
}
```

Walks `config.templates` in order. For each entry:

1. Render the entry through the engine (v2 allowed `{{date}}` in
   template paths). Append `.md` if missing.
2. `NotesService.find(rendered)` → if `None`, continue.
3. `NotesService.read(rendered)` → render the content through the
   engine with the same context as `NotePathService`.
4. Return `Ok(rendered)`.

If all entries miss, return `Ok("")`. Read errors propagate as
`NoteReadError`.

No Templater bridge — separate spec.

### `NoteCreationService` (`src/journals/notes/note-creation.ts`)

The workhorse on top of `NotesService`, `FrontmatterService`,
`NotePathService`, `TemplateContentService`, and `ModalService`.

```ts
class NoteCreationService {
  ensureNote(
    name: string,
    metadata: JournalMetadata,
  ): AsyncResult<{ path: VaultPath; created: boolean }, NoteCreationError>;

  attachNote(name: string, path: VaultPath, metadata: JournalMetadata): AsyncResult<void, NoteCreationError>;

  // Set of paths that ensureNote has just created. AutoAttachService
  // consults this to ignore its own "created" event echo. Entries clear
  // when JournalsIndex.entryByPath(path) returns Some, or after a 5s
  // timeout fallback.
  expects(path: VaultPath): boolean;
}
```

`NoteCreationError` (in `errors.ts`) is the type alias union:

```ts
type NoteCreationError =
  | JournalNotFoundError
  | TemplateRenderError
  | NoteReadError
  | NoteCreateError
  | NoteWriteError
  | FrontmatterError
  | UserAborted;
```

#### `ensureNote` algorithm

1. `pathFor(name, metadata)` → `path`.
2. `NotesService.find(path)`:
   - **Exists.** Get `writeMutator` from `FrontmatterService.writeMutator(name, metadata)`; `NotesService.updateFrontmatter(path, mutator)`. Return `{ path, created: false }`.
   - **Missing.**
     a. If `config.confirmCreation`: open the confirm modal (Vue modal
     with journal name + computed note name). Cancel → return
     `UserAborted("confirm-creation")`.
     b. `TemplateContentService.renderFor(name, metadata)` → `content`.
     c. Record `path` in the expects-set.
     d. `NotesService.create(path, content)` (folder auto-created by
     the existing `NotesService` helper).
     e. `NotesService.updateFrontmatter(path, writeMutator)`.
     f. Return `{ path, created: true }`.

Composition uses `attempt.in(this, function*)` per repo convention.

#### `attachNote` algorithm

1. `NotesService.updateFrontmatter(path, writeMutator)`.
2. `NotesService.read(path)`. If content is empty (`""` or
   whitespace-only), `TemplateContentService.renderFor(name, metadata)`
   → `NotesService.write(path, content)`. Otherwise skip content
   write.

`expects(path)` is checked by `AutoAttachService` before any work.

### `AutoAttachService` (`src/journals/notes/auto-attach.ts`)

```ts
class AutoAttachService {
  initialize(): AsyncResult<void, never>;
  [Symbol.asyncDispose](): Promise<void>;
}
```

Subscribes (via the existing `NotesService.events`) to `created` and
`renamed`. For each path:

1. If `NoteCreationService.expects(path)` → skip.
2. If `JournalsIndex.entryByPath(path).isSome()` → skip.
3. For every journal in `SettingsService.getCollection(journalConfigCollection)`:
   - `NotePathService.candidateFor(name, path)` → `Option<metadata>`.
   - If `Some`, also require `TimelineService.contains(name, metadata.anchor)`.
4. Collect matches.
   - 0 → debug log; return.
   - 1 → `NoteCreationService.attachNote(name, path, metadata)`.
     Errors are logged (debug for `UserAborted`, error for everything
     else); not propagated.
   - ≥2 → debug log; return (per design decision: skip on ambiguity).

The `renamed` event is handled identically on the destination path —
`VaultSubscriptionService` already transfers `JournalsIndex` entries for
renames of indexed notes, so the `entryByPath` short-circuit kicks in
and only previously-unindexed renames reach the candidate step.

`initialize()` is called from `main.ts` after `VaultSubscriptionService.initialize()`. The service registers as `.eager()` and disposes its
subscriptions on container teardown.

### `AutoCreateService` (`src/journals/notes/auto-create.ts`)

```ts
class AutoCreateService {
  initialize(): AsyncResult<void, never>;
  [Symbol.asyncDispose](): Promise<void>;
}
```

`initialize()`:

1. Run `#tick()` for today.
2. Schedule `#timer = setTimeout(#tick, msUntilNextLocalMidnight())`.

`#tick()`:

1. For each journal with `config.autoCreate=true`:
   - `FrontmatterService.buildMetadata(name, CalendarDate.today().toAnchor())`.
   - `NoteCreationService.ensureNote(name, metadata)`.
   - Errors logged per-journal; loop continues.
2. Reschedule: `#timer = setTimeout(#tick, msUntilNextLocalMidnight())`.

`[Symbol.asyncDispose]()`: `clearTimeout(#timer)`.

`msUntilNextLocalMidnight()` is added as a `static` helper on the
existing `Clock` class in `src/calendar/clock.ts` — keeps the
moment-based wall-clock computation co-located with the other Clock
code. Tests use `vi.useFakeTimers()` to advance through midnight
without real wall-clock waits.

### `journalPickerSuggest` (`src/journals/notes/journal-picker.ts`)

A `defineSuggest<string[], string>` definition:

```ts
export const journalPickerSuggest = defineSuggest<string[], string>({
  placeholder: () => m.journal_picker_placeholder(),
  fetch: (query, journals) => journals.filter((j) => j.toLowerCase().includes(query.toLowerCase())),
  render: (name) => name,
});
```

A new paraglide message `journal_picker_placeholder` is added to
`messages/en.json` (and other locales' default fallback).

### `SuggestService` (`src/infrastructure/host/suggests/`)

Mirrors the existing `ModalService` design.

```ts
interface SuggestDefinition<Input, Result> {
  placeholder?: () => string;
  fetch: (query: string, input: Input) => Result[] | Promise<Result[]>;
  render: (item: Result, element: HTMLElement) => void | string;
}

export function defineSuggest<Input, Result>(def: SuggestDefinition<Input, Result>): SuggestDefinition<Input, Result>;

class SuggestService {
  open<Input, Result>(def: SuggestDefinition<Input, Result>, input: Input): AsyncResult<Result, SuggestCancelled>;
}
```

Backed by Obsidian's `SuggestModal`: the service constructs an internal
subclass per call, wires `getSuggestions` → `fetch`, `renderSuggestion`
→ `render`, `onChooseSuggestion` → `resolve`, and `onClose` (without a
choice) → `reject(SuggestCancelled)`.

`SuggestCancelled extends Error` follows the `ModalCancelled` shape.

The host module either grows a suggests sub-module or registers
`SuggestService` directly — implementation detail decided during the
plan. Tests use a `FakeSuggestService` in `testing.ts` that resolves/
rejects synchronously based on a programmable script (consistent with
the existing `FakeModalService` pattern).

### `OpenJournalEntryFlow` (`src/journals/flows/open-journal-entry.ts`)

```ts
interface OpenJournalEntryParams {
  journalName: string;
  anchor: AnchorString;
  openMode?: OpenMode;
}

interface OpenJournalEntryResult {
  path: VaultPath;
  created: boolean;
}

class OpenJournalEntryFlow implements Flow<
  OpenJournalEntryParams,
  OpenJournalEntryResult,
  NoteCreationError | WorkspaceOpenError
> {
  execute(p): AsyncResult<OpenJournalEntryResult, ...>;
}
```

`execute`:

1. `FrontmatterService.buildMetadata(p.journalName, p.anchor)`.
2. `NoteCreationService.ensureNote(p.journalName, metadata)` → `{ path, created }`.
3. `WorkspaceService.openNote(path, p.openMode ?? "active")`.
4. Return `{ path, created }`.

If step 2 returns `UserAborted`, step 3 is skipped and the error
propagates.

### `OpenDateFlow` (`src/journals/flows/open-date.ts`)

```ts
interface OpenDateParams {
  anchor: AnchorString;
  journalNames?: string[];      // default: all journals
  openMode?: OpenMode;
  existingOnly?: boolean;       // skip journals lacking an entry for the anchor
}

class OpenDateFlow implements Flow<
  OpenDateParams,
  OpenJournalEntryResult,
  NoApplicableJournals | NoteCreationError | WorkspaceOpenError | SuggestCancelled | UserAborted
> {
  execute(p): AsyncResult<OpenJournalEntryResult, ...>;
}
```

`execute`:

1. Resolve candidate names: `p.journalNames ?? settings.allJournalNames()`.
2. Filter to journals where `TimelineService.contains(name, p.anchor)`.
3. If `p.existingOnly`, also require
   `JournalsIndex.entryByAnchor(name, p.anchor).isSome()`.
4. Length:
   - 0 → `Err(new NoApplicableJournals(p.anchor, p.journalNames))`.
   - 1 → `Flows.invoke(OpenJournalEntryFlow, { journalName, anchor, openMode })`.
   - N → `SuggestService.open(journalPickerSuggest, names)`:
     - `Ok(name)` → `Flows.invoke(OpenJournalEntryFlow, ...)`.
     - `Err(SuggestCancelled)` → `Err(new UserAborted("journal-picker"))`.

## Data flow

### Forward (plugin-triggered)

```
Surface (calendar UI / nav block / future command)
  └─ Flows.invoke(OpenDateFlow, { anchor, journalNames?, openMode? })
       └─ filter via TimelineService.contains
            ├─ 0 applicable  → Err(NoApplicableJournals)
            ├─ 1 applicable  → Flows.invoke(OpenJournalEntryFlow, ...)
            └─ N applicable  → SuggestService.open(journalPickerSuggest)
                                  ├─ Ok(name)               → Flows.invoke(OpenJournalEntryFlow, ...)
                                  └─ Err(SuggestCancelled)  → Err(UserAborted("journal-picker"))

OpenJournalEntryFlow
  ├─ FrontmatterService.buildMetadata
  ├─ NoteCreationService.ensureNote
  │     ├─ NotePathService.pathFor
  │     ├─ NotesService.find
  │     │     ├─ exists  → updateFrontmatter(writeMutator) → { created: false }
  │     │     └─ missing →
  │     │           ├─ if confirmCreation: ModalService.open(confirmCreation)
  │     │           ├─ TemplateContentService.renderFor
  │     │           ├─ expects-set ← path
  │     │           ├─ NotesService.create(path, content)
  │     │           └─ NotesService.updateFrontmatter(path, writeMutator)
  └─ WorkspaceService.openNote(path, openMode)
```

`JournalsIndex` is updated as a side effect of `updateFrontmatter` via
`VaultSubscriptionService.metadata-changed`. `NoteCreationService` never
touches the index directly — single source of truth.

### Reverse (auto-attach)

```
NotesService.events ("created" | "renamed")
  └─ AutoAttachService listener
       ├─ skip if NoteCreationService.expects(path)
       ├─ skip if JournalsIndex.entryByPath(path).isSome()
       ├─ collect candidates: NotePathService.candidateFor(name, path) for each journal
       ├─ filter candidates by TimelineService.contains(name, candidate.anchor)
       ├─ 0 → debug log
       ├─ 1 → NoteCreationService.attachNote(name, path, metadata)
       │        ├─ NotesService.updateFrontmatter(writeMutator)
       │        └─ if file is empty: TemplateContentService.renderFor → NotesService.write
       └─ ≥2 → debug log (skip on ambiguity)
```

### Daily auto-create

```
AutoCreateService.initialize()
  ├─ #tick()
  │    └─ for each journal with autoCreate=true:
  │         NoteCreationService.ensureNote(name, todayMetadata)
  └─ setTimeout(#tick, Clock.msUntilNextLocalMidnight())

#tick() re-schedules itself; dispose clears the pending timer.
```

## Error model

New errors in `src/journals/notes/errors.ts`:

- `JournalNoteCreationError extends JournalsError` — abstract base.
- `NoApplicableJournals extends JournalNoteCreationError` — carries
  `anchor: AnchorString` and `requested?: string[]`.

New error in `src/infrastructure/host/suggests/errors.ts`:

- `SuggestCancelled extends Error` — parallel to `ModalCancelled`.

Reused: `JournalNotFoundError`, `TemplateRenderError`, `NoteReadError`,
`NoteCreateError`, `NoteWriteError`, `FrontmatterError`,
`WorkspaceOpenError`, `UserAborted`, `ModalCancelled`.

The `OpenDateFlow` `E` channel is the union of the above; the
`OpenJournalEntryFlow` `E` channel is the same minus
`NoApplicableJournals` and `SuggestCancelled`.

## DI wiring

**`src/infrastructure/host/suggests/`** — adds `SuggestService` to the
host registrations (either as a sub-module merged into the existing
`createHostModule` or as `suggestsModule` added separately in
`main.ts`; folded into `createHostModule` for cohesion).

**`src/journals/notes/module.ts`** — `journalNotesModule` (zero-arg,
plain const) registers:

- `NotePathService` (Container)
- `TemplateContentService` (Container)
- `NoteCreationService` (Container)
- `AutoAttachService` (Container, `.eager()`)
- `AutoCreateService` (Container)

**`src/journals/flows/module.ts`** — `journalFlowsModule` (zero-arg,
plain const) registers:

- `OpenDateFlow` (Container)
- `OpenJournalEntryFlow` (Container)

**`src/journals/module.ts`** — top-level `journalsModule` adds both
sub-modules.

**`src/main.ts`** — after the existing
`await container.resolve(VaultSubscriptionService).initialize();`:

```ts
await container.resolve(AutoAttachService).initialize();
await container.resolve(AutoCreateService).initialize();
```

`AutoAttachService` initializes after `VaultSubscriptionService` so the
index is populated before the listener wakes up. Obsidian's startup
vault scan doesn't fire `create` events, so this isn't about avoiding
spurious attaches; it's about avoiding a race where a `rename` event
arriving during startup would see an empty index and falsely treat an
already-indexed note as unconnected.

## Testing strategy

Per-implementation colocated `*.test.ts`. Tests use
`@testing-library`-style behavior naming and one behavior per test.
Mocks/fakes live in `testing.ts` next to the implementation. Quality
gates per task: `npm test`, `npm run check:types`, `npm run check:lint`.

### `NotePathService` (`note-path.test.ts`)

- Forward render produces `folder + "/" + filename + ".md"` from
  metadata and journal config.
- Folder-less config produces `filename + ".md"`.
- Numbering vars are present in the render context when the journal has
  numbering sources.
- Reverse parse of an invertible single-date `nameTemplate` returns
  `Some(metadata)` with the correct anchor.
- Reverse parse with multi-binding ambiguity returns `None`.
- Reverse parse of a non-matching path returns `None`.
- Reverse parse populates `metadata.numbers` from captured numbering
  variable values.

### `TemplateContentService` (`template-content.test.ts`)

- Empty `templates: []` resolves to `Ok("")`.
- First existing template wins; earlier missing entries are skipped.
- Template path is rendered through the engine before reading.
- `NoteReadError` from `NotesService.read` propagates.

### `NoteCreationService` (`note-creation.test.ts`)

- `ensureNote` when path missing: creates, writes content, writes
  frontmatter, returns `created: true`.
- `ensureNote` when path exists: skips create, still writes
  frontmatter, returns `created: false`.
- `ensureNote` with `confirmCreation=true`: opens modal; cancel
  surfaces `UserAborted("confirm-creation")`; create is not called.
- `attachNote` on empty file: writes frontmatter and content.
- `attachNote` on non-empty file: writes frontmatter only.
- `attachNote` on whitespace-only file: treated as empty, writes
  frontmatter and content.
- `expects(path)` returns `true` between `ensureNote` create and
  `JournalsIndex.entryByPath(path)` becoming `Some`; returns `false`
  after the 5s fallback timeout.
- Error injection: `NotesService.create` spy throwing yields
  `NoteCreateError` at the flow boundary.

### `AutoAttachService` (`auto-attach.test.ts`)

- `created` event for path matching exactly one journal triggers
  `attachNote` with the right name+metadata.
- `created` event for an already-indexed path is a no-op.
- `created` event for a path in the `expects` set is a no-op.
- `created` event for 0 matches: no attach; debug log emitted.
- `created` event for ≥2 matches: no attach; debug log emitted.
- `renamed` event behaves the same on the destination path; only when
  destination is unindexed.
- Candidate is filtered by `TimelineService.contains` (a path that
  inverts to a date outside the timeline is not attached).

### `AutoCreateService` (`auto-create.test.ts`)

- `initialize()` runs `ensureNote` for every `autoCreate=true` journal
  and skips others.
- Per-journal errors don't stop the loop; remaining journals still
  process.
- `vi.useFakeTimers()`: after first tick, advance to the next local
  midnight; second tick fires; dispose clears the pending timer and no
  further ticks fire.
- Sleep simulation: advance fake time past two midnights and assert
  only one tick fires on the next wake; skipped days are not
  backfilled.

### `OpenJournalEntryFlow` (`open-journal-entry.test.ts`)

- Happy path: metadata built → `ensureNote` → `openNote` called with
  the resolved path and the requested mode.
- `ensureNote` returning `UserAborted` propagates; `openNote` is not
  called.
- `ensureNote` returning `NoteCreateError` propagates; `openNote` is
  not called.

### `OpenDateFlow` (`open-date.test.ts`)

- 0 applicable → `NoApplicableJournals` with the anchor.
- 1 applicable → dispatches `OpenJournalEntryFlow` with that name.
- N applicable → opens the suggest with the candidate names; `Ok(name)`
  dispatches the per-journal flow; `Err(SuggestCancelled)` becomes
  `UserAborted("journal-picker")`.
- `existingOnly: true` filters journals lacking
  `entryByAnchor(name, anchor)`.
- `journalNames` narrows the candidate set before timeline filtering.

### `SuggestService` (`infrastructure/host/suggests/internal/suggest-service.test.ts`)

- Open resolves with the chosen item; close without choice rejects with
  `SuggestCancelled`.
- `fetch` is called with the current query and the original input.
- `render` is called for each candidate.

### Not tested

- `module.ts` wiring (per repo memory: no wiring tests).
- Barrel-shape (`index.ts`).
- Trivial `instanceof` for error subclasses.
- The `journalPickerSuggest` definition itself (it's data).

## Migration notes

The settings migration that ports v2 journal configs to v3 (out of
scope for this spec; handled wherever the v2 → v3 settings migration
lives) needs to map:

- v2 `nameTemplate` → v3 `nameTemplate`
- v2 `folder` → v3 `folder`
- v2 `templates: string[]` → v3 `templates`
- v2 `confirmCreation` → v3 `confirmCreation`
- v2 `autoCreate` → v3 `autoCreate`

Defaults from `journalDefaultsFor` apply when a v2 field is missing.

## Open follow-ups

- Templater bridge and `isNew` cursor-jump signaling — separate spec.
- Per-journal Obsidian commands — separate spec (already mentioned in
  `2026-05-13-v3-flows-design.md`).
- Right-click context-menu picker (v2 had `event` → `Menu`) — defer
  until the v3 calendar UI grows a right-click affordance.
- Settings-change reactivity for `autoCreate` (rebuild timer/listener
  set when a journal is added or `autoCreate` flips) — defer.
- Bulk-attach command for migrating an existing vault (port of v2's
  bulk-add settings UI) — separate spec; reuses
  `NotePathService.candidateFor` + `NoteCreationService.attachNote`.
