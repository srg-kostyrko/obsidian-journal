# View editor visual redesign

## Problem

The journal-view editor (`BlocksList.vue` + `ToolbarItemsList.vue`) renders every
block and every toolbar item as an identical full-width row labelled only by its
type. A toolbar with several buttons becomes a wall of rows all reading
"Button", with no indication of what each one does, and the nested toolbar items
sit at the same visual weight as the top-level blocks, so the block/item
hierarchy is invisible. Reordering is done with per-row up/down arrows.

This is hard to scan and edit. The navigation-block settings editor
(`NavBlockRowsEditor.vue`) already demonstrates a better idea: render a live
preview of each row. We want that treatment for the view editor, adapted to its
two-level structure (blocks, with the toolbar block containing items).

## Goals

- Each top-level block is a frame showing its icon, name, and a short
  plain-language summary of its configuration.
- The toolbar block expands into a **horizontal strip** of its items, where each
  item is the **actual rendered component** (true WYSIWYG), wrapped in a uniform
  interactive frame.
- Reordering is done by **drag-and-drop** (grip handle), for both the block list
  and the toolbar strip.
- Editing, adding, and deleting reuse the existing modals, picker flows, and
  services unchanged in behavior.

## Non-goals

- No change to the underlying data model (`View.blocks`, toolbar
  `config.items`), persistence, or the runtime view (`view-leaf.ts`).
- No change to what configuration each block/item supports.
- No keyboard-driven reordering (the rest of the plugin has none; SortableJS
  covers mouse + touch). The up/down move APIs are removed, not retained.

## Chosen approach (Direction A3)

Render the real toolbar-item components inside a uniform, selectable frame. The
items already have render components (`ButtonItem`, `PeriodButtonsItem`,
`ShelfSelectorItem`, `DefinedNavigationItem`) that the runtime view mounts via
`view-leaf.ts`. The only thing those components need is a `ViewContext`
(`provideViewContext`) supplying `viewId`, `refDate`, `shelf`, and setters. In
the editor we provide a **preview context**: `refDate = today`, `shelf =
view.defaultShelf`, no-op setters — the same shape `view-leaf.ts` builds, and the
same shape `provideViewContextStub` uses in tests. Pointer events are disabled on
the rendered preview so a click can never navigate or open a menu; all
interaction happens on the surrounding frame chrome.

Blocks themselves are **not** rendered live (a month-grid preview per row is too
tall); they stay as summarised frames.

## Components

Directory: `src/views/ui/` (existing feature UI location).

### Preview context — `preview-view-context.ts` (new)

A composable `provideViewPreviewContext(viewId: Ref<ViewId> | ViewId): void`
that builds a `ViewContext` with:

- `viewName` / `shelf` read from the view via `ViewsViewModel`
  (`shelf = view.defaultShelf ?? null`),
- `refDate` = `Clock.now().format("YYYY-MM-DD")` (as in `NavBlockRowsEditor`),
- `setRefDate` / `setShelf` as no-ops,

and calls `provideViewContext(...)`. This is production code, so it does **not**
live in `testing.ts`; the test stub stays separate.

### `BlocksList.vue` (rewritten)

- Calls `provideViewPreviewContext(viewId)` once at the top so every nested
  preview resolves a context.
- Renders a vertical **sortable** list of `BlockFrame` (one per block). The
  toolbar block additionally renders `ToolbarStrip` beneath its frame header.
- Sortable list via `useSortable` bound to a local `ref` mirroring the store;
  on reorder-end, persist the new id order through `ViewsService.setBlockOrder`.
- Keeps the existing empty-state row and the bottom "Add block" CTA
  (`AddBlockToViewFlow`).

### `BlockFrame.vue` (new)

Presentational frame for one block: drag grip (`icons.action.dragHandle`),
block icon + label, optional summary text, and hover-revealed edit/delete
buttons. Edit is shown only when `definition.configComponent` exists and opens
`editBlockModal` exactly as today. For the toolbar block the frame header shows
an item count and omits the edit button (it has no `configComponent`).

### `ToolbarStrip.vue` (new, replaces `ToolbarItemsList.vue`)

- Horizontal **sortable** strip of `ToolbarItemFrame`, plus a trailing inline
  "add item" affordance invoking `AddToolbarItemToBlockFlow`.
- Reorder-end persists via `ViewsService.setToolbarItemOrder`.
- Empty state when the toolbar has no items.

### `ToolbarItemFrame.vue` (new)

Wraps `<component :is="definition.component" :instance-id :config>` (the real
item) in a `pointer-events: none` container, surrounded by a frame with a drag
grip and hover-revealed edit/delete. Edit opens `editToolbarItemModal` as today.
If the item key is unknown (no definition) it falls back to a labelled chip, as
the current list does.

`ToolbarItemsList.vue` is deleted.

## Service changes

Reordering by drag yields a full new ordering, so the persistence contract is
"set this order" rather than "move one step".

