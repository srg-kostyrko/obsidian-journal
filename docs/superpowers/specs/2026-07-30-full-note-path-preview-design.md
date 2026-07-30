# Full note path preview

## Problem

"Where will my notes go?" is the first question a user asks of the Note creation
section, and the section answers it in two halves that never meet.

`NoteCreationSection.vue` mounts `NoteNamePreview` in the name-template row's
`#description` ("Resolved note name: `2026-07-30`") and `TemplateStringPreview` in the
folder row's ("Resolved folder: `Journals/2026`"). The user joins them mentally, and
supplies the `.md` from memory.

Worse, the folder half is frequently absent or wrong:

- `TemplateStringPreview` opens with `if (!props.value.includes("{")) return ""`, so a
  **static** folder such as `Journals` previews nothing. The users least fluent with
  template variables get the least feedback.
- A folder of `Journals/{{note_name}}` previews nothing either, and this one is a bug.
  `NotePathService.pathFor` renders the note name first and feeds it into the folder
  through `#withNoteName` as `{{note_name}}`/`{{title}}` (v2 order). The preview
  instead builds its context from `NotePathService.contextFor`, which has no
  `note_name` spec, so `renderForPreview`'s `engine.validate` call reports an unknown
  variable and the function returns `""`. The preview is silent for exactly the
  templates whose resolution is hardest to predict.

`pathFor` already returns the whole answer — folder, name, extension,
`normalizePath`ed. Nothing needs computing that is not computed today.

## Scope

One preview of the resolved path for today's entry, at the top of the Note creation
section, replacing both per-field previews.

Warnings are not previews and do not move. The name-template row keeps its collision,
invertibility, and move-to-folder hints; the folder row keeps its wrong-week warning.
The one exception is the empty-name warning, which belongs to the preview — see below.

Out of scope: previewing a date other than today, an editable preview date, and
teaching which field contributed which path segment (an early option; dropped as
decoration).

## `NoteNamePreview` becomes `NotePathPreview`

The component already resolves the path through `NotePathService.pathFor` and already
owns the branch structure this needs. It renders the full `VaultPath` instead of
slicing the basename off it:

```ts
type Resolved = { kind: "path"; path: string } | { kind: "empty" } | undefined;
```

- `Ok` → `{ kind: "path" }`, rendering `Resolved note path:` and the path
- `Err(EmptyNoteNameError)` → `{ kind: "empty" }`, rendering
  `journal_edit_name_template_empty_warning` in place of the path
- any other `Err`, or no metadata → `undefined`, rendering nothing, as today

Keeping the empty-name warning here rather than pushing it into the name-template row
follows from the same reasoning as the
[empty name template design](2026-07-28-empty-name-template-warning-design.md): "the
note will be called nothing" is an answer to "what will this note be called", not a
separate concern. It also keeps `pathFor` resolved exactly once per section.

The `.md` extension stays in the rendered string. It is part of the real path, and
`normalizePath` output is what lands in the vault.

`useTodayMetadata` is unchanged and keeps its other consumer, `TemplateStringPreview`.

## Placement

A plain full-width element, first child of `UiCollapsibleBlock`'s default slot in
`NoteCreationSection.vue`, above the name-template row — not itself a `UiSettingRow`.

A path with several folder segments is long, and the name/control split of a setting
row would squeeze it into the description column. The preview also describes the whole
section rather than any single field, which is what the layout should say. The
component carries its own bottom spacing so it does not sit flush against the first
setting row.

## What leaves the field rows

| Row           | Removed                   | Kept                                                              |
| ------------- | ------------------------- | ----------------------------------------------------------------- |
| Name template | `<NoteNamePreview>`       | variable-reference hint, collision, invertibility, move-to-folder |
| Folder        | `<TemplateStringPreview>` | variable-reference hint, wrong-week warning                       |

`TemplateStringPreview` rendered `<WrongWeekWarning>` outside its resolved-value
`v-if`, so the warning fired even when the preview itself was blank. Preserve that by
mounting `WrongWeekWarning` directly in the folder row under
`templateHasWrongWeek(config.folder)`, imported from `../wrong-week`. It is
folder-specific advice about a `W` token in a date format, not a preview.

`TemplateStringPreview` itself stays — `TemplatesSection.vue` uses it for each
template-path preview.

## Copy

`messages/en.json` gains `journal_edit_note_path_preview_label` = `"Resolved note
path:"`, matching its siblings `journal_edit_date_format_preview_label`
("Formatted date:") and `journal_edit_template_path_preview_label` ("Resolved template
path:"). Sentence case, en-US, per §A of `docs/2026-07-13-ux-text-audit.md`.

`journal_edit_note_name_preview_label` and `journal_edit_folder_path_preview_label`
lose their only call sites and are deleted. `src/i18n/paraglide` is generated by
`compile:i18n` and never staged.

## Testing

`NoteNamePreview.test.ts` → `NotePathPreview.test.ts`, retargeted from basenames to
paths:

- renders today's resolved path for a journal with no folder
- renders folder, name, and extension joined for a journal with a folder
- resolves a folder that consumes the note name via `{{note_name}}` (the regression
  the split preview could not render at all)
- updates reactively when the journal's `nameTemplate` changes
- updates reactively when the journal's `folder` changes
- warns when the name template resolves to an empty note name
- warns when the name template renders only whitespace
- renders nothing when the journal no longer exists

`NoteCreationSection.test.ts` — `renders all five setting rows` still holds; the
preview is not a row. `live-renders the note name preview as nameTemplate changes`
becomes a path assertion (`note-prefix.md`, since `journalDefaultsFor` leaves `folder`
empty). Add a case asserting the folder row still shows the wrong-week warning, since
that warning changed owner.

One behavior per test; scope in nested `describe` blocks; `@testing-library/vue` with
`user-event`.

No e2e. The preview is a pure function of config already covered at the unit level,
with no host API and no runtime wiring behind it.

## Manual checklist

Add to §2 (Per-journal configuration) of `docs/manual-testing-checklist-v3.md`,
alongside the existing **Folder** items: with a folder of `Journals/{{date:YYYY}}`,
the section's top preview shows the full resolved path including `.md` and matches the
path the created note actually lands at; with a folder of `Journals/{{note_name}}`,
the preview resolves rather than going blank; with the name template cleared, the
preview is replaced by the empty-name warning.
