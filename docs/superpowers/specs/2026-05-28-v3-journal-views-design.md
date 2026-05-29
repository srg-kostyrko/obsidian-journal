# v3 journal views — design

## Goal

Replace v2's single hardcoded calendar view (`src/_old-code/calendar-view/`) with a system of user-defined views, each composed of an ordered list of configurable blocks. v2's calendar view ships as the default migrated view; users can create additional views, finetune which blocks they contain, and open multiple side by side. Resolves issue #189.

## Background

v2 has one `CalendarView` (Obsidian `ItemView`) registered under `CALENDAR_VIEW_TYPE`. It mounts a single Vue tree with a hardcoded layout: header row (shelf-selector, pick-date, today) + `NotesMonthView` (with its own month/quarter/year period buttons and chevrons) + custom-intervals list (one `NavigationBlock` per overlapping interval of each custom journal in the selected shelf). State: `refDate` is component-local (resets to today); `selectedShelf` is global (`uiSettings.calendarShelf`); per-journal interval rows live on each journal config as `journal.calendarViewBlock`.

v3 has none of this yet. It does have:

- Code-block infrastructure (`defineCodeBlock`, `CodeBlockService`, `CodeBlockDefinitionToken`) for markdown ` ` blocks — **structurally similar but a different concept**. View blocks are a parallel system; they are not registered as code blocks.
- Notes-aware grid building blocks (`NotesMonthView`, `NotesWeekView`, `NotesCalendarCell`, `useNotesCell`, `useShelfScope`, `useCellDecorations`) introduced by the timeline code block.
- A reactive settings store with `defineCollection` / `defineSlice` / migrations.
- Dynamic command registry (`DynamicCommandRegistry`) that already supports register/re-register at runtime.
- `defineSubpage` / `defineDashboardBlock` settings UI patterns (shelves uses both).
- `JournalsRepository`, `ShelvesRepository`, journal config now carries `navBlock` (rows + decoration) but **does not** yet carry the v2-equivalent of `calendarViewBlock`.

## Scope

In scope:

