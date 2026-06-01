# Per-journal interval-block editor

## Problem

Each journal config carries an `intervalBlock` field (`navBlockSchema`) that the
`custom-intervals` view block renders per custom journal. The field exists with
an empty-rows default, but **no settings UI can edit it** — so the block always
renders nothing. The v2 editor for these rows was never ported and still lives
in `src/_old-code/`.

A complete v3 editor already exists for the sibling `navBlock` field (identical
schema) under `src/code-blocks/nav/settings/`: a collapsible section, a per-row
edit flow, and a row modal. This work makes that editor field-agnostic and adds
a slim second entry point for `intervalBlock`. It is an extraction and
generalization, not a new build.

## Decisions

- **Strategy: extract a shared, field-agnostic editor unit** with two thin
  wrapper sections — rather than parameterizing the existing component in place
  or duplicating it into the views feature.
- **Controls: the interval section exposes a subset.** The custom-intervals view
  reads only `rows` and `decorateWholeBlock`; it ignores `type` (create/existing),
  and `journalDefaultsFor(...).intervalBlock.rows` is empty, so "Use defaults"
  would be a no-op. The interval section therefore shows the row list + decorate
  toggle + preview only — no mode dropdown, no use-defaults button. The nav
  section keeps full controls.
- **Placement: the shared unit stays in `code-blocks/nav/settings/`.** The
  dependency already flows views → code-blocks/nav (`CustomIntervalsBlock.vue`
  imports `NavBlockRow` and `periodForJournal` from there). Moving the editor
  into `journals/` would risk a cycle, because the preview needs `NavBlockRow`.
- **Visibility: the interval section is gated to custom-write journals.**
  `intervalBlock` is dead config on day/week/month/quarter/year journals, so the
  section renders only when `write.type === "custom"`.

## Units

### `NavBlockRowsEditor.vue` (new — `code-blocks/nav/settings/ui/`)

The current `NavBlockSection.vue` body, parameterized. Props:

- `journalName: string`
- `field: "navBlock" | "intervalBlock"` — every read and write goes through
  `config[field]`
- `title: string`, `icon: string` — the collapsible section heading
- `mode?: boolean` (default `false`) — show the create/existing dropdown
- `useDefaults?: boolean` (default `false`) — show the "Use defaults" button

Reorder and remove mutate `config[field].rows` in place (live repository object).
Add and edit delegate to the field-aware flow. Live preview reuses
`NavBlockRow.vue` unchanged.

### Field-aware edit flow (`edit-nav-row.flow.ts`, generalized)

Add `field: "navBlock" | "intervalBlock"` to the flow parameters. Read and write
`config[field].rows`; persist via `repository.update(name, { [field]: ... })`.
The row modal (`EditNavBlockRowModal`) already depends only on `journalName` and
the row value, so it is untouched. Existing flow/error names are kept to limit
churn.

### Wrapper sections

Each `JournalEditSection` component receives only a `journalName` prop, so each
field needs its own wrapper that hardcodes field/title/icon/flags:

- `NavBlockSection.vue` becomes a thin wrapper:
  `field="navBlock"`, `mode`, `useDefaults`, `icon="signpost-big"`, nav title.
  Registration in `navBlockSettingsModule` is unchanged (order 40).
- `IntervalBlockSection.vue` (new — `views/blocks/custom-intervals/ui/`): root
  `v-if` on `write.type === "custom"`, then the shared editor with
  `field="intervalBlock"`, `icon="list"`, interval title, and neither `mode` nor
  `useDefaults`. Registered as a `JournalEditSectionToken` value from the **views
  module** (order ~41).

## Data flow

`JournalEditSubpage` renders sorted `JournalEditSectionToken` components, passing
`journalName`. Both wrappers resolve the live config via
`JournalsViewModel.getJournal` and render the shared editor. For non-custom
journals the interval section's `v-if` yields nothing.

## i18n

The shared editor's row-level labels currently read `nav_block_section_*`
("navigation" wording). Neutralize the row-level keys (add-row, move/edit/delete
tooltips, decorate label, empty text) to `block_rows_*`; the section title and
icon arrive as props. Add one new title key for the interval section.

## Testing

- `NavBlockRowsEditor.test.ts` — parameterized over `field`: renders rows,
  add/edit invokes the flow with the correct field, reorder/remove mutate the
  correct field, decorate toggle binds, mode/use-defaults hidden when props off.
- Extend `edit-nav-row.flow.test.ts` to cover `field: "intervalBlock"` write-back.
- `IntervalBlockSection.test.ts` — editor shown for a custom journal, absent for
  a fixed-write journal.
- Existing `NavBlockSection.test.ts` stays green through the wrapper.
- Gates: `test`, `check:types`, `check:lint`.

## Out of scope

- Copying v2 `calendarViewBlock` data into `intervalBlock` — that is the deferred
  migration slice. This editor only enables manual population.
- The `config.journals` selector on the custom-intervals block config — a
  separate, smaller task.

## Files

**New:** `NavBlockRowsEditor.vue` (+ test), `IntervalBlockSection.vue` (+ test).

**Modified:** `NavBlockSection.vue` (→ thin wrapper), `edit-nav-row.flow.ts`
(+ test), `views/module.ts` (register section), i18n messages.