- `ViewsService.setBlockOrder(id, orderedIds: BlockInstanceId[]): AsyncResult<void, UnknownViewError>`
  — reorders `view.blocks` to match `orderedIds`. Guards: the argument must be a
  permutation of the current block ids; on mismatch it no-ops and logs (same
  defensive posture as today's `#move`). The shared `#move` helper folds into
  this method.
- `ViewsService.setToolbarItemOrder(id, blockId, orderedIds): AsyncResult<void, UnknownViewError>`
  — delegates to a new `ToolbarItemsService.reorder(view, blockId, orderedIds)`
  built on the existing `#withItems` helper, then persists via `#persistBlocks`.

The step-wise move methods become dead once the new UI lands, so they are
removed: `ViewsService.moveBlockUp/Down` and `moveToolbarItemUp/Down`, the
private `#move` / `#moveToolbarItem` helpers, `ToolbarItemsService.moveItem`, and
their unit tests. (No other caller exists — they are only used by the lists this
redesign replaces.)

## Definition change — block summaries

Add an optional `summary?(config): string` to `ViewBlockDefinition`
(`define-view-block.ts`). Each block that benefits implements it; the summary is
domain logic, so it lives with the block definition:

- **month-calendar / week-calendar** — week-number position and any
  before/after padding (e.g. "weeks left"); hidden weekdays summarised via
  `moment.localeData()` short names (never duplicated as paraglide messages).
- **markdown-template** — the template path, or an "no template chosen" message.
- **custom-intervals** — the window kind and journal count.
- **divider / toolbar** — no summary (toolbar shows its own item count in the
  strip header).

Toolbar **items** need no summary function — they render their real component.

## Drag-and-drop infrastructure

- Add dependencies: `@vueuse/integrations` and `sortablejs` (runtime),
  `@types/sortablejs` (dev). `@vueuse/core@14` is already present.
- A small composable `useSortableList(elRef, itemsRef, onReorder)` wraps
  `useSortable` with the project's options (handle = grip element, `animation`)
  and calls `onReorder(orderedIds)` on `end`. Shared by `BlocksList` and
  `ToolbarStrip`.
- Add `icons.action.dragHandle = "grip-vertical"` to the central icon map
  (authored icons reference `icons.*`, never bare literals).

## Data flow

1. View store → `ViewsViewModel` → local `ref` of blocks/items (the sortable
   binding target), kept in sync via `watch`.
2. User drags → SortableJS mutates the local `ref` and fires `end` → composable
   reads the new id order → `ViewsService.set*Order` persists → store emits →
   view-model recomputes → local `ref` re-syncs (idempotent).
3. Edit/add/delete unchanged: existing modals, flows, and service methods.

## Error handling

- `set*Order` with a non-permutation input: no-op + warn (mirrors existing move
  guards); the UI re-syncs from the store so the visual order self-corrects.
- Unknown block/item key in a preview: `BlockFrame`/`ToolbarItemFrame` fall back
  to the labelled-chip rendering already used by today's lists; the runtime view
  already logs these.
- Preview rendering must be side-effect-free in settings: pointer-events are off,
  and the preview context's setters are no-ops, so no navigation/persistence can
  be triggered from a preview.

## Testing

Unit (vitest):

- `ViewsService.setBlockOrder` and `setToolbarItemOrder`: reorder to a given
  permutation; no-op on non-permutation; unknown-view error. One behavior per
  test.
- `ToolbarItemsService.reorder`: reorders within the target block; no-op when
  block/permutation invalid.
- Block `summary(config)` functions: one test per block per meaningful variant.

Component (`@testing-library/vue` + `user-event`):

- `ToolbarStrip` renders each item's real component preview (assert observable
  rendered content, e.g. a button's label/icon).
- Clicking a frame's edit opens the config modal and persists the result via the
  service.
- Clicking delete removes the item; inline "add" invokes the add flow.
- `BlockFrame` shows the configured summary; edit hidden when no
  `configComponent`.

Not tested (per project conventions): the drag interaction itself — SortableJS
is a library, and simulating HTML5 drag in jsdom would test the library, not our
code. Our contribution (new order → persisted order) is covered at the service
level. Do not add a DnD-simulation component test.

e2e (wdio, runtime-touching): open a view in the editor, confirm the toolbar
strip shows live item previews and that editing an item via the frame persists.
Drag-reorder e2e is **optional** and, if added, must be isolated — drag in wdio
is the most flake-prone surface (see e2e gotchas memories); the service-level
unit tests are the primary guard for reorder correctness.

## Files

New:

- `src/views/ui/preview-view-context.ts`
- `src/views/ui/BlockFrame.vue`
- `src/views/ui/ToolbarStrip.vue`
- `src/views/ui/ToolbarItemFrame.vue`
- `src/views/ui/use-sortable-list.ts`

Changed:

- `src/views/ui/BlocksList.vue` (rewrite to sortable + frames)
- `src/views/service.ts` (add `setBlockOrder` / `setToolbarItemOrder`; remove
  `moveBlockUp/Down`, `moveToolbarItemUp/Down`, `#move`, `#moveToolbarItem`)
- `src/views/service.test.ts` (drop move-method tests; add set-order tests)
- `src/views/blocks/toolbar/toolbar-items-service.ts` (add `reorder`; remove
  `moveItem`)
- `src/views/blocks/toolbar/toolbar-items-service.test.ts` (drop `moveItem`
  tests; add `reorder` tests)
- `src/views/define-view-block.ts` (optional `summary`)
- each block definition that gains a summary
- `src/ui/icons.ts` (`action.dragHandle`)
- `package.json` (deps)
- i18n message catalog (empty states, inline add, block summaries)

Deleted:

- `src/views/ui/ToolbarItemsList.vue`

## Risks / open questions

- **Preview side effects.** Rendering real item components in the settings app
  must be inert. Mitigation: pointer-events off + no-op context setters; verify
  no component does work on mount that touches the vault. To confirm during
  implementation.
- **Sortable + reactive store.** `useSortable` mutates a local ref; the store is
  the source of truth. The local-ref-mirror + re-sync pattern above avoids a
  split brain; needs care so a persist round-trip doesn't fight an in-flight
  drag.
- **New dependencies.** `sortablejs` + `@vueuse/integrations` are the agreed
  cost of real drag-and-drop (the zero-dep `useDraggable` route was rejected as
  too much hand-rolled geometry).
