# v3 Templater Bridge — Design

**Stage:** Templater integration for the v3 plugin rewrite
**Date:** 2026-05-21
**Status:** Draft for review

## Purpose

Port v2's Templater integration, the piece deliberately left out of the
note-creation spec (`2026-05-19-v3-note-creation-design.md`,
Non-goals: "No Templater bridge").

v2 did two things with the `templater-obsidian` plugin:

- **Content application.** After the journal's own template engine
  resolved `{{date}}`-style variables, `tryApplyingTemplater` ran the
  Templater plugin over the result, so `<% tp.* %>` directives in a
  configured template file expanded on note creation.
- **Cursor jump.** After a newly-created note opened,
  `tryTemplaterCursorJump` moved the editor cursor to the next
  Templater cursor marker (`<% tp.file.cursor %>`).

Both paths were capability-gated (the plugin had to be installed and
expose the expected API surface) and soft-failed: any failure logged and
fell back to the un-Templated content.

This spec adds a `TemplaterService` host citizen and wires it into the
existing note-creation services with no new behavior beyond v2 parity.

## Non-goals

- **No generic content-transformer pipeline.** There is exactly one
  transformer. A registry for a single known plugin is speculative
  generality. Templater is named directly.
- **No new `<%%>`-aware syntax in the v3 `TemplateEngine`.** Templater
  runs as an opaque post-pass over the engine's output, exactly as in
  v2. The engine only ever processes `{{...}}`.
- **No cursor jump for auto-create or auto-attach.** Those paths do not
  open an editor. Templater _content_ application still runs on
  auto-attach's empty-file branch (v2 parity); the cursor jump is a
  plugin-triggered-open concern only.
- **No hard Templater errors.** Every Templater failure (plugin absent,
  unsupported version, parse throw) soft-fails to the un-Templated
  content, matching v2.
- **No Templater enable/disable toggle.** Detection is automatic from
  the installed plugin set; there is no setting to turn it on or off
  (v2 parity). The settings UI gains only an _informational_ support
  hint (see Components) — there is no configuration surface.

## Architecture

### Layout

```
src/infrastructure/host/internal/
├── templater-service.ts             # new — TemplaterService
├── templater-service.test.ts        # new
└── templater-plugin.ts              # new — TemplaterPlugin type shim

src/journals/settings/ui/
├── TemplaterSupportHint.vue         # new — informational support hint
├── TemplaterSupportHint.test.ts     # new
├── TemplaterSupportModal.vue        # new — caveats explanation
├── TemplaterSupportModal.test.ts    # new
└── templater-support-modal.ts       # new — modal definition
```

`TemplaterService` is a plain host service like `NotesService` and
`WorkspaceService` — it lives flat in `internal/`, not in its own
sub-folder (those folders exist only for the `define-*` primitives:
`modals/`, `suggests/`, `input-suggests/`).

The host barrel (`src/infrastructure/host/index.ts`) exports
`TemplaterService`. The host `testing.ts` gains a `FakeTemplaterService`.

### Dependencies

`TemplaterService` depends on:

- `obsidian` — `TFile`, `App` (via `InternalObsidianAppToken`)
- `@/infrastructure/di`, `@/infrastructure/result`,
  `@/infrastructure/logger`

It has no cross-feature dependencies. The `templater-obsidian` plugin is
reached through `app.plugins.getPlugin("templater-obsidian")`; the
plugin's shape is described by the `TemplaterPlugin` type shim
(`templater-plugin.ts`), ported from v2's `templater.types.ts`.

`src/journals/notes/` gains a dependency on `TemplaterService` from one
file — `template-content.ts`. `src/journals/flows/` gains it from one
file — `open-journal-entry.ts`. `src/journals/settings/ui/` gains it
from one file — `TemplaterSupportHint.vue` (via `useService`).

## Components

### `TemplaterService` (`templater-service.ts`)

```ts
class TemplaterService {
  apply(templatePath: VaultPath, targetPath: VaultPath, content: string): AsyncResult<string, never>;

  cursorJump(path: VaultPath): AsyncResult<void, never>;

  isSupported(): boolean;
}
```

`apply` and `cursorJump` soft-fail — the `E` channel is `never`. `apply`
always yields usable content; `cursorJump` always completes. Failures
are logged at `debug` and absorbed. This matches v2, where every
Templater failure was swallowed, and keeps both methods composable with
`yield*` without widening any caller's error union.