- New `src/views/` feature: registries, repository, service, view-host helper, default-view migration, top-level Obsidian-view registration.
- New `defineViewBlock` and `defineToolbarItem` registration APIs with their own DI tokens.
- A `ViewContext` provide/inject contract consumed by blocks/items via a `useViewContext()` composable.
- MVP block catalogue: one container block (`toolbar`), four content blocks (`month-calendar`, `week-calendar`, `custom-intervals`, `divider`), three toolbar items (`button`, `shelf-selector`, `period-buttons`). `button` carries a polymorphic `action` discriminated union (`pick-date` / `current` / `navigate-step`) — see [Button actions](#button-actions). v2 layout is preserved by the migration-seeded default view; the new system adds week-calendar, multi-level pick-date/current, configurable navigation steps, and `hideWeekends`.
- A new per-journal config field for interval-list row template (separate from `navBlock`).
- A default seeded "Calendar" view reproducing v2 visual + behaviour.
- v2 → v3 migration: map old settings into the seeded view, redirect legacy `CALENDAR_VIEW_TYPE` leaves, delete old keys.
- Settings UI: `ViewsDashboardBlock` (list/create/clone/delete) + per-view `viewEditSubpage` (rename, icon, default shelf, ribbon toggle, blocks list with add/remove/reorder/inline-config).
- Per-view auto-command `journal:open-view:<id>` always registered; ribbon icon opt-in per view.

Out of scope:

- Quarter-calendar / year-calendar view-blocks — quarter and year grids don't fit a typical sidebar leaf; revisit once horizontal layout containers exist.
- `notes-on-date` view-block (issue #116) — block-shaped gap, deferred to a follow-up milestone; shares an index access pattern with future tasks/recent-notes blocks and should land alongside them.
- Hover note-preview on calendar cells (#119), `maxDecorations` overflow with hover-list (#186) — deferred until a single cross-surface design covers both view-blocks and the timeline code-block.
- `navigate-defined` button action (#215, #150) — "jump to nearest existing note" needs a designed UX for "no more notes" plus journal disambiguation when a shelf has multiple day journals.
- Layout containers other than `toolbar` (no columns, tabs, accordions).
- Generic recursive block nesting.
- Auto-form generation from valibot schemas — each block ships its own optional Vue config component.
- Third-party plugin registration of view-blocks or button actions.
- Tasks / Dataview / other "future" block types from the issue.
- Vertical-orientation toolbars or per-toolbar alignment options (`align` field deferred until a second use case appears).
- Per-block per-leaf state for any MVP block (the leaf-state schema reserves `perBlock` but no MVP block writes it).
- Multi-level "active tab persistence" across `pick-date` opens (always defaults to `levels[0]`).
- Per-level `mode` override on `pick-date` / `current` (the `mode` field is shared across all configured levels).
- View export/import or sharing.
- The `activeStyle` cosmetic setting becoming per-view (stays a global slice).

## Architecture

### File layout

`src/views/`

- `config.ts` — valibot schemas: `viewIdSchema` (branded UUID), `viewBlockInstanceSchema`, `toolbarItemInstanceSchema`, `viewSchema`; `viewsCollection = defineCollection("views", viewSchema, defaultView)`.
- `config.test.ts`
- `errors.ts` — `ViewsError`, `UnknownViewError`, `DuplicateBlockInstanceIdError`, `InvalidViewBlockConfigError` (logging-only; never throws across the render boundary).
- `repository.ts` — `ViewsRepository` (CRUD over the `views` collection, reactive read API mirroring `ShelvesRepository`).
- `repository.test.ts`
- `service.ts` — `ViewsService` (high-level operations: `create`, `clone`, `rename`, `delete`, `addBlock`, `removeBlock`, `reorderBlocks`, `updateBlockConfig`, `addToolbarItem`, ...); each mutation goes through `attempt.in` do-notation; emits events for command/ribbon sync.
- `service.test.ts`
- `view-host.ts` — `ViewHostService` (imperative): `register(viewId): Disposer`, `registerAll()`, `dispose()`; wraps `plugin.registerView`, command/ribbon (re-)registration, leaf detach on unregister. **Eager** via `autoLoad` (see `[[feedback_di_eager_autoload]]`).
- `view-host.test.ts`
- `view-context.ts` — `provideViewContext` / `useViewContext` composables; `ViewContextKey` injection key; `ViewContext` type. Plus a testing helper `provideViewContextStub(partial)` in `testing.ts`.
- `view-context.test.ts`
- `view-leaf.ts` — Obsidian `ItemView` subclass parametrised by view id; reads view config reactively, mounts the Vue app, manages `getState`/`setState` for `{ refDate, shelf, perBlock? }`.
- `view-leaf.test.ts`
- `view-block-registry.ts` — typed registry holding `ViewBlockDefinition[]` resolved from the DI multi-binding.
- `toolbar-item-registry.ts` — same for `ToolbarItemDefinition[]`.
- `define-view-block.ts` — `defineViewBlock` factory + `ViewBlockDefinition` / `ViewBlockDefinitionInput` / `ViewBlockProps` types; `ViewBlockDefinitionToken`.
- `define-toolbar-item.ts` — symmetric `defineToolbarItem` + `ToolbarItemDefinitionToken`.
- `module.ts` — registers `viewsCollection`, `ViewsRepository`, `ViewsService`, `ViewHostService` (eager), dashboard block, view-edit subpage.
- `testing.ts` — fakes for `ViewsRepository`, context stub provider, helpers to mount a view-block in tests.
- `index.ts` — barrel exporting the public surface (no test helpers — `[[feedback_barrel_files]]`).
- `ui/`
  - `modals.ts` — `defineModal` for `ViewNameModal`, `DeleteViewModal`, `AddBlockPickerModal`, `AddToolbarItemPickerModal` (see `[[feedback_modals_consolidation]]`).
  - `ViewsDashboardBlock.vue` (+ test) — settings home block: list views, "New view", click to navigate to edit subpage.
  - `ViewEditSubpage.vue` (+ test) — per-view editor; consumes `{ viewId }` route param.
  - `view-edit-subpage.ts` — `defineSubpage<{ viewId: ViewId }>` definition (matches `shelf-edit-subpage.ts` pattern).
  - `BlocksList.vue` (+ test) — drag-to-reorder list of view-block rows; each row shows label + gear (toggles inline `configComponent`) + drag handle + remove.
  - `ToolbarItemsList.vue` (+ test) — same affordances, inner to a `toolbar` block row.
  - `legacy-view-adapter.ts` — Obsidian `ItemView` registered for v2's legacy `CALENDAR_VIEW_TYPE`; on `onOpen` it replaces itself with the default Calendar view leaf and detaches.

`src/views/blocks/` — MVP block catalogue, one folder per block, each with a `.ts` registration + `.vue` runtime + optional `.config.vue` editor + tests:

- `month-calendar/` — `MonthCalendarBlock.vue`, `MonthCalendarBlockConfig.vue` (config: `{ before: number, after: number, hideWeekends: boolean }`). Renders `1 + before + after` stacked month grids, focus month anchored to `refDate`. `hideWeekends: false` is the v2 default.
- `week-calendar/` — `WeekCalendarBlock.vue`, `WeekCalendarBlockConfig.vue` (config: `{ before: number, after: number, hideWeekends: boolean }`). Symmetric with `month-calendar` but stacks week strips. The grid primitive (`NotesWeekView`) already exists.
- `custom-intervals/` — `CustomIntervalsBlock.vue`, `CustomIntervalsBlockConfig.vue` (config: `{ journals?: JournalName[], window: WindowKind, hideEmpty: boolean }` where `WindowKind = "current-week" | "current-month" | "current-quarter" | "current-year"`). `journals?` filter undefined ⇒ all custom journals in the active shelf. `window` resolves against `refDate` honoring `moment.localeData().firstDayOfWeek()` (see `[[project_v2_week_anchor_bug]]`).
- `divider/` — `DividerBlock.vue` (no config component; config schema is `{}`).
- `toolbar/` — `ToolbarBlock.vue` (container; renders ordered `ToolbarItemInstance[]`); no per-instance config beyond the children list.

`src/views/toolbar-items/` — MVP toolbar item catalogue, one folder each:

- `button/` — `ButtonItem.vue` + `ButtonItemConfig.vue`. Generic action button; config is `{ action: ButtonAction, icon?: string, label?: string, tooltip?: string }`. Each action variant supplies sensible defaults for icon/label/tooltip; the optional override fields are pure cosmetic tweaks. See [Button actions](#button-actions).
- `shelf-selector/` — `ShelfSelectorItem.vue`; no config. Displays the current shelf name (or "All journals" if `shelf` is `null`); click opens an Obsidian `Menu` listing all shelves + "All journals"; selection mutates `ViewContext.shelf` via the leaf-state setter.
- `period-buttons/` — `PeriodButtonsItem.vue` + `PeriodButtonsItemConfig.vue` (config: `{ week: boolean, month: boolean, quarter: boolean, year: boolean }`). Renders clickable badges for whichever of the four current periods are enabled; each badge self-hides if no journal of that type exists in the active shelf. Active-state highlighting when the currently-open note matches the period note for `refDate`.

`src/views/index.ts` — barrel exporting `defineViewBlock`, `defineToolbarItem`, `ViewBlockProps`, `ToolbarItemProps`, `ViewContext`, `useViewContext`, the registration tokens, the service classes, and `viewsModule`.

`src/main.ts` — adds `container.addModule(viewsModule)` and registers each block/item module.

`src/journals/config.ts` — adds an `intervalBlock` field on the journal schema, schema identical to `navBlock` (`{ rows, decorateWholeBlock }`), defaulted to an empty rows list.

`src/journals/settings/ui/JournalEditSubpage.vue` — gains a section for editing `intervalBlock.rows`, reusing the existing nav-block-row editor component bound to the new field.

`src/settings/migrations.ts` — adds the v2 → v3 migration that produces the seeded Calendar view from the old settings and drops the old keys (see [Migration](#migration)).

`src/_old-code/calendar-view/` — deleted at end of milestone.

### Public API

`defineViewBlock`:

```ts
interface ViewBlockDefinitionInput<TConfig> {
  key: string; // unique among view-blocks
  label: string; // shown in add-block picker
  description?: string;
  icon?: string; // lucide icon name
  schema: BaseSchema<unknown, TConfig, BaseIssue<unknown>>;
  defaultConfig: TConfig;
  component: Component<ViewBlockProps<TConfig>>;
  configComponent?: Component<{ config: TConfig; onChange: (next: TConfig) => void }>;
  cssClass?: string | string[];
}

interface ViewBlockDefinition<TConfig = unknown> extends ViewBlockDefinitionInput<TConfig> {
  /* branded */
}

interface ViewBlockProps<TConfig> {
  instanceId: BlockInstanceId;
  config: TConfig; // reactive
}
```

`defineToolbarItem` — same shape, separate registry, separate token; props are `{ instanceId, config }` only.

`ViewContext` (provided by the view leaf, consumed via `useViewContext()`):

```ts
interface ViewContext {
  readonly viewId: ViewId;
  readonly viewName: Readonly<Ref<string>>;
  readonly refDate: Readonly<Ref<AnchorString>>;
  readonly shelf: Readonly<Ref<ShelfId | null>>;
  setRefDate(date: AnchorString): void;
  setShelf(shelf: ShelfId | null): void;
}
```

`refDate` / `shelf` reactively reflect the leaf's persisted state; setters write through to the leaf state (which Obsidian persists via `getState`/`setState`).

DI tokens (under `src/views/tokens.ts`):

- `ViewBlockDefinitionToken` — multi-binding for `ViewBlockDefinition`.
- `ToolbarItemDefinitionToken` — multi-binding for `ToolbarItemDefinition`.
- `ViewsEventsToken` — emits `viewCreated`, `viewDeleted`, `viewRenamed`, `viewBlocksChanged`, `viewIconChanged`, `viewRibbonChanged` for the host service and the dynamic command registry to consume.

### Button actions

The `button` toolbar item is a single Vue component dispatched over a discriminated-union `action` config. Variants are listed inline in the button's config schema rather than in a separate registry — there are no third-party action sources at MVP, so a token + multi-binding would be premature (`[[feedback_minimal_expressive_apis]]`). When a second action source appears, extract.

```ts
// src/views/toolbar-items/button/config.ts
const buttonActionSchema = v.variant("type", [
  v.object({
    type: v.literal("pick-date"),
    mode: v.picklist(["select-only", "navigate", "create"]),
    levels: v.pipe(v.array(v.picklist(["day", "week", "month", "quarter", "year"])), v.minLength(1)),
  }),
  v.object({
    type: v.literal("current"),
    mode: v.picklist(["select-only", "navigate", "create"]),
    levels: v.pipe(v.array(v.picklist(["day", "week", "month", "quarter", "year"])), v.minLength(1)),
  }),
  v.object({
    type: v.literal("navigate-step"),
    direction: v.picklist(["prev", "next"]),
    unit: v.picklist(["day", "week", "month", "quarter", "year"]),
    amount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
]);

const buttonItemConfigSchema = v.object({
  action: buttonActionSchema,
  icon: v.optional(v.string()),
  label: v.optional(v.string()),
  tooltip: v.optional(v.string()),
});

export type ButtonAction = v.InferOutput<typeof buttonActionSchema>;
```

Dispatch is `ts-pattern.match(action).with({ type: "..." }, handler).exhaustive()` (per `[[feedback_ts_pattern_over_switch]]`).

**Per-action defaults** (overridden by the cosmetic `icon`/`label`/`tooltip` fields on the button config when set):

| Action                                                                  | Default icon     | Default label  | Default tooltip    |
| ----------------------------------------------------------------------- | ---------------- | -------------- | ------------------ |
| `pick-date` (`levels: ["day"]`)                                         | `crosshair`      | —              | "Pick a date"      |
| `pick-date` (`levels.length > 1`)                                       | `crosshair`      | —              | "Open a note"      |
| `current` (`levels: ["day"]`)                                           | —                | "Today"        | "Today"            |
| `current` (`levels: ["week"]`)                                          | —                | "This week"    | "This week"        |
| `current` (`levels: ["month"]`)                                         | —                | "This month"   | "This month"       |
| `current` (`levels: ["quarter"]`)                                       | —                | "This quarter" | "This quarter"     |
| `current` (`levels: ["year"]`)                                          | —                | "This year"    | "This year"        |
| `current` (`levels.length > 1`)                                         | —                | "Current"      | "Jump to current…" |
| `navigate-step` (`direction: "prev"`, `unit: "day"`/`"week"`/`"month"`) | `chevron-left`   | —              | "Previous {unit}"  |
| `navigate-step` (`direction: "prev"`, `unit: "quarter"`/`"year"`)       | `chevrons-left`  | —              | "Previous {unit}"  |
| `navigate-step` (`direction: "next"`, `unit: "day"`/`"week"`/`"month"`) | `chevron-right`  | —              | "Next {unit}"      |
| `navigate-step` (`direction: "next"`, `unit: "quarter"`/`"year"`)       | `chevrons-right` | —              | "Next {unit}"      |

When both `icon` and `label` are empty after defaults (legal only for unusual user configs), the button renders its label text — never a blank affordance.

**Multi-level UX (shared by `pick-date` + `current`).** Single-level (`levels.length === 1`): click fires the action immediately for that level. Multi-level (`levels.length > 1`): click opens an Obsidian `Menu` whose items are the configured levels in array order, labelled as for the `current` single-level table above ("Today", "This week", …) or "Pick day", "Pick week", … for `pick-date`. Selecting a menu item fires the action for that level. No persisted "last selected level" — every open of the menu starts from the top.

**Click semantics by action × level:**

- `pick-date` (level `L`): opens a date-picker modal tuned to `L` — day-grid for `day`, week-strip for `week`, month-grid for `month`, etc. On selection, applies `mode`: `"select-only"` updates `ViewContext.refDate`; `"navigate"` opens the existing journal note for the picked date (no-op if none); `"create"` opens or creates it.
- `current` (level `L`): computes the current note for `L` from "now" (not `refDate`) and applies `mode` identically. v2's "Today" button maps to `{ type: "current", levels: ["day"], mode: <v2 todayMode> }`.
- `navigate-step`: mutates `ViewContext.refDate` by `amount × unit` in `direction`. No mode field; navigation is always pure refDate mutation.

**Picker presets.** The add-toolbar-item modal flattens action variants into top-level entries instead of forcing a "pick block, then pick action" two-step:

| Picker label      | Creates                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Pick date         | `button` with `{ action: { type: "pick-date", mode: "navigate", levels: ["day"] }, … }`               |
| Today             | `button` with `{ action: { type: "current", mode: "create", levels: ["day"] }, … }`                   |
| Navigate previous | `button` with `{ action: { type: "navigate-step", direction: "prev", unit: "month", amount: 1 }, … }` |
| Navigate next     | `button` with `{ action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 }, … }` |
| Shelf selector    | `shelf-selector` instance                                                                             |
| Period buttons    | `period-buttons` with `{ week: false, month: true, quarter: true, year: true }`                       |

Presets live on the toolbar-item definition as an optional `presets?: Array<{ label: string; defaultConfig: TConfig }>` field. Definitions without presets get a single picker entry (using `definition.label`). Definitions with presets contribute one picker entry per preset; the registered key stays singular (`button`). Users edit the created item's config to switch action variant or tweak parameters after creation.

### Schemas

```ts
// view.id is a v4 UUID, structurally branded { __brand: true } per [[feedback_no_unique_symbol_brands]].
const viewIdSchema = v.pipe(
  v.string(),
  v.uuid(),
  v.transform((s) => s as ViewId),
);

const blockInstanceIdSchema = v.pipe(
  v.string(),
  v.uuid(),
  v.transform((s) => s as BlockInstanceId),
);

const viewBlockInstanceSchema = v.object({
  id: blockInstanceIdSchema,
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()), // validated against per-key schema at edit / render time
});

const toolbarItemInstanceSchema = v.object({
  id: blockInstanceIdSchema,
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
});

// `toolbar` block is the only one whose config carries an inner list:
//   block.config = { items: ToolbarItemInstance[] }
// All other blocks: block.config is their key-specific schema's output.
// Validated at the block-registry boundary, not in the top-level view schema.

const viewSchema = v.object({
  id: viewIdSchema,
  name: v.pipe(v.string(), v.minLength(1)),
  icon: v.pipe(v.string(), v.minLength(1)), // lucide name; default "calendar-days"
  defaultShelf: v.nullable(v.string()), // null = all journals
  showInRibbon: v.boolean(),
  blocks: v.array(viewBlockInstanceSchema),
});

export const viewsCollection = defineCollection("views", viewSchema, (id) => ({
  id: id as ViewId,
  name: id,
  icon: "calendar-days",
  defaultShelf: null,
  showInRibbon: false,
  blocks: [],
}));
```

Per-block config validation happens in the repository's update path (`ViewsRepository.updateBlockConfig` runs `v.safeParse` against the block's registered schema) and again at render time inside the block-host wrapper. A failure at either point logs an `InvalidViewBlockConfigError` and the block is **silently skipped** in the rendered view (no error placeholder).

### Obsidian view registration mechanics

Each view gets a viewType `journal-view:<viewId>`. `ViewHostService.register(viewId)`:

1. Calls `plugin.registerView(viewType, leaf => new JournalViewLeaf(leaf, viewId, container))`.
2. Adds command `journal:open-view:<viewId>` with current `view.name` ("Open <name>").
3. If `view.showInRibbon`, adds a ribbon icon with `view.icon` and tooltip = view name; retains the returned `HTMLElement`.
4. Returns a `Disposer` that:
   - `detachLeavesOfType(viewType)` to close any open leaves.
   - Removes the command via `DynamicCommandRegistry`.
   - Removes the ribbon `HTMLElement` (if registered).
   - Marks the registration "stale" in an internal `Set<ViewType>`. The original `registerView` registration cannot be revoked — Obsidian exposes no API — so future opens of that viewType land in a stale factory whose `JournalViewLeaf` constructor finds no config and renders an empty leaf (logging).

Rename triggers a command + ribbon re-sync (id stable, label changes); no `registerView` re-call. Icon change re-syncs the ribbon. `showInRibbon` toggle adds/removes the ribbon entry.

`ViewHostService.registerAll()` is invoked from `module.ts`'s autoLoad hook: at boot, it iterates `ViewsRepository.list()` and registers each view. New views created at runtime are registered via the `viewCreated` event listener.

Legacy `CALENDAR_VIEW_TYPE` adapter is registered unconditionally at boot in `viewsModule`. Its `onOpen` immediately:

1. Resolves the seeded Calendar view id (looked up from settings — the migration stores it on a dedicated `defaultCalendarViewId` slice key for future lookup).
2. Calls `leaf.setViewState({ type: "journal-view:<defaultCalendarViewId>", state: {} })`, which Obsidian persists into `workspace.json` going forward.

If the seeded view has been deleted by the user, the adapter renders a tiny "Calendar view was deleted" placeholder with a "create new" button (links to the views dashboard).

### Leaf state

`JournalViewLeaf.getState() / setState()` schema:

```ts
interface JournalViewLeafState {
  refDate?: AnchorString; // omitted -> today on next open
  shelf?: ShelfId | null; // omitted -> view.defaultShelf
  perBlock?: Record<BlockInstanceId, unknown>; // reserved for future blocks; unused at MVP
}
```

The leaf builds the `ViewContext` with reactive refs derived from the leaf-state object and exposes setters that mutate the same object and call `this.app.workspace.requestSaveLayout()` so Obsidian persists. `refDate` defaults reactively to today; `shelf` defaults reactively to `view.defaultShelf`.

### Mid-life reactivity

The view leaf mounts one Vue app on `this.contentEl`. Inside:

- A root component reads `useService(ViewsRepository).get(viewId)` reactively.
- v-for over `view.blocks` keyed by `block.id` — adding/removing/reordering blocks Just Works without manual mount/unmount.
- Each block row resolves `block.key` against `useService(ViewBlockRegistry)`; on miss → log + render nothing.
- Each block row passes `config = view.blocks[i].config` (reactive proxy slice) into the block component; the block re-renders on config edit.
- The toolbar block does the same for its inner `items`.
- `provideViewContext(ctx)` is called at the root component so every descendant can `useViewContext()`.

### Settings UI

Per `[[feedback_feature_directory_schema]]`:

- `ViewsDashboardBlock.vue` — block on the settings dashboard listing all views (icon, name, default shelf, "Edit" button, "..." menu with rename/clone/delete). Plus "New view" button → opens `ViewNameModal`, creates with default fields, navigates to its edit subpage.
- `ViewEditSubpage.vue` — fields: name (rename), icon (icon-suggest), defaultShelf (shelf picker, "All journals" option), showInRibbon (toggle); section "Blocks" rendering `<BlocksList :viewId>`. All form rows wrap `UiSettingRow` with field errors in the `#description` slot (`[[feedback_form_errors_in_description_slot]]`).
- `BlocksList.vue` — each block row: drag handle, block icon + label (or "Unknown: X" if missing), gear (expand inline config), remove (with confirmation only if the block has non-default config). For `toolbar` block rows, an additional `<ToolbarItemsList :blockId>` renders below for the inner items. "Add block" button at the bottom → `AddBlockPickerModal` (groups blocks by category if categories appear; flat list at MVP). Drag-reorder via the same library / pattern the codebase already uses (HTML5 native drag with a small helper composable — to check at implementation time; no new dependency).
- `ToolbarItemsList.vue` — same shape as `BlocksList`, scoped to `ToolbarItemDefinition[]` instead of `ViewBlockDefinition[]`. "Add item" button → `AddToolbarItemPickerModal`.
- `AddToolbarItemPickerModal` is **action-flattened**: it iterates each definition's `presets?` array and renders one row per preset; definitions with no `presets` field contribute a single row using `definition.label`. The user sees ~6 entries ("Pick date", "Today", "Navigate previous", "Navigate next", "Shelf selector", "Period buttons") instead of being forced through a two-step "pick item type, then pick action" flow. Selecting an entry calls `service.addToolbarItem(viewId, blockId, key, presetDefaultConfig)`. Users edit the created item's config to switch variants or tweak parameters.
- `ViewNameModal`, `DeleteViewModal`, `AddBlockPickerModal`, `AddToolbarItemPickerModal` — all in `src/views/ui/modals.ts` per `[[feedback_modals_consolidation]]`, using the curried `defineModal` API.

### Default Calendar view

Seeded by migration for upgraders and by the collection's seed-on-empty path for new installs. ID is a fixed UUID literal stored as a settings slice value `defaultCalendarViewId` (so the legacy adapter and tests can look it up).

```jsonc
{
  "id": "<DEFAULT_CALENDAR_VIEW_ID>",
  "name": "Calendar",
  "icon": "calendar-days",
  "defaultShelf": null,
  "showInRibbon": true,
  "blocks": [
    {
      "id": "...",
      "key": "toolbar",
      "config": {
        "items": [
          { "id": "...", "key": "shelf-selector", "config": {} },
          {
            "id": "...",
            "key": "button",
            "config": { "action": { "type": "pick-date", "mode": "navigate", "levels": ["day"] } },
          },
          {
            "id": "...",
            "key": "button",
            "config": { "action": { "type": "current", "mode": "create", "levels": ["day"] } },
          },
          {
            "id": "...",
            "key": "button",
            "config": { "action": { "type": "navigate-step", "direction": "prev", "unit": "year", "amount": 1 } },
          },
          {
            "id": "...",
            "key": "button",
            "config": { "action": { "type": "navigate-step", "direction": "prev", "unit": "month", "amount": 1 } },
          },
          {
            "id": "...",
            "key": "period-buttons",
            "config": { "week": false, "month": true, "quarter": true, "year": true },
          },
          {
            "id": "...",
            "key": "button",
            "config": { "action": { "type": "navigate-step", "direction": "next", "unit": "month", "amount": 1 } },
          },
          {
            "id": "...",
            "key": "button",
            "config": { "action": { "type": "navigate-step", "direction": "next", "unit": "year", "amount": 1 } },
          },
        ],
      },
    },
    { "id": "...", "key": "month-calendar", "config": { "before": 0, "after": 0, "hideWeekends": false } },
    { "id": "...", "key": "divider", "config": {} },
    { "id": "...", "key": "custom-intervals", "config": { "window": "current-month", "hideEmpty": true } },
  ],
}
```

The seed reproduces v2 exactly: shelf selector + date picker + today + the four chevrons flanking the month/quarter/year badges, then the month grid, separator, and per-custom-journal interval rows.

For new installs (no v2 settings to read), `pick-date.mode` seeds to `"navigate"` and `current.mode` seeds to `"create"` — these were v2's defaults.

### Migration

Migration `vN → vN+1` (where `N` is the current settings version at the time this lands):

1. Read v2 keys: `uiSettings.calendarShelf`, `calendarViewSettings.todayMode`, `calendarViewSettings.pickMode`. Per-journal `calendarViewBlock.rows` / `decorateWholeBlock` move to the new `intervalBlock` field on each journal.
2. Build the default Calendar view from the seed above with these substitutions:
   - `defaultShelf = calendarShelf ?? null`.
   - The `pick-date` button's `action.mode = pickMode` (v2 vocabulary maps 1:1 — `"select-only" | "navigate" | "create"`); `levels` is always `["day"]` post-migration since v2 only had a day-level picker.
   - The `current` button's `action.mode = todayMode`; `levels` is always `["day"]` post-migration.
3. Insert the new view into the `views` collection under a fresh fixed UUID and store that UUID on the `defaultCalendarViewId` slice key.
4. For each journal in the journals collection: copy `calendarViewBlock` into the new `intervalBlock` field; delete `calendarViewBlock`.
5. Delete the v2 keys: `uiSettings.calendarShelf`, the entire `calendarViewSettings` slice.

No v2 keys map to `hideWeekends`, `before/after`, the `navigate-step` chevron amounts, or `period-buttons.week` — these are net-new extensions, seeded with conservative defaults (`hideWeekends: false`, `before/after: 0`, `amount: 1`, `period-buttons.week: false`) so the migrated view is visually identical to v2.

`calendarViewSettings.activeStyle` is kept as a global slice (renamed to e.g. `viewsActiveStyle`), not moved into per-view config.

The migration runs once via the existing settings-migrations ledger. The legacy `CALENDAR_VIEW_TYPE` adapter is registered independent of migration state so existing `workspace.json` references resolve.

### Per-shelf interaction

The shelves service emits a `shelfDeleted` event the views service listens for. On receipt: for every view whose `defaultShelf` equals the deleted name, set `defaultShelf = null` and log. Open leaves whose current `shelf` state equals the deleted name fall back to `null` reactively (the view-context derivation falls back when the configured shelf is no longer in `ShelvesRepository`).

### Unknown / invalid block handling

At render time and at config-save time, blocks whose `key` is unknown or whose `config` fails schema validation are **silently skipped** in the rendered view; an `UnknownViewBlockKeyError` or `InvalidViewBlockConfigError` is logged via the project logger. The settings edit UI shows such block rows as "Unknown: `<key>`" with a remove button so users can clean up; the running view shows nothing.

Rationale: the only ways unknown/invalid blocks reach the runtime are schema evolution between versions or hand-edited settings; both are uncommon enough that a loud UI placeholder would be noise. Logs are the audit trail.

## Testing

- `view-context.test.ts` — `provideViewContext` exposes reactive `refDate`/`shelf`; setters update both; `useViewContext` outside a provider throws.
- `view-host.test.ts` — `register` calls `plugin.registerView` once, adds command, conditionally adds ribbon; `dispose` detaches leaves and removes command + ribbon; rename re-syncs command label without re-registering view type.
- `view-leaf.test.ts` — leaf state defaults: missing `refDate` → today; missing `shelf` → `view.defaultShelf`; setters persist via mock `requestSaveLayout`.
- `service.test.ts` — CRUD operations emit the right events; reorder preserves block-instance ids; `addBlock` generates a UUID and applies `defaultConfig` from the registered definition; `updateBlockConfig` validates and rejects bad configs.
- `repository.test.ts` — collection read/write; unknown view returns `None`; per-block schema validation surfaces error variants for callers.
- Block / toolbar-item tests — each block is a normal Vue component tested with `@testing-library/vue` + the context stub provider (`[[feedback_testing_library_for_components]]`).
- `button` action dispatch — one test per action variant × `mode` × `levels.length` boundary (single vs multi). Multi-level: clicking opens the level menu; selecting an item fires the action for that level. `navigate-step.amount > 1` advances the right multiple.
- `custom-intervals` window resolution — each `WindowKind` resolves against `refDate` correctly; `"current-week"` honors `moment.localeData().firstDayOfWeek()` (covers `[[project_v2_week_anchor_bug]]`).
- `period-buttons` self-hide — a badge for a period type whose shelf has no journal of that type is not rendered (per period).
- Migration test — given a v2 settings dump, asserts the seeded view shape (including the 8 toolbar items + 4 blocks), the `intervalBlock` per-journal copy, the `pickMode`/`todayMode` → button-action-mode mapping, and the deleted-key set.
- Legacy adapter test — opening the adapter view triggers `setViewState` with the seeded view's id.

No tests for: barrel shapes, DI wiring, the registries themselves (`[[feedback_no_wiring_tests]]`), or framework reactivity guarantees (`[[feedback_no_trivial_tests]]`).
