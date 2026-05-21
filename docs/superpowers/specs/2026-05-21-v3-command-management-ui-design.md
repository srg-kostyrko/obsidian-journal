# v3 Command Management UI — Design

## Goal

Port v2's command-management settings UI to v3. The v3 dynamic-commands work
already shipped the backend — the `commands` collection, `DynamicCommandRegistry`,
resolution helpers, and the journal rename/delete cascade. That spec explicitly
deferred one piece: the settings UI for creating, editing, and deleting
commands. This spec covers that UI.

## Scope

In scope:

- A global "Commands" dashboard block listing `all`-target commands.
- A journal-editor section listing a journal's `journal`-target commands.
- A modal form for creating and editing a command.
- A confirmation modal for deleting a command.
- A reusable icon picker UI primitive.
- A journal-edit-subpage extension point so `commands` can contribute UI to the
  journal editor without `journals` depending on `commands`.

Out of scope:

- Any change to the command backend (`config.ts`, `resolve.ts`,
  `command-registry.ts`). The deep `watch` in `DynamicCommandRegistry` already
  reconciles Obsidian's registered commands on every collection change, so the
  UI only mutates the collection.
- Shelves and a `shelf` target — shelves do not exist in v3 yet.

## Background: v2 command-management UI

v2 managed commands in two separate places. Per-journal commands were edited
inside each journal's editor through `EditCommand.modal.vue`. Global "plugin"
commands lived in a separate list edited through `EditPluginCommand.modal.vue`.
The two modals shared most fields but diverged: the per-journal modal offered a
9-value `type` and a `context`, while the plugin modal offered a 3-value `type`
and a `writeType` picker.

v3 collapsed both stores into the single `commands` collection, where a `target`
discriminated union (`{ kind: "all"; writeType }` or `{ kind: "journal";
journalName }`) decides scope. This spec gives that unified collection a
unified UI.

## Surfaces

Commands appear in two places, split by target kind — never both, so a command
shows up exactly once.

### Global commands — dashboard block

`commands/ui/CommandsDashboardBlock.vue`. A dashboard block registered through
`DashboardBlockToken` at `order: 6`, immediately after the Journals block. It
mirrors `JournalsDashboardBlock`: a `UiCollapsibleBlock` with an entry count
flair, an "add" icon button in `#controls`, and one row per command.

It lists only `all`-target commands. Its "add" button opens the edit flow with
the target fixed to `{ kind: "all" }`.

### Journal commands — journal-editor section

`commands/ui/JournalCommandsSection.vue`. A section appended to
`JournalEditSubpage` through the new `JournalEditSectionToken`. It receives the
`journalName` prop and lists only `journal`-target commands pointing at that
journal. Like the journal editor's built-in sections, it wraps its content in a
`UiCollapsibleBlock` with an entry-count flair and an "add" icon button in
`#controls`. Its "add" button opens the edit flow with the target fixed to
`{ kind: "journal"; journalName }`.

### Shared list

`commands/ui/CommandList.vue`. A presentational component both surfaces render
inside their `UiCollapsibleBlock` body. It takes the already-filtered
`[id, CommandConfig][]` entries and renders one `UiSettingRow` per command — the
command name, a resolved description flair, and edit/delete `UiIconButton`s —
plus an empty-state row. It emits `edit(id)` and `delete(id)`; it owns no
service access and no collection mutation.

## The journal-edit extension point

The v3 dynamic-commands spec requires that `journals` not depend on `commands`.
`JournalCommandsSection.vue` lives in `commands/` but must render inside
`JournalEditSubpage.vue`, which lives in `journals/`. Importing the component
directly would create the forbidden `journals → commands` edge.

The codebase already solves this for the settings shell with `DashboardBlockToken`
and `SubpageToken`: a feature contributes UI through a DI token, and the shell
renders token values without importing the feature. The journal editor gets the
same treatment.

`src/journals/settings/ui/journal-edit-section.ts` exports:

```ts
interface JournalEditSection {
  readonly key: string;
  readonly component: Component;
  readonly order: number;
}

function defineJournalEditSection(section: JournalEditSection): JournalEditSection;
```

and a `JournalEditSectionToken`. `JournalEditSubpage.vue` injects the token,
sorts the sections by `order`, and renders each as
`<component :is="section.component" :journal-name="journalName" />` after its
built-in blocks. The contributed component receives a single `journalName`
prop. The extension point is generic — it knows nothing about commands.

`commands` registers `JournalCommandsSection` into `JournalEditSectionToken`.
The dependency runs `commands → journals` (importing the token), which is
allowed; `journals → commands` stays absent.

## Orchestration: flows

Mutations run through flows, matching `AddJournalFlow` and
`EditFrontmatterFieldFlow`. The dashboard block and the journal section invoke
flows via `Flows`; flows own the modal interaction and the collection write.

### `EditCommandFlow`

`commands/ui/edit-command.flow.ts`. Input
`{ commandId?: string; target: CommandTarget }`.

- Resolves the existing `CommandConfig` when `commandId` is given, otherwise
  starts from the collection's `defaultItem`.
- Opens `editCommandModal` with `{ command?, target, takenNames }`, where
  `takenNames` is every other command's `name` (uniqueness validation).
