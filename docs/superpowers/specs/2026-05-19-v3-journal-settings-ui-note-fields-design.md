# v3 Journal Settings UI — Note Creation Fields — Design

**Stage:** Journal settings UI extension following the note-creation entity port
**Date:** 2026-05-19
**Status:** Draft for review

## Purpose

The v3 note-creation flow (`2026-05-19-v3-note-creation-design.md`) added
five new fields to `JournalConfig` — `nameTemplate`, `folder`, `templates`,
`confirmCreation`, `autoCreate` — landed in commit `b2747d36` with
back-compat `v.optional(..., default)` wrappers. The v3 journal settings
UI spec (`2026-05-16-v3-journal-settings-ui-design.md`) explicitly parked
the UI for these fields:

> Folder, nameTemplate, templates, plugin/journal commands, calendar
> decorations, navigation block, calendar-view block, autoCreate,
> confirmCreation, shelf placement, openOnStartup — none of these fields
> exist on the v3 config; UI for them lands when their entity ports land.

That port has now landed (commits `27b865aa`..`b7639449`). This spec
extends `JournalEditSubpage.vue` with the UI affordances those fields
need, at full v2 fidelity (autocomplete inputs, live previews, the v2
"move to folder" recommendation banners), and stands up the inline-suggest
host primitive that the autocomplete inputs depend on.

The note-creation spec deferred one piece of work to here:

> The `nameTemplate` is validated for invertibility by the existing
> validator walker in the engine; settings-UI integration of that
> validator is in the journal-settings-UI spec.

That integration ships here as a warning banner under the name-template
field.

## Non-goals

- **No migration of pre-`b2747d36` persisted configs.** The schema's
  `v.optional` wrappers handle defaults at parse time; an explicit
  migration that strips the optionality lands in a separate spec.
- **No Templater support hint.** v2's "Templater syntax is supported"
  link in the templates description requires a Templater interop port;
  it lands in a Templater spec, not here.
- **No navigation-block, decoration, calendar-view-block, command, or
  shelf-placement UI.** Each lands when its underlying entity port
  lands. The inline-suggest primitive added here is the dependency they
  will share.
- **No save-blocking on non-invertible name templates.** Per Section 6,
  invertibility surfaces as a warning banner; auto-attach silently
  no-ops on non-invertible templates and the user is informed.
- **No promotion of `FolderInput` / `FileInput` to `src/ui/`.** They
  stay scoped to `src/journals/settings/ui/` until a second consumer
  appears.
- **No reactivity for `autoCreate` flips.** Already a non-goal of the
  note-creation spec — the v3 `AutoCreateService` only checks the flag
  on its next daily tick or on plugin load (v2-parity).

## Architecture

### Layout

```
src/infrastructure/host/input-suggests/      # new — mirrors host/suggests/
├── index.ts
├── define-input-suggest.ts                  # defineInputSuggest({ fetch, render, toValue })
├── types.ts                                 # InputSuggestDefinition shapes
├── testing.ts                               # FakeInputSuggestService barrel
└── internal/
    ├── input-suggest-service.ts             # InputSuggestService.attach(el, def) → Disposer
    └── input-suggest-service.test.ts

src/infrastructure/host/internal/notes-service.ts     # extended
                                            # adds NotesService.listFolders(): VaultPath[]

src/ui/                                     # extended
└── UiInputSuggestInput.vue                  # generic v-model wrapper

src/journals/settings/ui/                    # extended
├── FolderInput.vue                          # typed wrapper — vault folders
├── FileInput.vue                            # typed wrapper — markdown files
├── VariableReferenceHint.vue                # link → opens modal
├── VariableReferenceModal.vue               # modal contents
├── variable-reference-modal.ts              # defineModal export
├── NoteNamePreview.vue
├── FolderPathPreview.vue
├── TemplatePathPreview.vue
├── use-today-metadata.ts                    # composable
├── use-folder-extractor.ts                  # composable — recommendation transforms
├── use-invertibility-check.ts               # composable
├── render-for-preview.ts                    # tiny shared helper
├── JournalEditSubpage.vue                   # extended layout
└── JournalEditSubpage.test.ts               # extended behaviors
```

Top-level `src/infrastructure/host/index.ts` re-exports the new
`input-suggests` barrel.

### Dependencies

`src/infrastructure/host/input-suggests/` depends on:

- `obsidian` — `AbstractInputSuggest`
- `@/infrastructure/di` — `inject`
- `@/infrastructure/host/internal` — `InternalObsidianAppToken`,
  `InternalPluginToken`

`src/journals/settings/ui/` additions depend on:

