# Journal edit subpage: uniform DI-registered sections

## Problem

The journal settings subpage (`JournalEditSubpage.vue`) renders in two disjoint
parts:

1. Five **hardcoded** sections inlined in the template — Note Creation,
   Templates, Timeline, Sequence, Frontmatter.
2. One sorted `v-for` block at the bottom rendering every section contributed
   through `JournalEditSectionToken` — Shelf (order 5), Commands (10), Nav Block
   (40), Interval Block (41), Decorations (50).

This split has two consequences:

- The **Shelf** section should be the first block on the subpage, but it can
  only ever appear inside the bottom block, below all five hardcoded sections.
  Pulling just the shelf to the top would require the journals subpage to
  hardcode the `"shelf"` key — coupling journals to a shelves concept.
- The **Shelf** section renders even when no shelves exist, offering a
  "place on shelf" action that goes nowhere useful.

## Goals

- Every section on the subpage — including the five core ones — is a
  `JournalEditSection` registered through `JournalEditSectionToken`. The subpage
  becomes a header plus one sorted `v-for`. Shelf gets the lowest `order` and
  lands first with no key special-casing.
- The Shelf section is hidden when no shelves exist.

## Non-goals

- No change to the behaviour of any section's controls. This is a structural
  extraction, not a feature change.
- No new placement/ordering abstraction beyond the existing numeric `order`.

## Design

### Section extraction

The five hardcoded sections move into new single-purpose components under
`src/journals/settings/ui/sections/`, registered by the **journals** module
itself (same token the external feature modules already use):

- `NoteCreationSection.vue` — name template, folder, date format, confirm /
  auto-create. Carries the existing helpers it depends on: `VariableReferenceHint`,
  `NoteNamePreview`, `FolderInput`/`FolderPathPreview`, `DateFormatPreview`,
  invertibility check, and the move-to-folder recommendation handlers.
- `TemplatesSection.vue` — add/remove templates, `.flair` count,
  `CodeBlockReferenceHint`, `TemplaterSupportHint`, `TemplatePathPreview`.
- `TimelineSection.vue` — start/end anchors via `useAnchorField`, `DatePicker`,
  `OpenInterval` end bounds, end-kind dropdown.
- `SequenceSection.vue` — numbering enable toggle, sources, reset logic,
  allow-before, sequence property-key flow.
- `FrontmatterSection.vue` — date/start/end frontmatter field flows and toggles.

Each new component:

- Takes `journalName: string` as its only prop (inline `defineProps`, matching
  the existing DI sections).
- Resolves its own `config` via `JournalsViewModel.getJournal(journalName)` —
  identical to how `DecorationsSection`, `NavBlockSection`, `IntervalBlockSection`
  already obtain config.
- Owns its own `expanded` ref. Note Creation defaults to expanded (`true`),
  matching today's `noteCreationOpen = ref(true)`; the rest default collapsed.
- Recomputes its own derived values (`hasCycle`, `numberingVariableNames`,
  `writing`, anchor models, etc.) from `config`. No state is shared back to the
  subpage.

`useAutoCreateOnEnable` moves to `NoteCreationSection` (it watches the
auto-create config that section owns).

### Subpage after

`JournalEditSubpage.vue` reduces to:

- The `config` guard (`v-if="config"`) and the `watchEffect` that calls
  `nav.back()` when the journal disappears.
- The heading `UiSettingRow` (title + bulk-add + rename + back).
- The single sorted `v-for` over `editSections` rendering
  `:journal-name="journalName"`.

The journals module gains registrations for the five core sections into
`JournalEditSectionToken`. The journals module already owns the token; it
registers its own sections at boot alongside the external modules' registrations.

### Ordering

All `JournalEditSection` orders are renumbered with gaps of 10 so intent is
readable and there is room to insert:

| order | section        | registered by |
| ----- | -------------- | ------------- |
| 10    | Shelf          | shelves       |
| 20    | Note Creation  | journals      |
| 30    | Templates      | journals      |
| 40    | Timeline       | journals      |
| 50    | Sequence       | journals      |
| 60    | Frontmatter    | journals      |
| 70    | Commands       | commands      |
| 80    | Nav Block      | nav           |
| 90    | Interval Block | views         |
| 100   | Decorations    | decorations   |

`order` is an internal sort key only; no persisted data or other consumer
depends on the specific values, so renumbering is safe.

### Hiding Shelf when no shelves exist

- Add `hasShelves(): boolean` to `ShelvesService` — a domain query backed by the
  shelves repository (`this.#shelves.find().ids()` is non-empty). This keeps the
  component on the service facade rather than injecting the repository directly.
- `JournalShelfSection.vue` gates its `UiCollapsibleBlock` with
  `v-if="hasShelves"`, where `hasShelves` is a `computed` reading
  `shelvesService.hasShelves()`. Reactivity flows from the same reactive settings
  storage the rest of the section already reads.

When no shelves exist the section renders nothing and Note Creation is the first
visible block; this is independent of the extraction work.

## Testing

Per test-hygiene (co-locate tests with implementation):

- Each new section component gets a co-located `*.test.ts` covering its observable
  behaviour, moved out of the current monolithic `JournalEditSubpage.test.ts`.
- `JournalEditSubpage.test.ts` shrinks to: renders registered sections in `order`,
  the `config`-missing → `nav.back()` guard, and the header actions.
- `JournalShelfSection.test.ts` gains: hides the section when no shelves exist
  (existing tests already seed a shelf, so they continue to pass).
- No tests for the DI wiring/registration itself (wiring is not tested).

## Risks

- Large diff: one ~490-line component splits into five, plus registration and
  test moves. Mitigated by the extraction being mechanical — behaviour is
  preserved verbatim per section.
- Each extracted section independently resolves `config`; if `JournalsViewModel`
  returns `undefined` mid-render the section must guard exactly as the subpage
  does today (`v-if="config"`). Every new component keeps that guard.