- On submit, writes the returned `CommandConfig` with `collection.add(id, config)`.
  `id` is the existing `commandId`, or a freshly generated id for a new command.
  `ReactiveCollection.add` overwrites the entry wholesale, so add and edit share
  one write path.
- A cancelled modal aborts the flow with `UserAborted` and mutates nothing.

The `commands` collection is the first collection keyed by a generated id; no id
helper exists yet. The flow generates ids with `crypto.randomUUID()`.

### `DeleteCommandFlow`

`commands/ui/delete-command.flow.ts`. Input `{ commandId }`. Opens
`deleteCommandModal` (a plain confirmation), then `collection.remove(commandId)`.
A cancelled modal leaves the collection untouched.

Both flows are registered in `commands/module.ts`.

## The edit modal

`commands/ui/EditCommandModal.vue` with `edit-command-modal.ts` (`defineModal`).
A `vee-validate` + `valibot` form following `AddJournalModal`: every field wraps
in a `UiSettingRow`, field errors render in the `#description` slot, and the
action buttons sit in a final controls-only row.

Modal params: `{ command?: CommandConfig; target: CommandTarget; takenNames:
string[] }`. The modal resolves to a complete `CommandConfig`.

Fields:

- **Name** — text input. Required; must be unique against `takenNames`. The v3
  registry uses `command.name` verbatim as the Obsidian command name, so —
  unlike v2 — the modal promises no journal-name prefixing.
- **Write type** — `day` / `week` / `month` / `quarter` / `year` dropdown,
  rendered only for an `all` target. For a `journal` target the write type is
  derived from the journal config and shown as static text. The effective write
  type drives the `type` field's options.
- **When command runs** (`type`) — dropdown populated from
  `supportedTypes(writeType)`. When the write type changes and the current
  `type` is no longer in the supported set, `type` clamps to `same`.
- **Context** — `today` / `open_note` / `only_open_note` dropdown. Hidden when
  `type === "same"` (v2 behavior), shown with the v2 explanatory text.
- **Show in ribbon** — toggle.
- **Icon** — rendered only when the ribbon toggle is on. Uses `UiIconSuggest`.
  Required and must be a valid icon id whenever the ribbon toggle is on.
- **Open mode** — `active` / `tab` / `split` / `window` dropdown.

`commands/ui/DeleteCommandModal.vue` with `delete-command-modal.ts` — a
confirmation modal naming the command, with Cancel and Delete buttons.

## The icon picker

`src/ui/UiIconSuggest.vue`. A reusable UI primitive built like `FolderInput.vue`
on the input-suggest infrastructure. It wraps `UiInputSuggestInput` with a
`defineInputSuggest<string>` whose `fetch` filters Obsidian's `getIconIds()` by
the query and whose `render` draws each icon (via `setIcon`) beside its id —
porting v2's `icon-suggest` presentation. The icon-id list is computed once. The
component also shows the currently-selected icon as a preview next to the input.

It lives in `src/ui/` because it is feature-agnostic.

## Command-type labels

v2's `resolveCommandLabel(writeType, type, context)` produced human strings such
as "Open same month next year". v3 ports this as a single parameterized
paraglide message keyed on those three inputs, following the `m.journal_write`
precedent. The label stays in the UI layer; `resolve.ts` gains no label logic.

## i18n

New `command_*` paraglide messages:

- Block and section: title, entry-count context, empty-state text, and
  add/edit/delete tooltips.
- Modal: field labels, the context explanatory text, and validation errors
  (name required, name not unique, icon required).
- The parameterized command-type label described above.

## Wiring

`commands/module.ts` additionally:

- registers `CommandsDashboardBlock` into `DashboardBlockToken` via
  `defineDashboardBlock` at `order: 6`;
- registers `JournalCommandsSection` into `JournalEditSectionToken` via
  `defineJournalEditSection`;
- registers `EditCommandFlow` and `DeleteCommandFlow` as classes.

Modals need no module registration — a `defineModal` definition is imported and
passed to `ModalService.open` directly, as the journal modals already do.

`journals` adds `JournalEditSectionToken` to its DI registration and
`JournalEditSubpage.vue` consumes it.

## Testing

Following the project's test conventions — colocated `*.test.ts`,
`@testing-library/vue` for components, one behavior per test, black-box
assertions:

- `EditCommandModal.vue` — required and uniqueness name validation each surface
  an error; changing the write type clamps an unsupported `type`; the icon
  field appears only with the ribbon toggle on; the context field is hidden for
  `same`; a valid submit resolves the expected `CommandConfig`.
- `EditCommandFlow` — adding generates an id and inserts the command; editing
  overwrites the existing entry; a cancelled modal mutates nothing.
- `DeleteCommandFlow` — confirming removes the entry; cancelling leaves it.
- `CommandsDashboardBlock` and `JournalCommandsSection` — each lists only its
  own target kind; the add/edit/delete controls invoke the correct flow with
  the correct target.
- `JournalEditSubpage` — renders sections contributed through
  `JournalEditSectionToken`.
- `UiIconSuggest` — not unit-tested directly; it is thin input-suggest wiring,
  and the project skips wiring tests.

Quality gates: `test`, `check:types`, `check:lint`.
