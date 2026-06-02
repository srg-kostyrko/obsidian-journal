# Code-block reference help modal (v2→v3 regression #11)

Date: 2026-06-02
Branch: `v3-ai`
Tracks: regression #11 in `docs/2026-06-01-v2-v3-feature-gaps.md`

## Problem

v2 had a "Supported code blocks" reference: a link in the journal's **Templates**
settings section opened a modal documenting the three code blocks, with
**live-rendered previews for the current journal**, click-to-copy snippets, the
list of supported timeline modes, and the list of home-block options. v3 dropped
this surface entirely — there is no in-settings code-block help.

v2 source: `src/_old-code/components/modals/CodeBlockReference.modal.vue` +
`src/_old-code/components/CodeBlockReferenceHint.vue`, surfaced from
`src/_old-code/settings/JournalSettingsEdit.vue` (Templates block, between the
variable-reference and Templater-support hints).

## Goal

Restore the reference modal at full v2 fidelity, reusing v3's established
"hint link → reference modal" pattern (`VariableReferenceHint` →
`VariableReferenceModal`). The link goes back into the Templates section
description, between `VariableReferenceHint` and `TemplaterSupportHint`, matching
v2's placement exactly.

## What the modal shows

Mirrors v2's content, for the journal whose settings are open:

1. An intro line: click a snippet to copy it.
2. **Navigation block** (`journal-nav`):
   - Copyable snippet for `journal-nav`.
   - Description of what it does.
   - A **live `NavigationCodeBlock`** rendered for the current journal.
   - Note that `calendar-nav` and `interval-nav` are aliases of `journal-nav`.
3. **Timeline block** (`calendar-timeline`):
   - Copyable snippet for `calendar-timeline`.
   - Description.
   - A **live `TimelineCodeBlock`** for the current journal (default mode).
   - Copyable snippet showing the `mode:` option (e.g. `mode: month`).
   - The supported-mode list, derived from the timeline mode picklist:
     `week`, `month`, `quarter`, `calendar`.
   - The v3-only `weeks: none | left | right` option (extension over v2; allowed
     under the v2-fidelity-default rule).
4. **Home block** (`journals-home`):
   - Copyable snippet for `journals-home`.
   - Description.
   - A **live `HomeCodeBlock`** with the default config.
   - The supported options: `show` (day/week/month/quarter/year/custom),
     `separator`, `scale`, `shelf`.
   - A copyable snippet of a customized `journals-home` config and a matching
     **live preview** of that customized config.

All prose and labels are new `journal_edit_code_block_*` paraglide messages
(mirroring how `VariableReferenceModal` is fully messaged). Block names, alias
names, mode keys, and option keys stay as literal `<code>` text — they are not
translatable strings.

## Live-preview mechanism

All three v3 blocks render off `index.entryByPath(path)` and resolve the journal
config via `JournalsRepository`. To produce a meaningful preview, the modal needs
a `path` that resolves, in the shared `JournalsIndex`, to an entry for the current
journal at **today's anchor**.

**Strategy (v2-literal — confirmed with the user):** always register a synthetic
entry while the modal is open, and unregister it on unmount.

- Anchor: `cycle.anchorOf(journalName, CalendarDate.today())`, falling back to
  today's raw anchor if the cycle yields none.
- Path: a synthetic `VaultPath` that cannot collide with a real note, prefixed so
  it is obviously not a vault file (e.g. `@journal-code-block-preview@<n>`), where
  `<n>` comes from a module-level counter incremented per mount (not
  `Date.now()`/`Math.random()`).
- On mount: `index.register({ journalName, anchor, path })`.
- On unmount: `index.unregister(path)`.

This is exactly v2's `useFakePathData` behavior, lifted to v3's index API.

### Known delta / accepted risk

`JournalsIndex` is a shared singleton that live calendar/timeline views also read.
`register` keys the journal sub-index by anchor, so while the modal is open and a
real note already exists at today's anchor, that anchor's path mapping is
temporarily repointed to the synthetic path; any open calendar/timeline view will
resolve today's cell to the synthetic path until the modal closes. On unmount the
synthetic entry is removed; the real entry's mapping is restored on the next index
refresh. This matches v2's latent behavior and was explicitly chosen over the
"prefer the real note's path" alternative.

## Components

All new SFCs/composables live under `src/journals/settings/ui/`, beside the other
hints and modals (per the feature-directory-schema convention).

- **`CodeBlockReferenceHint.vue`** — `<a>` link; on click calls
  `modals.open(codeBlockReferenceModal, { journalName })`. Twin of
  `VariableReferenceHint.vue`.
- **`CodeBlockReferenceModal.vue`** — the modal body described above. Imports the
  three block components from `@/code-blocks/{nav,timeline,home}/ui`, uses the
  preview-path composable, and renders snippets + descriptions + lists.
- **`CodeBlockSnippet.vue`** — presentational click-to-copy snippet (v3 equivalent
  of v2's `DisplayCodeBlock`): renders the fenced ` ```<name> ` block with an
  optional body, and copies the rendered text to the clipboard on click via the
  host notice/clipboard service. (Verify the host clipboard/notice service during
  planning; fall back to `navigator.clipboard` + the existing notice service as v2
  did.)
- **`use-code-block-preview-path.ts`** — composable implementing the live-preview
  mechanism above; returns the synthetic `VaultPath` and registers/unregisters it
  across the component lifetime.
- **`modals.ts`** — add `codeBlockReferenceModal = defineModal()(...)` with a
  `journalName` prop, a `width` of ~780 (v2 parity), and the
  `journal_edit_code_block_reference_modal_title` title message.
- **`JournalEditSubpage.vue`** — render `<CodeBlockReferenceHint :journal-name>` in
  the Templates section `#description`, between `VariableReferenceHint` and
  `TemplaterSupportHint`.

## Testing

Colocated `*.test.ts`, `@testing-library/vue` for components, one behavior per
test, black-box assertions.

- **`use-code-block-preview-path.test.ts`**
  - registers a synthetic entry for the journal at today's anchor on mount
  - returns a path that `index.entryByPath` resolves to that entry
  - unregisters the synthetic entry on unmount
- **`CodeBlockReferenceModal.test.ts`**
  - renders a live nav/timeline/home preview for the supplied journal
  - lists the supported timeline modes
  - lists the supported home options

The hint link and modal registration are DI/wiring and are not tested (per the
no-wiring-tests rule). `CodeBlockSnippet`'s clipboard copy is a host side effect,
not asserted (black-box rule).

## Out of scope

- Data migration (tracked separately).
- Any change to the code blocks themselves or their configs.
- A command-palette entry for the reference (v2 had none).

## Quality gates

`npm run test`, `npm run check:types`, `npm run check:lint` all pass.
