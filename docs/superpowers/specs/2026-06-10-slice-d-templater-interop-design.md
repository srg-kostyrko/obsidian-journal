# Slice D — Templater interop (e2e)

The fourth e2e slice (see `docs/e2e-testing-strategy.md`, Roadmap). Slices A
(integration) and C (migration) are green; D is next. It exercises the one
third-party-plugin seam that actually exists in v3: the plugin's bridge to the
**Templater** community plugin.

## Scope correction

The strategy doc names this slice "Templater/Calendar interop." There is **no
community-Calendar-plugin interop code anywhere in v3** (confirmed by grepping
`src/` and `src/_old-code/`). The only real third-party seam is Templater, via
`TemplaterService` reaching into `app.plugins.getPlugin("templater-obsidian")`
and calling its real `create_running_config` / `parse_template` /
`editor_handler.jump_to_next_cursor_location`. This slice is therefore
**Templater interop only**, and the strategy doc is updated to match.

## Seam justification

Every e2e test must fail the question _"would this pass against
`__mocks__/obsidian.ts`?"_ The mock's `getPlugin` returns nothing, so
`TemplaterService` short-circuits and `<% %>` content passes through untouched.
Only a real Obsidian with real Templater installed evaluates it.

Deliberately **excluded** as misfiled:

- **Templater-absent passthrough** (`<% %>` left literal when Templater is not
  installed) — the mock already returns content unchanged, so this passes
  against the mock. It is already covered in the unit suite
  (`templater-service.test.ts`).
- **`isSupported()` introspection** — not a user-observable contract surface;
  the observable outcome (parsed vs. literal content) is asserted instead.

## Behaviors under test

Three behaviors, each a genuine seam, one behavior per test:

1. **Evaluate `<% %>`** — a journal template containing only Templater syntax is
   evaluated in the created note. The core `parse_template` seam.
2. **Compose `{{ }}` + `<% %>`** — a template mixing the plugin's own
   `TemplateEngine` (`{{ }}`) and Templater (`<% %>`) renders both, proving the
   ordering: the plugin's engine runs first (`renderString`), Templater second
   (`apply`). See `src/journals/notes/template-content.ts:43-44`.
3. **Cursor jump** — a template with a `<% tp.file.cursor() %>` marker: after the
   note opens, the editor cursor lands at the marker position and the marker text
   is removed from the file. Exercises a second real Templater API
   (`editor_handler`) **and** forces a real editor/workspace mount — a seam
   dimension the strategy explicitly lists as e2e-only ("real view mounting in a
   workspace").

## Trigger path

Journal-note creation runs the template chain:
`OpenDateFlow` → `OpenJournalEntryFlow` → `NoteCreationService.ensureNote` →
`TemplateContentService.renderFor` → `TemplaterService.apply`, and for the cursor
case `OpenJournalEntryFlow` calls `TemplaterService.cursorJump(path)` after
`workspace.openNote` (only when the note was just created — see
`open-journal-entry.flow.ts:39-40`).

Each test fires the behavior through the sanctioned A/C/D trigger:
`executeCommandById("journals:<commandId>")` against a user-defined command
committed in the fixture's `data.json`. The command's `OpenDateFlow` both creates
and **opens** the note; the open is what mounts the editor the cursor test needs.

The commands use context `today`, so the created note's path is date-dependent.
This is a non-issue: the test never predicts the path — it reads the **active
file** after firing and asserts on its content/cursor.

## Fixture — `e2e/fixtures/e2e-templater/`

- **Templater install** — a capabilities `plugins` entry
  `{ id: "templater-obsidian", enabled: true }` added to `wdio.conf.mts`
  alongside `./build`. wdio-obsidian-service downloads it from the community
  registry at boot, cached like the Obsidian binary. No vendored third-party
  artifact in the repo.
- **Journals `data.json`** — three day-journals, each writing to its own folder
  so today's notes never collide, each pointing at its own template, each with
  one user-defined command (context `today`, type `same`, `openMode: active`):
  - `eval` → `templates/eval.md`
  - `compose` → `templates/compose.md`
  - `cursor` → `templates/cursor.md`
- **Template files**:
  - `eval.md`: `<% "templater-ran" %>` — deterministic, Templater-only (the
    plugin's `{{ }}` engine leaves `<% %>` untouched).
  - `compose.md`: `{{journal_name}} / <% "templater-ran" %>` — both engines, in
    order.
  - `cursor.md`: known text with a `<% tp.file.cursor() %>` marker at a fixed
    line, so the expected `{ line, ch }` is predictable.

## Helpers — `e2e/support/templater.ts`

Mechanics live here; specs read as intent (matching slice A/C conventions). Vault
state is read through `app.*`, never node `fs`.

- `activeNotePath()` — `app.workspace.getActiveFile()?.path`.
- `contentOf(path)` — `app.vault.cachedRead` of the note.
- `cursorOf()` — `app.workspace.activeEditor?.editor?.getCursor()` → `{ line, ch }`.
- `waitForContent(path, predicate, msg)` / `waitForCursor(expected, msg)` —
  `browser.waitUntil` polling with descriptive `timeoutMsg`. No fixed sleeps.

## Specs — `e2e/interop/templater.e2e.ts`

The `interop` suite glob is already wired in `wdio.conf.mts`. One `describe`,
three `it`s:

1. **evaluate** — fire `eval` command → active note content is `templater-ran`,
   not the literal `<% "templater-ran" %>`.
2. **compose** — fire `compose` command → content contains both the `{{ }}`
   output (the journal name) and `templater-ran`, in the expected order.
3. **cursor jump** — fire `cursor` command → `waitUntil` the editor cursor
   reaches the marker's `{ line, ch }` and the marker text is gone from the file.

## Implementation risks (e2e exists to surface these)

- **Templater config dependency** — if real `parse_template` requires Templater's
  own "template folder location" to be set, `TemplaterService`'s `catch` swallows
  the error and content stays literal `<% %>`, failing the evaluate test loudly.
  Fix: add Templater's own `data.json` to the fixture. Discovered on first run.
- **Headless editor focus** — the cursor test assumes xvfb reliably reports an
  active `MarkdownView` editor. If focus is finicky there, that is the likely
  flake site → candidate for the nightly-only `quarantine` suite, not the PR gate.

## Docs to update

- `docs/e2e-testing-strategy.md` — retitle Slice D to "Templater interop"; note
  the absence of community-Calendar interop in v3 (Roadmap entry 3 and the Scope
  list).
- A `reference`/`project` memory entry so the Calendar-scope correction does not
  resurface.

## Out of scope

- Community Calendar plugin interop (no v3 code to exercise).
- Templater-absent / `isSupported()` paths (unit-covered, would pass against the
  mock).
- Slice B journeys (the next and final roadmap slice, built after D is green).