`isSupported()` is a synchronous capability check — `true` when the
`templater-obsidian` plugin is installed and exposes
`templater.create_running_config` / `templater.parse_template`. It
drives the settings-UI support hint; it is _not_ consulted by `apply`,
which runs its own gate inline. (v2 used `canApplyTemplater(app, "<% %>")`
with a dummy directive string to bypass the content gate; `isSupported`
makes that intent explicit.)

#### `apply`

1. If `content` contains neither `<%` nor `%>`, return `Ok(content)`
   unchanged. (v2 `canApplyTemplater` cheap gate — most notes have no
   Templater directives.)
2. Resolve the `templater-obsidian` plugin. If absent, or it lacks
   `templater.create_running_config` / `templater.parse_template`,
   return `Ok(content)`.
3. Resolve `templatePath` and `targetPath` to `TFile`s via the vault.
   If either is missing, return `Ok(content)`.
4. `create_running_config(templateFile, targetFile, 0)` — `0` is
   Templater's `RunMode.CreateNewFromTemplate`.
5. `await parse_template(runningConfig, content)`. On success return
   `Ok(parsed)`; on throw, log and return `Ok(content)`.

#### `cursorJump`

1. Resolve the `templater-obsidian` plugin. If absent, or it lacks
   `editor_handler.jump_to_next_cursor_location`, return `Ok()`.
2. Resolve `path` to a `TFile`. If missing, return `Ok()`.
3. `await jump_to_next_cursor_location(file, true)` — `true` is v2's
   `auto_jump`. On throw, log and return `Ok()`.

`cursorJump` is always safe to call: with no `<% tp.file.cursor %>`
marker in the note it is a harmless no-op (v2 parity — v2 called it
unconditionally on every newly-created note).

### `TemplaterPlugin` (`templater-plugin.ts`)

The type shim for the `templater-obsidian` plugin surface, ported
verbatim from v2's `templater.types.ts`:

```ts
interface TemplaterPlugin extends Plugin {
  templater: {
    create_running_config(templateFile: TFile | undefined, targetFile: TFile, runMode: number): RunningConfig;
    parse_template(config: RunningConfig, content: string): Promise<string>;
  };
  editor_handler: {
    jump_to_next_cursor_location(file: TFile | null, autoJump: boolean): Promise<void>;
  };
}
```

The capability checks in `TemplaterService` narrow an
`unknown`-typed `getPlugin` result down to this interface before use.

### `TemplateContentService.renderFor` — signature change

`renderFor` gains a `targetPath` parameter and keeps returning a plain
`string` — the final, ready-to-write content with Templater already
applied:

```ts
renderFor(
  name: string,
  metadata: JournalMetadata,
  noteName: string,
  targetPath: VaultPath,
): AsyncResult<string, JournalNotFoundError | NoteReadError>;
```

The service injects `TemplaterService`. The render algorithm is
unchanged through the engine step; one step is appended:

1. `templates: []` → `Ok("")` (no Templater — empty content).
2. Walk `config.templates`; for the first entry whose rendered path
   exists, read it and engine-render the content.
3. **`templater.apply(winningTemplatePath, targetPath, rendered)`** →
   return the result.
4. No entry matched → `Ok("")`.

`winningTemplatePath` is the rendered path of the template file that
produced the content — known locally to the walk, never surfaced in the
return type. Templater applies _after_ the engine, so `<% tp.* %>`
directives see fully-resolved `{{date}}` values (v2 order).

### `NoteCreationService` — create-empty-then-write reorder

`NoteCreationService` no longer injects `TemplaterService`. The
`ensureNote` missing-path branch reorders so the target file exists
before content is rendered (Templater's `create_running_config` needs
the target `TFile`):

1. If `config.confirmCreation`: open the confirm modal; cancel →
   `UserAborted("confirm-creation")`.
2. Record `path` in the expects-set.
3. `NotesService.create(path, "")` — create an empty note.
4. `TemplateContentService.renderFor(name, metadata, noteName, path)` →
   `content`.
5. If `content !== ""`: `NotesService.write(path, content)`.
6. `NotesService.updateFrontmatter(path, writeMutator)`.
7. Return `{ path, created: true }`.

This is v2 parity — v2's `#ensureNote` created an empty note, then
`#getNoteContent` (which ran Templater internally), then wrote. It costs
one extra vault op (`create` + `write`) for notes that have template
content; empty-template journals skip step 5 and pay nothing.

