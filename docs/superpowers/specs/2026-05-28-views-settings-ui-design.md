# views settings UI — design (slice addendum)

Addendum to `2026-05-28-v3-journal-views-design.md`. Defines a single slice that lands the settings-UI scaffold around the already-built views CRUD framework. The framework files (`config.ts`, `repository.ts`, `service.ts`, `view-host.ts`, `view-leaf.ts`, `view-context.ts`) are in place; this slice only adds the settings surface that drives them.

## Goal

Let users see, create, rename, clone, delete views from the settings dashboard, and edit the view-level fields (name, icon, default shelf, ribbon toggle) and block list (add / remove / reorder via up/down buttons) from a dedicated subpage. No toolbar items, no inline per-block config UI, no migration — those are out of scope.

## Scope

In scope:

- New `src/views/view-model.ts` (`ViewsViewModel`) mirroring `ShelvesViewModel`.
- New `src/views/flows/`: `EditViewNameFlow`, `DeleteViewFlow`, `AddBlockToViewFlow`.
- New `src/views/ui/`:
  - `modals.ts` — `viewNameModal`, `deleteViewModal`, `addBlockPickerModal` (curried `defineModal`).
  - `ViewNameModal.vue` (+ test).
  - `DeleteViewModal.vue` (+ test).
  - `AddBlockPickerModal.vue` (+ test).
  - `ViewsDashboardBlock.vue` (+ test).
  - `ViewEditSubpage.vue` (+ test).
  - `BlocksList.vue` (+ test).
  - `view-edit-subpage.ts` — `defineSubpage<{ viewId: ViewId }>`.
- `src/views/module.ts` wires `ViewsViewModel`, the three flows, the dashboard block, and the subpage.
- `src/views/index.ts` exports `ViewsViewModel` and `viewEditSubpage`.
- New `view_*` i18n message keys.

Out of scope (deferred):

- `ToolbarItemsList.vue` and `ToolbarItemDefinitionToken` — no toolbar block exists yet.
- Inline gear → `configComponent` rendering — no blocks are registered yet, nothing to render.
- HTML5 drag-reorder — replaced with up/down buttons (already exposed by `ViewsService.moveBlockUp` / `moveBlockDown`).
- v2 → v3 migration, seeded Calendar view, legacy `CALENDAR_VIEW_TYPE` adapter.

## Architecture

### `ViewsViewModel`

Mirrors `ShelvesViewModel`:

```ts
class ViewsViewModel {
  readonly views: ComputedRef<View[]>; // sorted by name
  readonly viewCount: ComputedRef<number>;
  constructor(repository: ViewsRepository = inject(ViewsRepository));
  static fromRepository(repository: ViewsRepository): ViewsViewModel;
  getView(id: ViewId): Option<View>;
}
```

Lives at `src/views/view-model.ts` next to `repository.ts`. Component code reads `viewsVM.views.value` / `viewsVM.getView(id)`; mutations go through `ViewsService` (write side) or, for in-form field edits, directly through `ViewsService.update`. No name-uniqueness check — view names are not unique.

### Flows

All three flows follow the shelves pattern (`attempt.in`, `ModalService.open(...).mapErr(() => new UserAborted(...))`, propagate service errors via `mapErr(toFlowError)`):

- `EditViewNameFlow` — input `{ viewId?: ViewId }`; opens `viewNameModal`; on submit calls `ViewsService.create({ name })` (when `viewId` is absent) or `ViewsService.update(viewId, { name })`; returns `{ viewId }`.
- `DeleteViewFlow` — input `{ viewId: ViewId }`; opens `deleteViewModal` (confirm only); on submit calls `ViewsService.delete(viewId)`.
- `AddBlockToViewFlow` — input `{ viewId: ViewId }`; opens `addBlockPickerModal` with the list of registered `ViewBlockDefinition`s read from `ViewBlockDefinitionToken`; on submit calls `ViewsService.addBlock(viewId, key)`.

### Modals (`ui/modals.ts`)

```ts
export const viewNameModal = defineModal<string>()({
  component: ViewNameModal,
  title: ({ currentName }: { currentName?: string }) =>
    currentName === undefined ? m.view_add_modal_title() : m.view_rename_modal_title(),
});

export const deleteViewModal = defineModal<void>()({
  component: DeleteViewModal,
  title: ({ viewName }: { viewName: string }) => m.view_delete_modal_title({ name: viewName }),
});

export const addBlockPickerModal = defineModal<string>()({
  component: AddBlockPickerModal,
  title: (_: { definitions: ViewBlockDefinition[] }) => m.view_add_block_modal_title(),
});
```

- `ViewNameModal` — vee-validate form: non-empty + (when renaming) "different from current". Field errors render in `UiSettingRow #description`.
- `DeleteViewModal` — confirm-only; cancel button + warning CTA "Delete".
- `AddBlockPickerModal` — list of registered blocks (icon + label + optional description); on click submits the `key`. Empty-state row when `definitions.length === 0`.

