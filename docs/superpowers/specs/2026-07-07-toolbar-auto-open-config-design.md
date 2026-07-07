# Auto-open config modal after adding a toolbar item

## Summary

When a user adds a toolbar item that has a configuration modal, open that modal
immediately after the item is added, so the user can configure it in one motion
instead of having to add it and then find and click its edit button.

Items without a configuration modal (spacer, shelf-selector) are added exactly
as they are today, with no modal.

## Behavior

Delta scenarios, in domain terms:

- **Adding a configurable item opens its configuration modal.** After the user
  picks a configurable item from the toolbar-item picker, the item is added to
  the toolbar block and its configuration modal opens straight away, seeded with
  the config the item was just added with.
- **Submitting the configuration applies it.** If the user submits the modal,
  the item's configuration is updated to the submitted values.
- **Cancelling keeps the item with its defaults.** If the user cancels or closes
  the configuration modal, the item remains in the toolbar with its default (or
  preset) configuration, and no error is surfaced. Cancelling here means "added,
  not customized" — it is **not** an aborted add. (Contrast with cancelling the
  _picker_ modal, which aborts the add.)
- **Presets still open the modal.** When the picked item carries a preset
  configuration, the configuration modal still opens (seeded with the preset),
  so the user can tweak it immediately.
- **Non-configurable items open nothing.** Adding a spacer or shelf-selector
  adds the item and opens no modal.

## Design

All new logic lives in `AddToolbarItemToBlockFlow.execute`
(`src/views/flows/add-toolbar-item-to-block.flow.ts`). This flow already owns the
pick→add orchestration, already injects the toolbar-item definition list
(`ToolbarItemDefinitionToken`) and `ModalService`, and calls
`ViewsService.addToolbarItem`, which already returns the new item's
`BlockInstanceId | null` — a value the flow currently discards.

No changes to `ToolbarStrip.vue`; its existing `edit(row)` path is reused
conceptually but not called from here — the flow opens the same
`editToolbarItemModal` directly. The picker modal, service methods, and schemas
are unchanged.

### Flow steps (after the existing pick + add)

1. Capture `itemId` from `addToolbarItem(...)`. If it is `null` (target block not
   found — same condition as today), return `void`.
2. Look up the chosen definition in the injected definition list by
   `choice.key`.
3. If the definition has no `configComponent`, return `void` (item added, done).
4. Otherwise open `editToolbarItemModal` with:
   - `component`: the definition's `configComponent`
   - `config`: `choice.defaultConfig ?? definition.defaultConfig` — the same
     expression `ToolbarItemsService.addItem` uses to persist the new item, so
     the modal shows exactly what was stored
   - `typeLabel`: `definition.summary?.(config) ?? definition.label`
5. **On submit** → `ViewsService.updateToolbarItemConfig(viewId, blockId, itemId, next)`,
   mapping errors with `toFlowError`.
6. **On cancel/close** → swallow the modal-dismissal error and resolve `void`.
   Do **not** map it to `UserAborted` and do not propagate it as a flow error.

### Config-seed correctness

`ToolbarItemsService.addItem` stores `defaultConfig ?? definition.defaultConfig`
(`src/views/blocks/toolbar/toolbar-items-service.ts`). Seeding the modal with the
same expression guarantees the modal reflects the persisted config, whether the
user picked a base item or a preset.

## Testing

### Unit — the flow

Test `AddToolbarItemToBlockFlow` with fake `ModalService` and `ViewsService`
(inject errors via `vi.spyOn`, no baked-in error simulation), one behavior per
test:

- Picking a non-configurable item opens no configuration modal after the add.
- Submitting the configuration modal updates the item's config with the
  submitted values.
- Cancelling the configuration modal leaves the item unchanged, updates no
  config, and surfaces no error.

The picker-cancel-aborts-add behavior is unchanged and already covered; no new
test needed for it beyond confirming it still holds if convenient.

### e2e — existing tests must be updated

`e2e/journeys/settings.e2e.ts` already adds **configurable** items and must be
updated, because the new modal will now auto-open mid-test:

- "adds a toolbar item to the default calendar view's toolbar block" (~line 195)
  adds **Period buttons** (has a config component) — the config modal will now
  open. The test must submit or close it before asserting persistence.
- "edits a toolbar button's behavior and persists the new mode" (~line 212) adds
  **Pick date** (a button, has a config component) — the config modal will now
  open on add. Reconcile this with the test's subsequent explicit edit step so
  the two do not fight; likely the add-time modal is dismissed and the existing
  edit step drives the mode change as before.

Mind the known e2e modal-pollution hazard: a modal left open by one test steals
the next test's modals — every path that triggers auto-open must close its modal
before the test ends.

One new e2e is worth adding: adding a configurable item auto-opens its config
modal (assert the edit-config modal appears immediately after the picker choice),
then close it. Reuse the existing add-item journey scaffolding.

## Out of scope

- No change to the picker modal, its preset expansion, or the edit button on
  existing items.
- No change to `ToolbarStrip.vue` or `ToolbarItemFrame.vue`.
- No new configuration components; only the wiring of when the existing
  `editToolbarItemModal` opens.
