# Empty note name template

## Problem

A journal whose name template resolves to nothing creates a hidden dotfile and says
nothing about it.

`nameTemplate` is `v.optional(v.string(), "{{date}}")` in `journalConfigSchema` — no
`minLength` — so clearing the field in journal settings persists cleanly.
`NotePathService.pathFor` then renders `".md"`, `NoteCreationService.ensureNote`
writes that file, and the note is invisible in the vault.

The same failure reaches the same place from a template that is not blank but
_renders_ blank. `NotePathService.contextFor` deliberately binds a declared numbering
variable to the empty string when it did not resolve (v2 fidelity: render empty
rather than leak the literal `{{index}}` token), so a journal named `{{index}}` with
numbering disabled produces `".md"` too.

Nothing surfaces either case. `useCollisionCheck` and `useInvertibilityCheck` both
open with `if (!value?.nameTemplate) return null`. `NoteNamePreview` renders under
`v-if="basename"` and simply disappears. The
[note-name collision design](2026-07-26-name-template-collision-warning-design.md)
deferred this explicitly — "an empty name template is a separate validation concern
and does not warn here". This is that concern.

## Scope

The property that matters is **the resolved note name is empty**, not "the field is
blank". A blank field, a whitespace-only field, and a template that renders to
nothing are one failure with three causes, and all three warn.

Two deliverables:

1. a warning in journal settings, where the mistake is made
2. a refusal at note creation, for the user who never opens settings — the hotkey,
   ribbon, and auto-create paths

Out of scope: blocking the config from being saved (journal settings edit live;
there is no save gate to hang validation on), auto-fixing the template, and
retro-fitting localized notices onto errors other than this one.

## The invariant moves into `NotePathService`

`pathFor` renders the bare `nameTemplate` before appending the extension and rejects
a result that trims to empty:

```ts
pathFor(name: string, metadata: JournalMetadata)
  : Result<VaultPath, JournalNotFoundError | EmptyNoteNameError>
```

Whitespace-only counts as empty — `"   "` yields `"   .md"`, which is as broken as
`".md"`. The guard rejects; it does not silently trim. Trimming would change the
resolved path of every template that renders trailing space today, which is a
behavior change nobody asked for.

`EmptyNoteNameError` lives in `src/journals/notes/errors.ts` alongside
`AnchorOccupiedError`, extends `JournalsError`, and carries the journal name.

Putting the guard here rather than at the creation site makes "a usable note path"
an invariant of the service, so every caller that derives a path inherits it:

| Caller                                        | Effect                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NoteCreationService.ensureNote`              | `NoteCreationError` gains a member; the existing `pathResult.kind === "err"` short-circuit already returns it                            |
| `NoteConnectionService.connect` (rename/move) | free — `ConnectError` is a union that already includes `NoteCreationError`                                                               |
| `BulkAddService.#plan`                        | free — `configuredResult.isOk()` is already false-tested and falls back to the note's current path, so no rename is proposed             |
| `NotePathService.pathForDate`                 | free — inside `attempt.in`, propagates                                                                                                   |
| `useCollisionCheck`, `findPathCollision`      | the path resolves to `undefined`, which `findPathCollision` already skips rather than matching — no collision reported, which is correct |
| `NoteNamePreview`, `ConnectNoteModal`         | already branch on `isOk()`                                                                                                               |

Only `NoteCreationError`'s union declaration changes. Nothing else needs a body edit.

`attachNote` takes its path from the caller and derives nothing, so it is unaffected.

## The runtime notice

`Flows.invoke` funnels every non-benign error into one notice:

> Journal: something went wrong — {error}

interpolating the raw `Error.message`, which is an untranslated developer string.
That framing is wrong here. An empty name template is not a crash; it is a
misconfiguration with an obvious fix, and the notice should say so.

Mirror the `BenignFlowError` pattern already in `src/infrastructure/flows/errors.ts`:

```ts
export interface UserFacingFlowError {
  readonly userNotice: string;
}

export function isUserFacingFlowError(error: unknown): error is UserFacingFlowError;
```

`Flows.invoke`'s `tapErr` prefers `error.userNotice` over `m.flow_failure_notice(...)`
when the predicate matches. `EmptyNoteNameError` is the first implementor, exposing
`userNotice` as a getter over the paraglide message.

`AnchorOccupiedError` and the rest are left alone. The seam gives them an upgrade
path; taking it now is unrelated work.

`AutoCreateService` does not go through `Flows` — `createCurrent` awaits
`ensureNote` directly and logs the error. A journal with an empty template therefore
fails silently in the background instead of firing a notice at every midnight tick
and at every startup, which is the right outcome for a background service.

## The settings warning

`NoteNamePreview` already resolves the note name and already hides when it comes out
empty. "It will be called nothing" is an answer to "what will this note be called",
not a separate concern, so the warning replaces the preview line in that component
rather than becoming a fourth sibling composable.

