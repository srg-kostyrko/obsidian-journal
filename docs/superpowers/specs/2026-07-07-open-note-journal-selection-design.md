# Open-note button: select a single journal

## Problem

The button toolbar item's period actions (`current` — the "open note" preset — and
`pick-date`) open the target-period note in **every** shelf-scoped journal whose write
level matches the toggled level(s), via `journalsFor(level)` → `useShelfScope`. There is
no way to pin the button to one specific journal.

## Goal

Let a user pin a period-action button to a single journal. When a journal is pinned, the
button opens the note in exactly that journal at the journal's own granularity, replacing
the level + shelf-scope resolution. Leaving the journal unset preserves today's behavior.

## Decisions

- **Journal replaces level.** A pinned journal overrides level + shelf resolution; the
  button opens the current/picked-period note in that one journal at its own write level.
  The levels toggle is hidden in the config while a journal is pinned.
- **Both period actions** (`current` and `pick-date`) offer the picker; they share the
  same open path. `navigate-step` never opens a note and is untouched.
- **All vault journals** are listed in the picker (`JournalsViewModel.journalOptions`).
  If the stored journal name no longer resolves at runtime (renamed/deleted), the button
  is a **no-op**.
- **Level-based default label/tooltip** is retained. `resolveButtonAppearance` stays pure
  and level-driven; `levels` is kept in the config (just hidden) so the default is stable.

### Consequences worth stating

- A button can be pinned to a journal that is **not on the view's shelf**, and it will
  open it. This is the direct result of listing all vault journals; it is intended.
- `select-only` mode + a pinned journal feeds a journal-granular anchor to
  `context.setRefDate`. This niche combo keeps existing mode semantics rather than being
  special-cased.

## Design

### Schema — `src/views/toolbar-items/button/button-config.ts`

Add one optional field to the two period-action variants; `navigate-step` unchanged:

```ts
export const buttonActionSchema = v.variant("type", [
  v.object({ type: v.literal("pick-date"), mode: modeField, levels: levelsField, journal: v.optional(v.string()) }),
  v.object({ type: v.literal("current"), mode: modeField, levels: levelsField, journal: v.optional(v.string()) }),
  v.object({
    type: v.literal("navigate-step"),
    direction: v.picklist(["prev", "next"] as const),
    unit: stepUnitField,
    amount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
]);
```

`ButtonAction` / `ButtonConfig` re-infer automatically. The field is optional, so existing
stored configs still parse — **no migration**. The open-note preset's `defaultConfig` is
unchanged (`journal` unset).

### Runtime — `src/views/toolbar-items/button/ui/ButtonItem.vue`

- Inject `CycleService` (from `@/journals`).
- `applyMode` is refactored to accept `journalNames: readonly string[]` directly instead of
  a `level` (the shelf path passes `journalsFor(level)`, the journal path passes
  `[journal]`). `mode` handling (`select-only` / `navigate` / `create`) is unchanged.
- `onClick`: if the action is a period action with `journal` set, fire once via
  `fireJournal` (skip the multi-level menu — a pinned journal is a single target).
  Otherwise the existing single-level / multi-level-menu logic runs unchanged.
- New `fireJournal(action, event)`:
  - `current` → `date = CalendarDate.today()`.
  - `pick-date` → open `datePickerModal` at **day** granularity; on cancel, return;
    otherwise `date =` the picked day.
  - `anchor = cycle.anchorOf(action.journal, date)` — resolves to the journal's own
    granularity for both fixed and custom journals.
  - If `anchor.isNone()` → **no-op** (journal missing).
  - `applyMode(action.mode, anchor.value, [action.journal], event)`.

### Config UI — `src/views/toolbar-items/button/ui/ButtonItemConfig.vue`

- Inject `JournalsViewModel`; expose `journalOptions`.
- Add a **Journal** dropdown row for period actions (`periodAction`):
  - Row name: `m.common_label_journal()`.
  - First option is an empty "shelf default" entry (`journal: undefined`), labelled by a
    new i18n message `view_toolbar_button_config_journal_default`; then one option per
    `journalOptions` entry.
  - `setJournal(journal: string | undefined)` → `update({ action: { ...action, journal } })`.
- Hide the levels toggle while a journal is pinned:
  `v-if="periodAction && !periodAction.journal"`. `mode`, icon, label, tooltip rows stay.

### Appearance — unchanged

`resolveButtonAppearance(action)` remains pure and level-based.

## Testing

- **`ButtonItem`** (testing-library + faked `Flows` / `CycleService`), one behavior each:
  - pinned `current` + `create` opens `OpenDateFlow` with `journalNames: [journal]` and the
    journal-granular anchor from `anchorOf`.
  - pinned journal that `anchorOf` cannot resolve → no `OpenDateFlow` invocation (no-op).
  - pinned `pick-date` resolves the picked day through `anchorOf` before opening.
  - unset journal still resolves via shelf scope (regression guard).
- **`ButtonItemConfig`** (testing-library):
  - selecting a journal hides the levels toggle.
  - clearing the journal restores the levels toggle.
  - selecting a journal updates `action.journal`.
- **e2e (wdio)** — runtime note-opening changes: extend/add a toolbar button e2e asserting
  a journal-pinned button opens that journal's note.

## Out of scope

- No change to `navigate-step`.
- No change to `resolveButtonAppearance` semantics.
- No shelf-scoped filtering of the picker list.