### `ViewsDashboardBlock.vue`

Collapsible block, header "Views" with count flair, "+" control opens `EditViewNameFlow({})` then `ui.push(viewEditSubpage, { viewId })`. Each row: icon + name + per-row icon-buttons `library` (open) / `copy` (clone via `ViewsService.clone`) / `trash-2` (`DeleteViewFlow`). Empty state row when no views.

### `ViewEditSubpage.vue`

Props: `{ viewId: ViewId; nav: SubpageNav }`.

Reactive `view = computed(() => viewsVM.getView(viewId).getOr(undefined as never))`; `watchEffect(() => { if (!view.value) nav.back(); })`.

Fields, each in a `UiSettingRow`:

- Name (heading row with rename pencil → `EditViewNameFlow({ viewId })`).
- Icon (`UiIconSuggest` bound to `view.icon`; `@update:model-value` triggers `viewsService.update(viewId, { icon: next })`).
- Default shelf (`UiDropdown` over `["", ...shelvesVM.shelfOptions]` — empty value = "All journals"; binds via service).
- Show in ribbon (`UiToggle` → `viewsService.update(viewId, { showInRibbon: next })`).

Then a `UiCollapsibleBlock` "Blocks" containing `<BlocksList :viewId>`.

### `BlocksList.vue`

Props: `{ viewId: ViewId }`. Reads `view.blocks` reactively via `viewsVM.getView(viewId)`. Each block row, in a `UiSettingRow`:

- Definition lookup via `viewsService.getBlockDefinition(block.key)`:
  - **known**: icon + label.
  - **unknown**: "Unknown: `<key>`" (no icon).
- Controls: `chevron-up` (calls `viewsService.moveBlockUp`; disabled on first row), `chevron-down` (`moveBlockDown`; disabled on last row), `trash-2` (`viewsService.removeBlock`).

"Add block" button at the bottom → `AddBlockToViewFlow({ viewId })`. Empty state row above the button when `view.blocks` is empty.

### Module wiring

`src/views/module.ts` adds:

```ts
c.register(ViewsViewModel).useClass(ViewsViewModel).eager();
c.register(EditViewNameFlow).useClass(EditViewNameFlow);
c.register(DeleteViewFlow).useClass(DeleteViewFlow);
c.register(AddBlockToViewFlow).useClass(AddBlockToViewFlow);
c.register(DashboardBlockToken).useValue(
  defineDashboardBlock({ key: "views", component: ViewsDashboardBlock, order: 6 }),
);
c.register(SubpageToken).useValue(viewEditSubpage);
```

(Order `6` follows shelves=4, journals=5; subject to fit when wiring.)

`src/views/index.ts` adds `ViewsViewModel` and `viewEditSubpage` exports. No test helpers in the main barrel (`[[feedback_barrel_files]]`).

## Testing

Component tests use `@testing-library/vue` + user-event (`[[feedback_testing_library_for_components]]`), one behavior per test (`[[feedback_one_behavior_per_test]]`), black-box assertions (`[[feedback_black_box_assertions]]`).

- `view-model.test.ts` — `views` is sorted by name reactively; `getView` returns `None` for missing id.
- `EditViewNameFlow.test.ts` — submit path creates a new view (no `viewId`) / renames an existing one (`viewId` provided); cancel returns `UserAborted`.
- `DeleteViewFlow.test.ts` — submit deletes; cancel returns `UserAborted`.
- `AddBlockToViewFlow.test.ts` — submit calls `service.addBlock` with the chosen key; cancel returns `UserAborted`.
- `ViewNameModal.test.ts` — empty name shows the required-error message in the `#description` slot; submitting a valid name calls `api.submit`.
- `DeleteViewModal.test.ts` — clicking Delete submits; Cancel cancels.
- `AddBlockPickerModal.test.ts` — clicking a row submits the corresponding key; empty registry shows the empty-state copy.
- `ViewsDashboardBlock.test.ts` — lists views from the view-model; "+" invokes the create flow then pushes the subpage; per-row controls invoke clone / delete / open.
- `ViewEditSubpage.test.ts` — when the view disappears the subpage calls `nav.back()`; editing each field calls `viewsService.update` with the right patch.
- `BlocksList.test.ts` — known-key row renders the definition's label; unknown-key row renders "Unknown: `<key>`"; up disabled on first row, down on last; remove calls `removeBlock`; "Add block" invokes the flow.

No tests for: module wiring or barrel shapes (`[[feedback_no_wiring_tests]]`); framework reactivity (`[[feedback_no_trivial_tests]]`); the modal title functions in isolation (covered by the modal tests).

## Open questions

None — scope and behavior aligned with the user before writing this addendum.