`attachNote`'s empty-file branch already operates on an existing file —
it passes that path as `targetPath` to `renderFor`. No other change.

### `OpenJournalEntryFlow` — cursor jump

After `WorkspaceService.openNote(path, openMode)` succeeds, when
`ensureNote` reported `created === true`, the flow calls
`TemplaterService.cursorJump(path)`:

```
ensureNote → { path, created }
openNote(path, openMode)
if (created) templater.cursorJump(path)   // soft-fail, AsyncResult<void, never>
return { path, created }
```

`created` is the v2 `isNew` signal, already threaded through `ensureNote`
→ the flow result. `cursorJump`'s `never` error channel means the flow's
`E` union (`NoteCreationError | WorkspaceOpenError`) is unchanged.

`OpenDateFlow` delegates to `OpenJournalEntryFlow`, so it inherits the
cursor jump with no change of its own.

### `TemplaterSupportHint` (`TemplaterSupportHint.vue`)

A presentational component for the journal-edit Templates section. Port
of v2's `TemplaterSupportHint.vue`.

It resolves `TemplaterService` via `useService` (DI in Vue components
goes through injector composables — `useApp`/`usePlugin` are the only
banned globals). When `templater.isSupported()` is `false` it renders
nothing. When `true` it renders one line — "Templater syntax is
supported" — with the word _supported_ as a link that opens the
caveats modal.

The sentence interpolates a link into translated text, so it uses the
existing `I18nWithSlot` primitive: the paraglide message
`journal_edit_templater_supported` takes a `{ slot }` input, and the
slot is filled with an `<a>` whose click opens
`templaterSupportModal` through `useService(ModalService)` — the same
shape as `VariableReferenceHint`.

The component takes no props. It is placed in `JournalEditSubpage.vue`
inside the Templates `UiCollapsibleBlock`, in the same `#description`
`UiSettingRow` as the existing `VariableReferenceHint`.

### `templaterSupportModal` (`templater-support-modal.ts`)

A `defineModal<Record<string, never>, void>` definition following the
`dateModificationsModal` pattern — a `TemplaterSupportModal` component
and a `title: () => m.templater_support_modal_title()`.