- `@/templates` — `TemplateEngine`, `tokenize`, `TemplateRenderError`
- `@/calendar` — `CalendarDate`
- `@/infrastructure/host` — `NotesService`, `InputSuggestService`,
  `ModalService`, `defineModal`
- `@/journals` peers — `journalConfigCollection`, `NotePathService`,
  `FrontmatterService`
- `@/settings` — `SettingsService`
- `@/i18n` — `m`

No changes to `src/journals/notes/` services; previews build their
context inline via `FrontmatterService.buildMetadata`.

### Inline-suggest host primitive

The contract mirrors the existing modal-based `defineSuggest` /
`SuggestService` in `host/suggests/`, with three differences: synchronous
`fetch` (Obsidian's `AbstractInputSuggest.getSuggestions` is sync), an
explicit `toValue(item) → string` to control what's written into the
input on selection, and a `Disposer` return on `attach` instead of an
`AsyncResult` on `open`.

```ts
export interface InputSuggestDefinitionInput<TResult> {
  fetch: (query: string) => TResult[];
  render: (item: TResult, el: HTMLElement) => string | undefined;
  toValue: (item: TResult) => string;
}
export interface InputSuggestDefinition<TResult> {
  readonly fetch: (query: string) => TResult[];
  readonly render: (item: TResult, el: HTMLElement) => string | undefined;
  readonly toValue: (item: TResult) => string;
  readonly __result: (witness: never) => TResult;
}
export function defineInputSuggest<TResult>(
  input: InputSuggestDefinitionInput<TResult>,
): InputSuggestDefinition<TResult>;

export class InputSuggestService {
  attach<TResult>(element: HTMLInputElement, definition: InputSuggestDefinition<TResult>): Disposer;
}
```

**Real impl** subclasses `AbstractInputSuggest<TResult>`:

- `getSuggestions(query)` → `definition.fetch(query)`
- `renderSuggestion(item, el)` → `definition.render(item, el)`, with the
  same "if it returns a string, `setText` it" shortcut the modal
  `SuggestService` uses
- `selectSuggestion(item)` → write `definition.toValue(item)` into
  `element.value` and dispatch an `input` event so Vue `v-model`
  reacts, then close the dropdown

The service tracks each attached suggester in an internal `Set` and the
constructor registers a `plugin.register(() => for each: dispose())`
unload handler — same belt-and-suspenders shape as `SuggestService`.

**Fake impl** (`FakeInputSuggestService` in `testing.ts`) records every
`attach()` call and exposes a `handle(element)` accessor:
`{ query(q: string): TResult[]; select(item: TResult): void; isAttached: boolean }`.
`select` performs the same `element.value = ...; element.dispatchEvent(new Event("input"))`
the real impl does, so v-model round-trips work in jsdom.

**DI wiring.** Add `InputSuggestService` binding to `hostModule`
alongside `SuggestService` ([[feedback_di_module_factories]] — no args,
so the existing `hostModule` value gets the binding inline).

### `NotesService.listFolders()`

Small extension to the existing real impl:

```ts
listFolders(): VaultPath[] {
  return this.#app.vault.getAllLoadedFiles()
    .filter((file): file is TFolder => file instanceof TFolder)
    .map((folder) => folder.path as VaultPath);
}
```

Returns `""` for the vault root (matches Obsidian's `TFolder.path`
convention). The existing `Host` test fake already maintains a `folders`
set; expose it through a matching method on the fake.

### Vue layer

**`UiInputSuggestInput.vue`** — thin wrapper. Props: `definition:
InputSuggestDefinition<unknown>`, plus the pass-through props of
`UiTextInput`. `v-model: string`. `onMounted`:
`useService(InputSuggestService).attach(el, definition)`; stash disposer;
`onBeforeUnmount`: dispose.

**`FolderInput.vue`** — wraps `UiInputSuggestInput` with a definition
created once via `defineInputSuggest`:

- `fetch(query)`: read `NotesService.listFolders()`, case-insensitive
  contains-match on the query, sort.
- `render(folder, el)`: returns `folder || "/"`.
- `toValue(folder)`: returns `folder`.

**`FileInput.vue`** — same shape, sources from the existing
`NotesService.allMarkdownNotes()`. Definition props identical; render
shows the file path verbatim.

**`VariableReferenceHint.vue`** — small clickable link. Props:
`journalName: string`, `dateFormat: string`. Click opens
`variableReferenceModal` via `ModalService.open`, which reads the
journal config to enumerate variables. The modal
(`VariableReferenceModal.vue`) lists:

| Variable                                  | Available when                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `{{date}}`                                | always                                                                        |
| `{{date:<moment-format>}}`                | always — `<moment-format>` is any moment format string                        |
| `{{journal_name}}`                        | always                                                                        |
| `{{start_date}}` / `{{start_date:<fmt>}}` | always (any cycle-bearing journal — populated by `CycleService.startOf`)      |
| `{{end_date}}` / `{{end_date:<fmt>}}`     | always (populated by `CycleService.endOf`)                                    |
| `{{<source.variable>}}`                   | one entry per `config.numbering.sources[*]` when `numbering.enabled === true` |

Date-string examples in the modal come from `moment.localeData()` per
[[feedback_date_strings_from_moment]] — never duplicated as paraglide
messages.

### Preview components

All three live in `src/journals/settings/ui/` and share
`useTodayMetadata(journalName)` (returns a
`ComputedRef<JournalMetadata | undefined>` built via
`FrontmatterService.buildMetadata(name, CalendarDate.today().toAnchor())`)
and `render-for-preview.ts`:

```ts
export function renderForPreview(template: string, context: TemplateContext): string;
```

Returns `""` on render error (errors aren't user-facing in previews —
the invertibility banner surfaces the meaningful subset for name
templates).

- **`NoteNamePreview.vue`** — calls `NotePathService.pathFor(name,
metadata)` (via `useService(NotePathService)`), strips the folder
  and `.md` suffix, displays the basename. Renders nothing on error.

- **`FolderPathPreview.vue`** — visible only when
  `config.folder.includes("{")`. Calls `renderForPreview(config.folder,
context)`.

- **`TemplatePathPreview.vue`** — per-row. Props: `journalName`, `path`.
  Visible only when `path.includes("{")`. Calls
  `renderForPreview(path, context)`.

### Composables

- **`useTodayMetadata(journalName)`** —
  `ComputedRef<JournalMetadata | undefined>`. Wraps
  `FrontmatterService.buildMetadata(name, CalendarDate.today().toAnchor())`
  (which returns `Result<JournalMetadata, JournalNotFoundError>`);
  `undefined` covers both a missing journal and an `err` result.
- **`useInvertibilityCheck(template)`** —
  `ComputedRef<{ reason: "function-token" | "unknown-variable"; offending: string } | null>`.
  Internally: `tokenize(template)` →
  `engine.parse(stream, "preview-string", buildPreviewContext())` →
  inspect `result.error?.detail` for `kind === "not-invertible"`. All
  other parse errors yield `null` (they aren't round-trip concerns).
- **`useFolderExtractor()`** — returns two pure transforms:
  `extractFromNameTemplate(config)` and `extractFromDateFormat(config)`.
  Each mutates `config.folder`, `config.nameTemplate`, or
  `config.dateFormat` in place. Behavior matches the v2 helpers
  `moveFoldersFromNameTemplate` and `moveFoldersFromFormat`:
  - **`nameTemplate`**: split on `/`; last segment becomes
    `nameTemplate`; the rest prepend to `folder` (joined with `/`).
  - **`dateFormat`**: split on `/`; last segment becomes `dateFormat`;
    the rest become `{{date:format}}` tokens and prepend to `folder`.

### `JournalEditSubpage.vue` layout

Revised order:

1. Header row (unchanged)
2. **Note creation collapsible** _(new — default open)_
3. **Date format row** _(moved from former position; flat row, not a
   collapsible)_
4. **Templates collapsible** _(new — default closed)_
5. Timeline collapsible _(default flipped to closed)_
6. Sequence collapsible _(unchanged, closed)_
7. Frontmatter collapsible _(unchanged, closed)_

**Note creation collapsible** (icon: `file-plus`):

| Row                      | Control                                     | Description-slot extras                                                                                                                            |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Note name template       | `UiTextInput` v-model `config.nameTemplate` | `VariableReferenceHint`, `NoteNamePreview`, invertibility warning banner (when applicable), move-to-folder recommendation banner (when applicable) |
| Folder                   | `FolderInput` v-model `config.folder`       | `VariableReferenceHint`, `FolderPathPreview` (only when folder contains a variable)                                                                |
| Confirm new note         | `UiToggle` v-model `config.confirmCreation` | Plain description                                                                                                                                  |
| Auto-create today's note | `UiToggle` v-model `config.autoCreate`      | Plain description + an extra sentence "Confirmation dialog won't be shown for auto-created notes" when `config.confirmCreation === true`           |

**Date format row** — unchanged controls; adds a recommendation banner
under the existing description when `config.dateFormat.includes("/")`,
with an inline "Apply recommendation" link wired to
`useFolderExtractor().extractFromDateFormat(config.value)`.

**Templates collapsible** (icon: `notepad-text-dashed`):

- Trigger: `UiIconedRow` with label + count flair: `Templates [N]`.
- Header row (no controls): description "Path to a note that will be
  used as a template when creating new notes. When multiple are
  configured, the first existing wins." + `VariableReferenceHint`.
- "Add template" `UiButton` in the collapsible's `#controls` slot
  (`UiCollapsibleBlock` already supports it).
- Per template entry (`v-for` over `config.templates`):
  - `FileInput` v-model `config.templates[index]`
  - Trash `UiIconButton` → `config.templates.splice(index, 1)`
  - `TemplatePathPreview` below, visible only when path contains a
    variable.
- Empty state: zero rows; the header description is enough hint.

### Recommendation banners

Two visually distinct banner kinds:

- **Invertibility warning** under `nameTemplate` — uses existing
  `.journal-hint` class (warning color). Informational, no action.
  Triggered by `useInvertibilityCheck(config.value.nameTemplate)`
  returning non-null. Copy: paraglide
  `journal_edit_name_template_invertibility_warning({ reason, offending })`.
- **Move-to-folder recommendation** — new `.journal-recommendation`
  class (uses `--text-warning` border but no error semantics) with an
  inline "Apply recommendation" anchor. Two locations: under
  `nameTemplate` when it contains `/`, under date format when
  `dateFormat` contains `/`. Click handler invokes the corresponding
  `useFolderExtractor` method.

### Reactivity & persistence

All field writes go through `v-model` on the reactive `config.value.*`
proxy provided by `SettingsService.getCollection(...).get(...)`. The
collection autoflushes mutations to storage — same mechanism the
existing `dateFormat` text input uses today. No new flows, modals, or
service methods for the field writes themselves.

`watchEffect(() => { if (!config.value) nav.back() })` stays unchanged;
all derived computeds (`useTodayMetadata`, previews, invertibility
check) gracefully handle a missing config by returning empty / null.

## Error handling

| Failure                                                        | Handling                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `TemplateEngine.render` fails inside a preview                 | Preview renders `""` (or nothing for the conditional ones). No user-facing error.                      |
| `TemplateEngine.parse` returns a non-invertible error          | Surfaces through the warning banner under `nameTemplate`. Does not block save.                         |
| `NotesService.listFolders()` returns empty                     | Folder autocomplete shows no suggestions. User can still type freely.                                  |
| `InputSuggestService.attach` invoked twice on the same element | Disposer pattern handles this — caller is responsible for sequential mount/unmount.                    |
| Plugin unload while a suggester is attached                    | Service-level `plugin.register` handler disposes all outstanding attachments.                          |
| Component unmount while DOM event in flight                    | Disposer is called in `onBeforeUnmount`; Obsidian's `AbstractInputSuggest.close` is idempotent.        |
| Apply-recommendation actions                                   | Pure string transforms; cannot fail. Idempotent — running twice on already-extracted state is a no-op. |

## Testing

Per [[feedback_test_commands]] the per-task gate is
`npm run test && npm run check:types && npm run check:lint`; the per-spec
gate adds `npm run test:e2e:smoke`; CI runs the full
`npm run test:e2e`.

| File                                                    | What's tested                                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `input-suggests/internal/input-suggest-service.test.ts` | attach returns disposer; disposer detaches; selection writes value + dispatches `input` event; plugin unload disposes outstanding attachments |
| `internal/notes-service.test.ts` _(extended)_           | `listFolders()` returns folder paths from the vault; root included as `""`                                                                    |
| `UiInputSuggestInput.test.ts`                           | mount → attach call; unmount → dispose; fake `select` writes to v-model                                                                       |
| `FolderInput.test.ts`                                   | definition feeds folders from `NotesService`; filters by query                                                                                |
| `FileInput.test.ts`                                     | definition feeds markdown files; filters by query                                                                                             |
| `VariableReferenceHint.test.ts`                         | clicking opens modal; modal renders the correct variable set per write type / numbering flag                                                  |
| `NoteNamePreview.test.ts`                               | renders resolved basename; updates reactively when `nameTemplate` changes; hidden state on engine error                                       |
| `FolderPathPreview.test.ts`                             | renders only when folder contains a variable; updates reactively                                                                              |
| `TemplatePathPreview.test.ts`                           | renders only when path contains a variable                                                                                                    |
| `use-folder-extractor.test.ts`                          | `extractFromNameTemplate` moves prefix; `extractFromDateFormat` builds `{{date:format}}` tokens; both idempotent                              |
| `use-invertibility-check.test.ts`                       | flags function-token templates; flags unknown-variable templates; returns null for `{{date}}` / `{{journal_name}}-{{date}}` / `static`        |
| `JournalEditSubpage.test.ts` _(extended)_               | the twelve behaviors listed below                                                                                                             |

**`JournalEditSubpage` behaviors:**

- renders Note creation collapsible with the four fields
- live-renders note name preview when `nameTemplate` changes
- shows folder path preview only when folder contains a variable
- shows invertibility warning for non-invertible name templates
- shows move-to-folder recommendation when `nameTemplate` contains `/`
- shows move-to-folder recommendation when `dateFormat` contains `/`
- apply-recommendation moves the path prefix from `nameTemplate` to `folder`
- apply-recommendation moves the path prefix from `dateFormat` to `folder`
- Auto-create description mentions confirmation-skip only when `confirmCreation` is on
- templates add button appends an empty entry
- templates trash button removes the entry
- template path preview renders only when path contains a variable

**Conformance with memory:**

- [[feedback_testing_library_for_components]] — component tests use
  `@testing-library/vue` + `user-event`, no `@vue/test-utils` CSS-class
  queries, no test-only `data-*` attrs.
- [[feedback_no_mock_fake_tests]] — `FakeInputSuggestService` has no
  tests of its own; it's exercised through consumer component tests.
- [[feedback_no_wiring_tests]] — no tests for the DI binding of
  `InputSuggestService`, no barrel-shape tests for the new modules.
- [[feedback_no_trivial_tests]] — no framework-behavior tests
  (`UiToggle` reactivity is Vue's job; `v-if` rendering is Vue's job).
- [[feedback_one_behavior_per_test]] — subject+verb names, single
  assertion per test, no comma-list test names.
- [[feedback_black_box_assertions]] — assert resolved-text output and
  visibility, never `vi.fn()` call counts on the engine.

## Intentional deltas from v2

- **No `onAutoCreate` handler.** v2 toggled a service refresh when
  `autoCreate` flipped; v3's `AutoCreateService` reschedules itself on
  its own midnight tick and checks the flag at fire time. No handshake
  needed.
- **No mid-description today's-note wiki-link preview.** v2 sometimes
  injected a clickable "today: [[2026-05-19]]" decoration into
  descriptions. This was inconsistent across sections and out of scope
  for the entity-port pass; can be reintroduced later.
- **Note creation collapsible defaults to open; Timeline now defaults to
  closed.** Note creation is the most-edited section and conceptually
  primary; stacking two open collapsibles produced a crowded first
  paint. Timeline / Sequence / Frontmatter all default closed for
  consistency.

## i18n

New paraglide keys (full list in the implementation plan):

- `journal_edit_section_note_creation`
- `journal_edit_section_templates`
- `journal_edit_name_template_label` / `_description`
- `journal_edit_name_template_invertibility_warning`
- `journal_edit_folder_label` / `_description`
- `journal_edit_confirm_creation_label` / `_description`
- `journal_edit_auto_create_label` / `_description` /
  `_confirmation_skip_note`
- `journal_edit_templates_description`
- `journal_edit_template_path_label`
- `journal_edit_template_path_placeholder`
- `journal_edit_template_add_button`
- `journal_edit_template_remove_tooltip`
- `journal_edit_note_name_preview_label`
- `journal_edit_folder_path_preview_label`
- `journal_edit_template_path_preview_label`
- `journal_edit_move_to_folder_recommendation_name_template`
- `journal_edit_move_to_folder_recommendation_date_format`
- `journal_edit_move_to_folder_apply_link`
- `journal_edit_variable_reference_link`
- `journal_edit_variable_reference_modal_title`
- `journal_edit_variable_reference_*` (per-variable labels and descriptions)

Per [[feedback_no_computed_around_i18n]], all `m.*()` calls inline in
templates unless arguments include reactive data.

## Implementation phases

The plan will sequence work in three phases so each is reviewable
independently:

1. **Host primitive.** `defineInputSuggest`,
   `InputSuggestService`, `FakeInputSuggestService`, real-impl tests,
   `hostModule` wiring, `NotesService.listFolders()` extension.
2. **Shared UI primitives.** `UiInputSuggestInput`, `FolderInput`,
   `FileInput`, `VariableReferenceHint` + modal, preview components,
   composables. Component tests via `@testing-library/vue`.
3. **`JournalEditSubpage` extension.** Layout reorder, two new
   collapsibles, date-format banner, invertibility wiring,
   recommendation actions, i18n keys, extended subpage tests.
