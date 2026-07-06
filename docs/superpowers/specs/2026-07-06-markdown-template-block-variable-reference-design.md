# Markdown template block — supported-variables reference

## Problem

The Markdown template block's "Template file" setting shows a static one-line hint
listing a few variables. Every other template input in the plugin (journal template,
name template, folder path) instead shows a **"Supported variables." link** that opens
a reference modal. This block should match that UX.

It cannot literally reuse the journals reference: `VariableReferenceModal` is
journal-coupled (requires `journalName`, `dateFormat`, `hasCycle`,
`numberingVariableNames`) and renders journal-only variables (`journal_name`, cycle
`start_date`/`end_date`, numbering vars) that this block does not process. Reusing it
would also import `src/journals` UI into `src/views`.

## Supported variables (accurate to the block)

From `MarkdownTemplateBlock.vue` the render context is fixed and journal-independent:

- `{{date}}` — the view's focus date; default format `YYYY-MM-DD`.
- `{{current_date}}` — today; default format `YYYY-MM-DD`; non-invertible.
- `{{time}}` — current time; default format `HH:mm`.
- `{{current_time}}` — current time; default format `HH:mm`.
- `{{journal_link(name)}}` — vault path (no `.md`) to another journal's note; a global
  function registered by the journals feature, available at runtime.

All of `date` / `current_date` / `time` / `current_time` support the standard
modification grammar: format override (`:FORMAT`), shift (`+1d`, `-2w`, …), and
boundary (`<startOf=week>`, `<endOf=month>`, …). `journal_link` accepts shift
modifiers; its format slot is ignored.

## Approach

A **new block-scoped reference** owned by the views/blocks feature, with **journal-neutral
primitives lifted to shared homes** so there is no duplication and no `views → journals`
coupling.

### 1. Lift journal-neutral primitives out of `src/journals/settings/ui/`

These are already journal-agnostic (no journal props; only generic `variable_*` /
`common_*` i18n keys):

| Component                    | New home            | Rationale                                                     |
| ---------------------------- | ------------------- | ------------------------------------------------------------- |
| `VariableChip.vue`           | `src/templates/ui/` | Template-token chip with copy-to-clipboard                    |
| `DateModificationsModal.vue` | `src/templates/ui/` | Template modification-syntax reference                        |
| `I18nWithSlot.vue`           | `src/ui/`           | Generic i18n-message-with-slot helper (not template-specific) |

- The `dateModificationsModal` **`defineModal`** moves from
  `src/journals/settings/ui/modals.ts` to a new `src/templates/ui/modals.ts`
  (the `no-restricted-syntax` rule allows `defineModal()` only in a `**/ui/modals.ts`).
- Consumers import these UI components by **direct path** (e.g.
  `@/templates/ui/VariableChip.vue`), not through the `templates` engine barrel
  (`src/templates/index.ts`), keeping the engine barrel free of Vue components.
- `journals → templates` and `views → templates` are both already-allowed dependency
  directions, so no new import cycle is introduced.
- Move the three colocated `*.test.ts` files with their components.
- Update existing importers: `VariableReferenceModal.vue` (`VariableChip`,
  `I18nWithSlot`), `DateModificationsModal.vue`'s own imports, `TemplaterSupportHint.vue`
  (`I18nWithSlot`), `VariableReferenceHint.vue` and `VariableReferenceHint.test.ts`
  (`dateModificationsModal` path).

### 2. New block-scoped reference (`src/views/blocks/markdown-template/ui/`)

- **`MarkdownTemplateVariablesModal.vue`** — lists the five variables above using the
  shared `VariableChip`. Each date/time row links to the shared `dateModificationsModal`
  ("date modifications" link). Includes a moment.js format-reference link
  (reuse `common_moment_format_reference`). No journal props — self-contained.
- **`modals.ts`** (block-local) — `defineModal` for the variables modal.
- **`MarkdownTemplateBlockConfig.vue`** (edit) — replace the static `#description` text
  with a "Supported variables." link that opens the modal via `useModalService()`.
  The open handler is inlined (single use; no separate hint component).

Opening this modal from inside the "Edit block" modal is a supported modal-on-modal
stack — `ModalService` tracks multiple open hosts, the same way journals'
`VariableReferenceModal` opens `DateModificationsModal`.

### 3. i18n (`messages/en.json`)

- Remove the now-unused `view_block_markdown_template_variables_hint`.
- Add block-scoped keys (do not reuse journal-namespaced description keys):
  - `view_block_markdown_template_variables_link` — link text ("Supported variables.").
  - `view_block_markdown_template_variables_modal_title` — modal title.
  - `view_block_markdown_template_variables_intro` — one-line intro (may take
    `{dateFormat}`).
  - one description key per variable: `date`, `current_date`, `time`, `current_time`,
    `journal_link`.
- Reuse existing shared keys where they are already generic:
  `variable_modifications_*`, `common_moment_format_reference`,
  `variable_chip_copied`, and the "date modifications" link label.

## Testing

- Move `VariableChip.test.ts`, `DateModificationsModal.test.ts`, `I18nWithSlot.test.ts`
  to their new locations; fix the `dateModificationsModal` import path in
  `VariableReferenceHint.test.ts`.
- New `MarkdownTemplateVariablesModal.test.ts` (testing-library): renders the variable
  rows; the modifications link opens `dateModificationsModal`.
- Update `MarkdownTemplateBlockConfig.test.ts`: the "Supported variables." link is
  present and opens the variables modal. Drop assertions on the removed static hint.
- Gates: `npm run test`, `npm run check:types`, `npm run check:lint`, plus the wdio e2e
  suite (runtime UI change).

## Decisions taken (conventions bent, deliberately)

- **Block-local `modals.ts`.** The markdown-template block has no `module.ts`, so by the
  "sub-feature = has a module.ts" convention its modal would fold into
  `src/views/ui/modals.ts`. It is placed block-local instead, for cohesion: the block
  stays self-contained and `src/views/ui` need not reach into one specific block.
- **`I18nWithSlot` → `src/ui/`** (not co-located in `src/templates/ui/`), because it is a
  generic i18n helper with no template semantics.

## Out of scope

- Generalizing the journal `VariableReferenceModal` into a shared parameterized modal.
- Any change to the block's runtime rendering or its supported variable set.