`TemplaterSupportModal.vue` is a static informational component (port of
v2's `TemplaterSupport.modal.vue`) explaining how to configure Templater
to avoid conflicts with the plugin: prefer configuring the template in
journal settings, and either disable Templater's "Trigger on new file
creation" or enable it with folder templates but no folder template
configured. The body text is a set of paraglide messages — no logic, no
props.

## Data flow

### Content application (note creation)

```
NoteCreationService.ensureNote  (path missing)
  ├─ confirmCreation modal (if configured)
  ├─ expects-set ← path
  ├─ NotesService.create(path, "")
  ├─ TemplateContentService.renderFor(name, metadata, noteName, path)
  │    ├─ walk config.templates → first existing → read
  │    ├─ TemplateEngine render ({{date}} … resolved)
  │    └─ TemplaterService.apply(templatePath, path, rendered)
  │         ├─ no <%%>            → content unchanged
  │         ├─ plugin unavailable → content unchanged
  │         └─ parse_template     → expanded content
  ├─ NotesService.write(path, content)        (skipped if content === "")
  └─ NotesService.updateFrontmatter(path, writeMutator)
```

### Content application (auto-attach)

```
NoteCreationService.attachNote  (file empty)
  ├─ NotesService.updateFrontmatter(path, writeMutator)
  ├─ TemplateContentService.renderFor(name, metadata, noteName, path)
  │    └─ … TemplaterService.apply(templatePath, path, rendered)
  └─ NotesService.write(path, content)        (skipped if content === "")
```

### Cursor jump (plugin-triggered open)

```
OpenJournalEntryFlow.execute
  ├─ ensureNote → { path, created }
  ├─ WorkspaceService.openNote(path, openMode)
  └─ if created: TemplaterService.cursorJump(path)
       ├─ plugin/marker absent → no-op
       └─ jump_to_next_cursor_location(file, true)
```

## Error model

No new error classes. `TemplaterService.apply` and
`TemplaterService.cursorJump` both have `E = never` — every failure mode
is absorbed and logged at `debug`.

`TemplateContentService.renderFor` keeps its existing error union
(`JournalNotFoundError | NoteReadError`); the appended Templater step
adds nothing because `apply` cannot fail.

`NoteCreationService` and the flows keep their existing error unions
unchanged.

## DI wiring

**`createHostModule`** (`src/infrastructure/host/module.ts`) registers
`TemplaterService` alongside the other host services:

```ts
c.register(TemplaterService).useClass(TemplaterService);
```

Container lifetime (the default — not spelled out). Not `.eager()`: it
holds no subscriptions and does no startup work, resolved on first use
by `TemplateContentService` / `OpenJournalEntryFlow`.

No change to `journalNotesModule` or `journalFlowsModule` — the new
dependency is resolved through constructor-time `inject(TemplaterService)`
in the two consuming classes.

## Testing strategy

Per-implementation colocated `*.test.ts`, behavior-named, one behavior
per test. Quality gates per task: `npm test`, `npm run check:types`,
`npm run check:lint`.

### `TemplaterService` (`templater-service.test.ts`)

Tests inject an `InternalObsidianAppToken` value carrying a fake `app`
whose `plugins.getPlugin` returns a programmable stub plugin (or
`null`), and a vault whose `getAbstractFileByPath` returns stub
`TFile`s.

- `apply` returns the input unchanged when content has no `<%`/`%>`.
- `apply` returns the input unchanged when the plugin is absent.
- `apply` returns the input unchanged when the plugin lacks
  `parse_template` / `create_running_config`.
- `apply` returns `parse_template`'s result when the plugin is present
  and the content has directives.
- `apply` passes the resolved template and target `TFile`s to
  `create_running_config`.
- `apply` returns the input unchanged when `parse_template` throws.
- `cursorJump` calls `jump_to_next_cursor_location` with the resolved
  file and `auto_jump = true` when supported.
- `cursorJump` is a no-op when the plugin is absent or lacks
  `editor_handler`.
- `cursorJump` absorbs a throwing `jump_to_next_cursor_location`.
- `isSupported` is `true` when the plugin exposes the apply API and
  `false` when the plugin is absent or the API is incomplete.

### `TemplateContentService` (`template-content.test.ts`)

Existing tests are updated for the `targetPath` parameter. New/updated
with a `FakeTemplaterService`:

- The winning template's rendered content is passed through
  `TemplaterService.apply` and the result is returned.
- `apply` receives the winning template's rendered path and the
  `targetPath`.
- `templates: []` resolves to `Ok("")` without invoking `apply`.

### `NoteCreationService` (`note-creation.test.ts`)

Existing tests updated for the create-empty-then-write order.

- `ensureNote` on a missing path creates an empty note, then writes the
  rendered content, then writes frontmatter.
- `ensureNote` skips the content write when `renderFor` yields `""`.
- `attachNote` on an empty file passes the file's path as `targetPath`
  to `renderFor`.

### `OpenJournalEntryFlow` (`open-journal-entry.test.ts`)

- `cursorJump` is called with the opened path when `ensureNote` reports
  `created: true`.
- `cursorJump` is not called when `ensureNote` reports `created: false`.
- `cursorJump` runs after `openNote` (a failed `openNote` propagates
  and `cursorJump` is not reached).

### `TemplaterSupportHint` (`TemplaterSupportHint.test.ts`)

`@testing-library/vue` + `user-event`, with a `FakeTemplaterService`
bound in the test injector.

- Renders nothing when `TemplaterService.isSupported()` is `false`.
- Renders the support line with a link when `isSupported()` is `true`.
- Clicking the link opens `templaterSupportModal` via `ModalService`.

### Not tested

- `module.ts` wiring (no wiring tests).
- Host barrel shape.
- The `TemplaterPlugin` type shim (it is a type, not runtime code).
- The `templaterSupportModal` definition (`defineModal` data).
  `TemplaterSupportModal.vue` itself gets a light render test, following
  the `DateModificationsModal.vue` precedent.

## Paraglide messages

New messages in `messages/en.json` (other locales fall back to the
English default):

- `journal_edit_templater_supported` — the support-hint sentence,
  takes a `{ slot }` input for the embedded link.
- `journal_edit_templater_supported_link` — the link label
  (_supported_).
- `templater_support_modal_title` — the caveats modal title.
- The `TemplaterSupportModal` body paragraphs and list items — a small
  set of `templater_support_modal_*` messages.

## Migration notes

None. Templater detection is automatic from the installed plugin set;
there is no Templater-related journal config field to migrate.

## Open follow-ups

None.