`EmptyNoteNameError` is what makes this possible. Today the component collapses two
different situations into one blank render:

- the name resolves to empty → **warn**
- the name cannot be resolved at all (metadata unavailable, journal missing) →
  **render nothing**, as now

### Anchor canonicalization

The component builds metadata from `CalendarDate.today().toAnchor()` — a raw date,
not the period's canonical anchor. `NotePathService.pathForDate` resolves through
`CycleService.anchorOf` first, and for anything but a Day journal the two differ.

Left as is, a Week journal whose template carries a numbering variable can fail to
resolve that variable from a mid-week anchor, render empty, and trip a **false**
empty-name warning for a journal that works correctly at runtime.

So `useTodayMetadata` resolves today through `CycleService.anchorOf` before
`FrontmatterService.buildMetadata`, returning `undefined` when there is no anchor.
This also fixes the preview itself, which has the same flaw today and can show a name
with a blank segment where the number belongs.

### Sibling hints are left alone

An earlier draft suppressed the collision and invertibility hints while the name
resolves to empty. That is dropped: it would require `NoteCreationSection.vue` to
resolve the same path a second time purely to gate two `v-if`s, which is the
duplicate resolution keeping the warning inside `NoteNamePreview` was meant to avoid.

It also buys very little. `useCollisionCheck` self-suppresses — `pathFor` now returns
`Err`, `findPathCollision` already skips anchors that fail to render, and the result
is `null`. Only `useInvertibilityCheck` can double up, and only for the
renders-to-empty case, where its message ("no date variable, and its numbering
variable cannot be turned back into a date") is true and adjacent rather than wrong.

If the stacked pair reads badly in practice, gating is a one-line follow-up.

## Copy

Two new keys in `messages/en.json`, sentence case and en-US per §A of
`docs/2026-07-13-ux-text-audit.md`:

- `journal_edit_name_template_empty_warning` — the settings hint. States that the
  template resolves to an empty note name and what to do about it.
- `journal_note_name_empty_notice` — the runtime notice, parameterized over
  `journalName`. Names the journal, states that no note can be created, points at the
  name template.

Both are authored in `messages/en.json` and picked up by `compile:i18n`;
`src/i18n/paraglide` is generated and never staged.

## UI

The warning renders in `NoteNamePreview.vue` in the slot the resolved-name line
occupies today — inside the name-template row's `#description`, below the variable
reference hint and above the collision and invertibility hints. It uses the
`.journal-hint` treatment (`color: var(--text-warning)`) that every other warning in
`NoteCreationSection.vue` uses, which means the class moves into `NoteNamePreview`'s
own scoped styles.

## Testing

`note-path.test.ts`:

- a blank name template yields `EmptyNoteNameError`
- a whitespace-only name template yields `EmptyNoteNameError`
- a template whose only variable renders empty yields `EmptyNoteNameError`
- a folder template that renders empty still resolves, since only the name matters

`note-creation.test.ts`:

- `ensureNote` returns `EmptyNoteNameError` for a journal with an empty name template
- `ensureNote` creates no note in that case

`note-connection.test.ts`:

- `connect` with `rename` returns `EmptyNoteNameError` rather than renaming the note
- `connect` without `rename` or `move` still succeeds, since it derives no path

`bulk-add-service.test.ts`:

- the proposal keeps the note's current path when the configured path cannot resolve

`flows.test.ts`:

- a flow failing with a `UserFacingFlowError` shows that error's own notice
- a flow failing with an ordinary error still shows `flow_failure_notice`

`NoteNamePreview.test.ts`:

- warns when the name template resolves to an empty note name
- shows the resolved name when it does not
- renders nothing when the name cannot be resolved at all
- does not warn for a Week journal whose template carries a numbering variable
  (the canonicalization regression)

E2E, `e2e/journeys/empty-name-template.e2e.ts`: a journal configured with an empty
name template, opened via the journal command, shows the notice and leaves no `.md`
file in the vault. The unit tests cover the refusal completely; what they cannot see
is the notice reaching the screen through the real `Flows` wiring, which is the whole
point of the `UserFacingFlowError` seam.

One behavior per test; scope expressed with nested `describe` blocks.

## Manual checklist

Add an entry to §13 (Settings UI navigation & validation) of
`docs/manual-testing-checklist-v3.md`: clear the note name template and confirm the
warning appears, then invoke the journal's open command and confirm the notice
appears and no note is created.

## Related, not fixed here

`dateFormat` is `v.pipe(v.string(), v.minLength(1))` in `journalConfigSchema` and is
bound live to a clearable `UiTextInput` in `NoteCreationSection.vue`. Clearing it
fails schema parse on reload and resets the whole journal to defaults — the collection
`minLength` reset trap. It is a worse bug than this one and needs its own spec.
