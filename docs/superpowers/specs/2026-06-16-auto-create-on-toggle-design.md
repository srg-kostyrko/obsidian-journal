# Create today's note when auto-create is switched on

## Problem

A journal's **Auto-create today's note** toggle only takes effect at plugin load
and at every local midnight. When a user switches it on mid-day, nothing happens
until the next of those two moments — today's note stays missing even though the
user just asked for it to exist. The expected behavior is the obvious one:
turning the toggle on creates today's note right then, if it is not already
there.

A second, related gap surfaces while doing this. The settings UI promises
"Confirmation dialog won't be shown for auto-created notes," but the load /
midnight pass still honors the journal's `confirmCreation` setting and would pop
the confirm dialog. Auto-create is meant to be silent; that promise is currently
broken.

## Behavior

### Switching the toggle on

When a journal's **Auto-create today's note** toggle moves from off to on, the
journal's today note is created immediately. If today's note already exists,
nothing is created — the action is idempotent (the existing note's frontmatter
is reconciled, as every ensure-path already does).

Creation is **silent**: no confirmation dialog and no notice, regardless of the
journal's `confirmCreation` setting. This matches what the settings screen
already tells the user about auto-created notes. If creation fails (for example a
journal whose timeline does not cover today), the failure is logged and swallowed
— the toggle is not reverted and no error is shown.

The trigger is the off→on transition only. Switching the toggle off does nothing.
Editing other journal settings does nothing. Opening the settings page for a
journal that already has auto-create on does nothing — those notes were handled
at load / midnight.

### Auto-create is uniformly silent

Auto-create never shows the confirmation dialog, in **all** of its paths: plugin
load, local midnight, and the new switch-on moment. A journal with
`confirmCreation` on still sees the dialog when notes are created through normal
navigation; it is only the auto-create paths that skip it.

## Design

### Skip-confirmation on the creation path

`NoteCreationService.ensureNote` takes an optional
`{ skipConfirmation?: boolean }`. When set, the `confirmCreation` modal is
bypassed; otherwise behavior is unchanged. The default keeps
`open-journal-entry.flow` exactly as it is today.

### `AutoCreateService` owns "create this journal's today note"

The per-journal body of the midnight tick — build today's metadata from
`CalendarDate.today()`, call `ensureNote(...)`, log on error — moves into a
public `createCurrent(name)` method that calls
`ensureNote(name, metadata, { skipConfirmation: true })`. The `#tick()` loop
calls `createCurrent` per auto-create journal. Routing the tick through this
method is what fixes the broken silent-create promise, and gives the toggle path
a single method to reuse.

### UI composable watches the toggle

A `useAutoCreateOnEnable(config)` composable in `journals/settings/ui/` (matching
the existing `use-*.ts` composables) watches `config.autoCreate` for an off→on
transition and calls `AutoCreateService.createCurrent(name)`, resolved via
`useService`. It is wired into `JournalEditSubpage.vue`. Vue reactivity stays in
the UI layer — `AutoCreateService` remains timer-driven and never imports Vue.

The repository's `"updated"` event is **not** used: the settings toggle mutates
the reactive config object directly through `v-model` and never calls
`repository.update()`, so no event fires.

## Testing

- `NoteCreationService.ensureNote` — with `skipConfirmation: true` and
  `confirmCreation` on, no modal opens and the note is created.
- `AutoCreateService.createCurrent` — creates today's note for the named journal
  and never opens the confirm modal even when `confirmCreation` is on.
- `useAutoCreateOnEnable` — off→on fires creation; on→off does not; editing an
  unrelated field does not; mounting with auto-create already on does not.

No e2e: the behavior is fully observable at the unit layer, and the toggle path
adds no new runtime wiring beyond a composable calling an already-booted service.
