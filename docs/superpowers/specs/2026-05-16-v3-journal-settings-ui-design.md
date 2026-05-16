# v3 Journal Settings UI — Design

**Stage:** Settings UI for the journal entity surface that's already
ported to v3 ([[2026-05-15-v3-journal-entity-design]]).
**Date:** 2026-05-16
**Status:** Draft for review

## Purpose

The journal entity ships with a config schema (`name`, `write`,
`timeline`, `dateFormat`, `frontmatter`, `numbering.sources`) and the
services that read it, but no UI to author it. This spec adds:

- A dashboard block listing journals on the settings tab, with add /
  edit / rename / delete affordances.
- An edit subpage for tuning all entity fields the v3 schema currently
  supports.
- Three flow classes (`Flow<P, R, FlowError>`) — `AddJournalFlow`,
  `RenameJournalFlow`, `DeleteJournalFlow` — that orchestrate the
  modal-plus-mutation user paths.
- A `JournalLifecycleService` exposing the data ops the flows need
  (`create` / `rename` / `delete`).
- Four modal definitions wiring through `ModalService`.
- A small set of i18n message keys (variant-aware where appropriate),
  introducing a `common_*` namespace for generic action labels.

The shape mirrors v2's journal settings UI for fields that exist in v3
today and intentionally omits everything v2 had that v3 hasn't ported
yet (see [Non-goals](#non-goals)).

## Non-goals

- **Folder, `nameTemplate`, templates, plugin/journal commands,
  calendar decorations, navigation block, calendar-view block,
  `autoCreate`, `confirmCreation`, shelf placement, `openOnStartup`** —
  none of these fields exist on the v3 config; UI for them lands when
  their entity ports land.
- **Multi-source numbering UI.** The v3 schema permits multiple
  `numbering.sources`, but the v2 UI only ever exposed one. This spec
  ships single-source UI keyed to `sources[0]`. Revisit when v2→v3
  migration arrives (currently no v3 data has multiple sources).
- **"Clear journal data" and "Delete notes" modes** on the delete
  modal. These options render but are disabled with a hint; only the
  `keep` mode is wired. Lands when the note-IO service can rewrite
  frontmatter and delete notes (out-of-scope per
  [[2026-05-15-v3-journal-entity-design]]).
- **Rewriting existing notes on rename.** `JournalLifecycleService.rename`
  swaps the collection key only; the `journal:` frontmatter key on
  pre-existing notes is left alone. Documented in the rename modal.
- **Rewriting existing notes on frontmatter-field rename.** Same shape:
  the per-field edit modal mutates only the config string.
- **A real date picker.** All date inputs use `UiTextInput` placeholders
  (`YYYY-MM-DD`) with regex validation; `UiDatePicker` is a follow-up
  spec.
- **Flow-failure user-facing toast.** A future notice service surfaces
  `JournalLifecycleError` to the user; until then errors are logged
  through the `Flows`-built-in logging path only.

## File layout

```
src/journals/settings/
  module.ts                          ← journalsSettingsModule
  lifecycle.ts                       ← JournalLifecycleService
  lifecycle.test.ts
  errors.ts                          ← lifecycle + flow errors
  describe-write.ts                  ← pure helper: write → message args
  describe-write.test.ts
  flows/
    add-journal.flow.ts
    add-journal.flow.test.ts
    rename-journal.flow.ts
    rename-journal.flow.test.ts
    delete-journal.flow.ts
    delete-journal.flow.test.ts
  ui/
    JournalsDashboardBlock.vue
    JournalsDashboardBlock.test.ts
    journals-subpage.ts              ← defineSubpage<{ journalName }>
    JournalEditSubpage.vue
    JournalEditSubpage.test.ts
    DateFormatPreview.vue
    DateFormatPreview.test.ts
    add-journal-modal.ts
    AddJournalModal.vue
    AddJournalModal.test.ts
    rename-journal-modal.ts
    RenameJournalModal.vue
    RenameJournalModal.test.ts
    delete-journal-modal.ts
    DeleteJournalModal.vue
    DeleteJournalModal.test.ts
    edit-frontmatter-field-modal.ts
    EditFrontmatterFieldModal.vue
    EditFrontmatterFieldModal.test.ts
```

`src/main.ts` adds `journalsSettingsModule` to its autoLoad list.
`src/journals/module.ts` is untouched.

## DI registration

`journalsSettingsModule` registers:

- `JournalLifecycleService` (default Container — omitted per
  [[feedback_di_omit_default_lifetime]]).
- `AddJournalFlow`, `RenameJournalFlow`, `DeleteJournalFlow` — same
  (Container default). Flows are stateless apart from `inject()`-resolved
  fields; `Flows.invoke` calls `injector.resolve(cls).execute(params)`,
  and each invocation owns its own `AsyncResult` pipeline, so reusing
  the instance is safe.
- `DashboardBlockToken` ← `defineDashboardBlock({ key: "journals",
component: JournalsDashboardBlock, order: 5 })` — renders above
  `CalendarWeekBlock` (order: 10).
- `SubpageToken` ← `defineSubpage<{ journalName: string }>({ key:
"journal-edit", component: JournalEditSubpage })`.

The module is a plain `const journalsSettingsModule: Module = {...}`
value (no factory args needed) per [[feedback_di_module_factories]].

## `JournalLifecycleService`

Data-only service. No UI awareness, no modal calls. Resolves
`SettingsService` via field-initializer `inject()` per
[[feedback_field_initializer_preference]].

```ts
class JournalLifecycleService {
  readonly #settings = inject(SettingsService);

  create(name: string, write: JournalWrite): Result<JournalConfig, InvalidJournalNameError | JournalNameTakenError>;

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownJournalError | InvalidJournalNameError | JournalNameTakenError>;

  delete(name: string): Result<void, UnknownJournalError>;
}
```

- **`create`** — validates `name` (non-empty, unique against
  `collection.entries`), then `collection.add(name, journalDefaultsFor(write, name))`.
- **`rename`** — validates `newName` (non-empty, not already present,
  `!== oldName`); reads `entries[oldName]`, calls
  `collection.add(newName, {...old, name: newName})`, then
  `collection.remove(oldName)`. Pre-existing `JournalEntry` records in
  `JournalsIndex` still keyed by `oldName` are orphaned by design;
  documented in the rename modal copy.
- **`delete`** — `collection.remove(name)`. No file I/O. The `clear`
  and `delete` modes surfaced in the UI are disabled at the modal
  layer, so they never reach this service.

The service does **not** emit `JournalsIndex.journalDirty`. The only
existing consumer that caches per-journal (`NumberingService`)
fingerprints its cache by `JSON.stringify(numbering)` and reads the
config fresh on every call — a deleted/renamed journal's cache entry
becomes unreachable rather than stale. Adding a public `markDirty` API
to `JournalsIndex` would be premature; revisit if a future consumer
needs explicit cache invalidation on rename/delete.

All errors live in `src/journals/settings/errors.ts` per
[[feedback_errors_in_errors_ts]].

## Flow classes

Each implements `Flow<P, R, FlowError>` from `@/infrastructure/flows`
and composes through `attempt.in(this, async function* () { ... })` per
[[feedback_attempt_in_over_this_shadow]]. Modal cancellation surfaces
as `UserAborted(source)`; `JournalLifecycleError` maps to
`JournalLifecycleFlowError extends FlowError` via a small
`toFlowError(cause)` helper in `errors.ts`.

### `AddJournalFlow` — `Flow<void, { name: string }, FlowError>`

```
1. const { name, write } = yield* modal.open(addJournalModal, undefined)
2. yield* lifecycle.create(name, write).mapErr(toFlowError)
3. ui.push(journalEditSubpage, { journalName: name })
4. ok({ name })
```

Cancel → `UserAborted("add-journal-modal")`.

### `RenameJournalFlow` — `Flow<{ journalName: string }, { newName: string }, FlowError>`

```
1. const { newName } = yield* modal.open(renameJournalModal, { currentName: journalName })
2. yield* lifecycle.rename(journalName, newName).mapErr(toFlowError)
3. ok({ newName })
```

Cancel → `UserAborted("rename-journal-modal")`.

### `DeleteJournalFlow` — `Flow<{ journalName: string }, void, FlowError>`

```
1. const { mode } = yield* modal.open(deleteJournalModal, { journalName })  // mode = "keep"
2. yield* lifecycle.delete(journalName).mapErr(toFlowError)
3. if (ui.current?.subpage.key === "journal-edit" && (ui.current.props as { journalName: string }).journalName === journalName) ui.pop()
4. ok()
```

Cancel → `UserAborted("delete-journal-modal")`.

`EditJournalFlow` is intentionally **not** introduced — edit is pure
navigation (`ui.push(...)`) with no orchestration. The dashboard row's
edit button calls `SettingsUiService.push(journalEditSubpage, ...)`
directly.

Likewise, the per-field frontmatter modal is opened directly from the
edit subpage via `useModalService().open(...)` rather than wrapped in
its own flow. Reason: frontmatter-field rename is one of many in-form
edits the user performs while editing a journal; the modal is just a
longer authoring path for a single config-string mutation, conceptually
the same as v-model on any other field. Flows are reserved for top-level
lifecycle ops on the journal entity.

## Modal definitions

All four use `defineModal<TProps, TResult>` from
`@/infrastructure/host/modals`. Forms use `vee-validate` with valibot
schemas. Field errors render in the `UiSettingRow #description` slot per
[[feedback_form_errors_in_description_slot]], passing `errorBag.field`
directly (no `?? []`).

### `addJournalModal: defineModal<void, { name: string; write: JournalWrite }>`

- Fields:
  - `name` — TextInput. Schema: `v.pipe(v.string(), v.nonEmpty(), v.check(unique))`.
    Uniqueness reads from `collection.entries`.
  - `write` — Dropdown over `day | week | month | quarter | year | custom`.
  - When `write === "custom"`:
    - `every` — Dropdown over the same picklist minus `custom`.
    - `duration` — NumberInput, min 1.
    - `anchorDate` — TextInput. Schema: regex `/^\d{4}-\d{2}-\d{2}$/`.
- Submit emits `{ name, write }` where `write` is either
  `{ type: <fixed> }` or `{ type: "custom", every, duration, anchorDate }`.

### `renameJournalModal: defineModal<{ currentName: string }, { newName: string }>`

- Fields:
  - Read-only display of `currentName`.
  - `newName` — TextInput. Schema: non-empty + unique + `!== currentName`.
- Description includes `m.journal_notes_not_rewritten_hint()`.

### `deleteJournalModal: defineModal<{ journalName: string }, { mode: "keep" }>`

- v2-shaped: dropdown with three options. `clear` and `delete` are
  rendered with `disabled`. Below the dropdown:
  `m.journal_delete_mode_not_implemented_hint()` is shown when the user
  hovers/selects (effectively a static line under the dropdown since
  disabled options can't be selected).
- Cancel + Remove (cta) buttons. Submit emits `{ mode: "keep" }`.
- Result type widens to `{ mode: "keep" | "clear" | "delete" }` when
  the other modes ship.

### `editFrontmatterFieldModal: defineModal<{ journalName: string; fieldName: FrontmatterFieldName }, { newValue: string }>`

- `FrontmatterFieldName = "dateField" | "startDateField" | "endDateField" | "indexFrontmatterKey"`.
  The last is a synthetic name the modal translates to
  `numbering.sources[0].frontmatterKey` (single-source UI).
- Fields:
  - Read-only display of current value (with fallback to schema default
    if empty).
  - `newValue` — TextInput, non-empty.
- Description includes `m.journal_notes_not_rewritten_hint()`.

All modal `cancel` paths produce `ModalCancelled`, which `Flows.invoke`
wraps as `UserAborted(source)`.

## Dashboard block

`JournalsDashboardBlock.vue` — registered as a `DashboardBlock`.

- Header row (`UiSettingRow heading`): section title +
  `[+ Add journal]` button → `flows.invoke(AddJournalFlow, undefined)`.
- Per-journal row (`UiSettingRow`): name with a `flair` showing
  `m.journal_write({...args from describe-write})`. Right-side buttons:
  - Edit pencil → `useService(SettingsUiService).push(journalEditSubpage, { journalName })`.
  - Rename → `flows.invoke(RenameJournalFlow, { journalName })`.
  - Delete trash → `flows.invoke(DeleteJournalFlow, { journalName })`.
- Empty state (`UiSettingRow no-controls`):
  `m.journal_dashboard_empty()` description.
- Entries iterated from `Object.entries(collection.entries)`, sorted by
  name for stability.
- Flow `AsyncResult`s are fired-and-forgotten in click handlers
  (`void flows.invoke(...)`); `Flows` logs failures via its built-in
  `tapErr`, which is the only surface until a notice service lands.

`describe-write.ts` exports a pure function returning the arg object
for the `journal_write` variant key:

```ts
type WriteDescriptor =
  | { type: "day" | "week" | "month" | "quarter" | "year" }
  | { type: "custom"; every: "day" | "week" | "month" | "quarter" | "year"; duration: number };

function describeWrite(write: JournalWrite): WriteDescriptor;
```

## Edit subpage

`JournalEditSubpage.vue` takes props `{ journalName: string }` plus the
`nav: SubpageNav` prop already provided by `SettingsDashboard.vue`.

```
const collection = useService(SettingsService).getCollection(journalConfigCollection)
const config = computed(() => collection.get(props.journalName))
// stale-guard
watchEffect(() => { if (!config.value) nav.back() })
```

All bindings are `v-model` directly on `config.value.*` paths;
mutations autosave via SettingsService's 300ms debounce.

**Sections, in order:**

1. **Header (`UiSettingRow heading`)** —
   `m.journal_edit_header_title({ name, writing: m.journal_write(describeWrite(write)) })`.
   Right-side controls: rename pencil →
   `flows.invoke(RenameJournalFlow, { journalName })`; back chevron →
   `nav.back()`.

2. **Timeline (`UiCollapsibleBlock`, icon `calendar-range`)**:
   - **Start writing** — `m.journal_edit_start_writing_label()`. For
     `write.type === "custom"`, a read-only span showing
     `write.anchorDate` plus `m.journal_edit_start_writing_custom_locked()`
     in the description. Otherwise `UiTextInput` placeholder
     `YYYY-MM-DD`, validated via the shared
     `m.journal_anchor_format_error()` when the regex fails. Trash icon
     to clear when non-empty.
   - **End writing** — `m.journal_edit_end_writing_label()`.
     `UiDropdown` over `kind` using `m.journal_edit_end_kind({ kind })`
     for the three labels. Description rendered via
     `m.journal_edit_end_description({ kind })`. Conditional
     `UiTextInput` (for `date`) or `UiNumberInput` (for `repeats`, min 1).

3. **Numbering (`UiCollapsibleBlock`, icon `hash`)**:
   - **Enabled toggle** — `UiToggle` bound to `numbering.enabled`. When
     the user toggles enabled `false → true` and `sources` is empty,
     push the default source `{ variable: "index", frontmatterKey:
"journal-index", anchorValue: 1, reset: { kind: "never" } }` so the
     form has something to bind to.
   - When `numbering.enabled`:
     - **Anchor date** — when `timeline.start` is set, display the start
       date with `m.journal_edit_anchor_start_used()` hint; otherwise
       `UiTextInput` bound to `numbering.anchorDate` with the shared
       format-error message.
     - **Start number** — `UiNumberInput` bound to
       `sources[0].anchorValue`.
     - **Index change** — `UiDropdown` over `kind` for
       `sources[0].reset` (`never | after`) using
       `m.journal_edit_index_change_option({ kind })`. When `after`, a
       narrow `UiNumberInput` for `count` plus
       `m.journal_edit_index_change_reset_count_suffix()`.
     - **Allow before** — `UiToggle` bound to `numbering.allowBefore`,
       visible only when `!timeline.start && reset.kind === "never"`.
     - **Index property name** — display
       `sources[0].frontmatterKey`; pencil → opens
       `editFrontmatterFieldModal` with `fieldName: "indexFrontmatterKey"`.

4. **Default date format** — `m.journal_edit_date_format_label()`.
   `UiTextInput` bound to `config.dateFormat`. Description:
   `m.journal_edit_date_format_description()` + a link to moment docs
   (`m.journal_edit_date_format_moment_doc_link()` as the link text) +
   a live `<DateFormatPreview :format="config.dateFormat" />`.

5. **Frontmatter (`UiCollapsibleBlock`, icon `table-properties`)**:
   - **Date property name** — read-only span; pencil → opens
     `editFrontmatterFieldModal` with `fieldName: "dateField"`.
   - **Add start date property?** — `UiToggle` bound to
     `frontmatter.addStartDate`. When on, a second row for
     `startDateField` with the same display + pencil pattern.
   - **Add end date property?** — same pattern for `endDateField`.

The edit subpage **does not** offer a control to change `write.type` —
write type is immutable after creation.

`DateFormatPreview.vue` uses `Clock.now().format(pattern)` from
`@/calendar`. No `moment` import in the component per the project's
boundary policy.

## i18n keys

Introduces a `common_*` namespace for generic action labels reused across
features. Existing per-feature action keys (e.g.
`calendar_picker_cancel_action`) aren't touched.

### Variant keys (paraglide `declarations` + `match`)

| Key                                | Inputs                        | Match on                                                               |
| ---------------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| `journal_write`                    | `type`, `every?`, `duration?` | `type` (and `every` for custom)                                        |
| `journal_edit_end_kind`            | `kind`                        | `kind` (never/date/repeats)                                            |
| `journal_edit_end_description`     | `kind`                        | `kind`                                                                 |
| `journal_edit_index_change_option` | `kind`                        | `kind` (increment/reset-after — bound to `never`/`after` schema kinds) |
| `journal_delete_mode_option`       | `mode`                        | `mode` (keep/clear/delete)                                             |
| `journal_fm_field_modal_title`     | `field`                       | `field`                                                                |
| `journal_fm_field_label`           | `field`                       | `field`                                                                |

### Shared keys

```
common_action_cancel
common_action_submit
common_action_close
journal_name_required_error
journal_name_unique_error           — add + rename modals
journal_anchor_format_error         — add modal + edit subpage start/anchor inputs
journal_notes_not_rewritten_hint    — rename + frontmatter-field modals
journal_flow_failure { kind }
```

### Flat keys

```
journal_dashboard_section_title
journal_dashboard_empty
journal_dashboard_add
journal_dashboard_edit
journal_dashboard_rename
journal_dashboard_delete
journal_add_modal_title
journal_add_modal_name_label
journal_add_modal_write_label
journal_add_modal_every_label
journal_add_modal_duration_label
journal_add_modal_anchor_label
journal_add_modal_anchor_description
journal_rename_modal_title         { name }
journal_rename_modal_new_label
journal_rename_modal_same_as_current_error
journal_delete_modal_title         { name }
journal_delete_mode_label
journal_delete_mode_not_implemented_hint
journal_fm_field_modal_current_label
journal_fm_field_modal_new_label
journal_edit_back_tooltip
journal_edit_rename_tooltip
journal_edit_header_title          { name, writing }
journal_edit_section_timeline
journal_edit_section_numbering
journal_edit_section_frontmatter
journal_edit_start_writing_label
journal_edit_start_writing_description
journal_edit_start_writing_custom_locked
journal_edit_end_writing_label
journal_edit_numbering_enabled_label
journal_edit_numbering_enabled_description
journal_edit_anchor_label
journal_edit_anchor_start_used
journal_edit_start_number_label
journal_edit_start_number_description
journal_edit_index_change_label
journal_edit_index_change_description
journal_edit_index_change_reset_count_suffix
journal_edit_allow_before_label
journal_edit_allow_before_description
journal_edit_date_format_label
journal_edit_date_format_description
journal_edit_date_format_moment_doc_link
journal_edit_fm_start_toggle_label
journal_edit_fm_start_description
journal_edit_fm_end_toggle_label
```

Roughly **49 keys** total (8 shared + 7 variant + 34 flat). Per
[[feedback_no_computed_around_i18n]], message calls go inline in templates
unless arguments include reactive data — the
`m.journal_edit_header_title({ name, writing: m.journal_write(…) })`
composition belongs in a `computed` because both args are derived from
reactive `config`.

## Testing

Colocated `*.test.ts` per [[feedback_test_hygiene]]. Strategy summary
follows; one-behavior-per-test, black-box assertions, no test-local
stubs, no tests of mocks/fakes or DI wiring.

| File                                | Coverage                                                                                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifecycle.test.ts`                 | Happy + error paths for `create` / `rename` / `delete`. Uses real `SettingsService` + `FakeJournalsIndex` from `src/journals/testing.ts`. Asserts collection state, error kinds, `journalDirty` emissions.                        |
| `add-journal.flow.test.ts`          | Happy path emits `{ name }` + pushes edit subpage; modal cancel → `UserAborted("add-journal-modal")`; lifecycle error mapped to `JournalLifecycleFlowError`. `FakeModalService` from `src/infrastructure/host/modals/testing.ts`. |
| `rename-journal.flow.test.ts`       | Happy path emits `{ newName }`; modal cancel → `UserAborted("rename-journal-modal")`; rename of unknown / to taken name surfaces.                                                                                                 |
| `delete-journal.flow.test.ts`       | Happy path returns ok + pops subpage when current is the deleted one; modal cancel; lifecycle error mapped.                                                                                                                       |
| `describe-write.test.ts`            | Each `write` shape → expected descriptor.                                                                                                                                                                                         |
| `JournalsDashboardBlock.test.ts`    | Renders entries / empty state. Add button invokes `AddJournalFlow` (spy on `Flows.invoke`). Rename/Delete buttons invoke correct flow. Edit button pushes subpage.                                                                |
| `JournalEditSubpage.test.ts`        | Header rendering; round-trip through SettingsService for each field; format-error surfaces on bad date input; stale-guard pops on missing journal; numbering toggle materializes `sources[0]`; allow-before visibility rule.      |
| `DateFormatPreview.test.ts`         | Renders `Clock.now().format(pattern)` for sample pattern.                                                                                                                                                                         |
| `AddJournalModal.test.ts`           | Submits `{name, write}` for fixed and custom shapes; vee-validate errors block submit; cancel emits `ModalCancelled`.                                                                                                             |
| `RenameJournalModal.test.ts`        | Submits `{newName}`; uniqueness + same-as-current + non-empty errors.                                                                                                                                                             |
| `DeleteJournalModal.test.ts`        | Disabled options aren't selectable; submit emits `{mode: "keep"}`; cancel works.                                                                                                                                                  |
| `EditFrontmatterFieldModal.test.ts` | Per-field title; submit emits `{newValue}`; non-empty validation.                                                                                                                                                                 |

Tests use `@testing-library/vue` + `user-event` per
[[feedback_testing_library_for_components]]. No `@vue/test-utils`
CSS-class queries. No `data-test-*` attributes.

`module.ts` is not unit-tested per
[[feedback_no_wiring_tests]]. The `defineModal(...)` and
`defineSubpage(...)` factory calls are not unit-tested either.

## Open follow-ups (not in this spec)

- **`UiDatePicker` component** to replace the placeholder text inputs
  for `YYYY-MM-DD` fields.
- **Note-IO operations** that unlock the `clear` and `delete` modes on
  the delete modal, plus the rewrite-existing-notes flow on rename and
  per-field frontmatter rename.
- **Multi-source numbering UI**, on the next v2→v3 migration spec or
  when an actual multi-source journal exists.
- **Notice / toast service** for flow failures so users see error
  messages directly instead of relying on the log.
- **Shelf placement**, **plugin-level commands**, **decorations**,
  **navigation block**, **calendar-view block**, **folder / nameTemplate
  / templates**, **autoCreate / confirmCreation**, **openOnStartup** —
  each lands when its underlying entity port lands.
