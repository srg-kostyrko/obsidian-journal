# Reposition open views on open-mode change

## Problem

Each journal view has an **open mode** — the place it opens: the left sidebar, the
right sidebar, or a new tab. A user changes it from the view editor.

Today, changing the open mode of a view that is **already open** does nothing
visible. The new mode is saved, but the open view stays exactly where it is —
and it never relocates, not even the next time the open command runs (the host
reveals the existing view in place rather than reopening it at the new mode). The
only way to make the change take effect is to close the view by hand and reopen
it. The setting appears to silently fail.

## Goal

When a user changes a view's open mode while that view is open, offer to move the
open view to the new mode right away. The choice to move is confirmed, not
automatic. The setting itself always saves regardless of the answer.

## Behavior

### Scenario: changing open mode with the view open

- **Given** a view is open
- **When** the user changes its open mode to a different value
- **Then** the new open mode is saved
- **And** a confirmation asks whether to move the open view to the new mode

### Scenario: confirming the move

- **Given** the confirmation from changing an open view's open mode is showing
- **When** the user confirms
- **Then** every open instance of that view relocates to the new open mode

### Scenario: declining the move

- **Given** the confirmation from changing an open view's open mode is showing
- **When** the user declines
- **Then** the open view stays where it is
- **And** the new open mode remains saved, taking effect the next time the view
  is opened fresh

### Scenario: changing open mode with the view closed

- **Given** a view is not open
- **When** the user changes its open mode
- **Then** the new open mode is saved with no confirmation

### Multiple open instances

If more than one instance of the view is open when the user confirms, each
instance relocates to the new open mode; the number of open instances is
preserved. Note: count preservation holds for the New-tab target only — sidebar
targets reuse Obsidian's single left/right leaf, so multiple instances collapse
to one (an accepted limitation given that multi-leaf states are rare, and
`open()` already dedupes to a single leaf).

## Design notes (implementation vocabulary)

These map the behavior above onto the existing view-host and modal/flow
machinery. Domain scenarios above stay in domain language; the concrete API
names live here.

- **Open mode** is the `View["leaf"]` setting (`"left" | "right" | "tab"`),
  edited by the `leaf` dropdown in `ViewEditSubpage.vue`.

- **`ViewHostService` gains two methods** (`src/views/view-host.ts`):
  - `isOpen(id): boolean` — wraps `workspace.getLeavesOfType(viewTypeOf(id))`.
  - `reposition(id): Promise<void>` — reads the current `leaf` setting, then for
    **each** currently-open leaf of the view type opens a fresh leaf at the new
    mode (`#leafFor` + `setViewState`) and detaches the old one, preserving the
    count. This is the existing `open()` leaf-placement path without the
    reveal-existing short-circuit. `JournalViewLeaf` is config-driven, so
    detach-and-reopen loses no view state.

- **`repositionViewModal`** — a confirm-style modal added to
  `src/views/ui/modals.ts` (returns `void`, modeled on `deleteViewModal`), with a
  new `ConfirmRepositionModal.vue` (description + Cancel / Move buttons via
  `useModal()` and `UiSettingRow`). The description names the target open mode.

- **`RepositionViewFlow`** — new flow in `src/views/flows/`, modeled on
  `DeleteViewFlow`. Injects `ViewHostService` and `ModalService`. If
  `!viewHost.isOpen(id)` it returns without opening a modal. Otherwise it opens
  `repositionViewModal`, maps cancel to `UserAborted("reposition-view-modal")`,
  and on submit calls `viewHost.reposition(id)`.

- **Wiring in `ViewEditSubpage.vue`** — the `leafValue` setter persists as it does
  today, then chains `RepositionViewFlow` onto completion of the `update` so the
  flow reads the freshly-saved open mode. This mirrors the existing
  `openOnStartup` setter, which fires a host side-effect after persisting.

- **i18n** — new paraglide messages for the modal title, the description (with the
  target-mode name interpolated), and the Move action label. Reuse
  `common_action_cancel`.

## Non-goals

- Detecting a leaf's _actual_ current location to suppress no-op moves. Obsidian
  exposes no reliable read of which sidebar/tab a leaf sits in, so the
  confirmation appears on any real change to the saved open mode. Declining is
  the escape hatch.
- Changing the reveal-in-place behavior of the ordinary open command.

## Testing

- Unit: `RepositionViewFlow` — opens modal only when the view is open; calls
  `reposition` on submit; aborts on cancel; no modal when closed.
- Unit: `ViewHostService.reposition` — opens at the configured mode and detaches
  the prior leaf; preserves count with multiple open leaves.
- Component: `ViewEditSubpage` — changing the `leaf` dropdown persists and invokes
  the flow.
- e2e (v3-ai wdio, runtime-touching): open a view in the right sidebar, change its
  open mode to a new tab, confirm the move, assert the view is now a tab and no
  longer in the sidebar.
