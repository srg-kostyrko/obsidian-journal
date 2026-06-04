# Markdown Template View Block — Design

## Summary

Add a new journal-view block, `markdown-template`, that renders a vault
markdown file as formatted markdown, processing template variables against the
view's current focused date. The block references a template file by path,
reads it at render time, runs it through the template engine, and renders the
result with Obsidian's markdown renderer so wikilinks, embeds, and
`{{journal_link(...)}}` resolve normally.

This also introduces the first markdown-to-DOM rendering path in v3 (a host
`MarkdownRenderService` + a reusable `UiMarkdown` component) and promotes the
existing file picker to a shared UI primitive.

## Motivation

Journal views currently render fixed, purpose-built blocks (calendars, custom
intervals, dividers, toolbars). There is no way for a user to surface arbitrary
markdown — a dashboard header, a links section, a templated summary — inside a
view. A template-driven markdown block fills that gap and reuses the existing
template-variable engine so the content stays date-aware as the user navigates.

## Decisions

- **Template source:** a reference to a vault `.md` file (path stored in block
  config), not inline text. Reusable and editable as a normal note.
- **Variable set:** date-centric, because a view is not bound to a journal or
  period — it only knows the focused date (`refDate`) and active shelf.
- **`journal_link`:** no new code — it is a globally registered
  `FunctionHandler`, so it already resolves in any `TemplateEngine.renderString`
  call once `date` is set in the context.
- **Live updates:** the block live-watches the referenced file and re-reads on
  change.
- **Empty/error UX:** empty path shows a muted placeholder; read failure shows
  an inline error. Nothing is thrown; the rest of the view keeps working.
- **Markdown rendering:** wrapped behind a host service so the Obsidian API
  stays at the host boundary, consistent with the rest of the codebase.

## Architecture

### Components

```
src/views/blocks/markdown-template/
  markdown-template-block.ts          definition + schema + types
  markdown-template-block.test.ts
  ui/
    MarkdownTemplateBlock.vue         render component
    MarkdownTemplateBlock.test.ts
    MarkdownTemplateBlockConfig.vue   config editor
    MarkdownTemplateBlockConfig.test.ts

src/infrastructure/host/internal/
  markdown-render-service.ts          new host service (wraps MarkdownRenderer)

src/ui/
  UiMarkdown.vue                      reusable rendered-markdown component
  UiMarkdown.test.ts
  UiFileInput.vue                     promoted from journals/settings/ui/FileInput.vue
```

### 1. Block definition — `markdown-template-block.ts`

```ts
const schema = v.object({ templatePath: v.optional(v.string(), "") });
export type MarkdownTemplateConfig = v.InferOutput<typeof schema>;

export const markdownTemplateBlock = defineViewBlock<MarkdownTemplateConfig>({
  key: "markdown-template",
  label: m.view_block_markdown_template_label(),
  description: m.view_block_markdown_template_description(),
  icon: "file-text",
  schema,
  defaultConfig: { templatePath: "" },
  component: MarkdownTemplateBlock,
  configComponent: MarkdownTemplateBlockConfig,
  cssClass: "journal-view-markdown-template",
});
```

Registered in `src/views/module.ts` via `ViewBlockDefinitionToken`, alongside
the existing blocks.

### 2. Variable context

The render component builds a `TemplateContext` from view state, mirroring the
render-time snapshots in `journals/notes/note-path.ts`:

| Variable                | Source                             | Notes                                                                                      |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `date`                  | `CalendarDate.fromAnchor(refDate)` | default format `"YYYY-MM-DD"`; supports `{{date:FMT}}` and `<±>` / `<startOf=…>` modifiers |
| `current_date`          | `CalendarDate.today()`             | `invertible:false` snapshot                                                                |
| `time` / `current_time` | `Clock.now()`                      | clock specs, default format `"HH:mm"`                                                      |

`{{journal_link(journal-name)}}` resolves automatically against `date`
(the focused refDate), because `JournalLinkHandler` is registered globally via
`FunctionHandlerToken` and the engine injects all handlers at construction. It
returns the journal note path **without** `.md` and **without** `[[ ]]`, so the
documented template usage is `[[{{journal_link(daily)}}]]`.

Unknown variables render as their raw token (existing engine behaviour); the
block never throws on render.

### 3. Render component — `ui/MarkdownTemplateBlock.vue`

Props: `{ instanceId: BlockInstanceId; config: MarkdownTemplateConfig }`.

Dependencies: `useViewContext()` (for `refDate`), `useService(NotesService)`,
`useService(TemplateEngine)`.

Behaviour:

- **Load.** If `templatePath` is empty → placeholder state. Otherwise
  `notes.read(path)`:
  - ok → store the raw template string, clear error.
  - err → store error state (read failure / not found).
- **Render.** A `computed` runs `engine.renderString(rawTemplate, context)`,
  where `context` depends on `refDate`. Changing the focused date recomputes the
  rendered output without re-reading the file.
- **Live-watch.** On mount, subscribe to `notes.events`. Re-read when a
  `metadata-changed`, `created`, or `renamed` event matches the configured
  `templatePath`. (`metadata-changed` is emitted from Obsidian's
  `metadataCache.on("changed")`, which fires on every content edit/reparse, so
  it is the reliable proxy for "the template file changed.") A `watch` on
  `config.templatePath` re-reads when the configured path changes. The
  subscription is disposed on unmount.
- **Output.** Rendered markdown is passed to
  `<UiMarkdown :markdown="rendered" :source-path="config.templatePath" />`.
  `source-path` is the template path so relative links/embeds resolve from the
  template's location.

States:

- Empty path → muted placeholder ("No template selected").
- Read failure → inline error message inside the block.
- Both leave the rest of the view unaffected (nothing thrown).

### 4. Markdown rendering capability (new, host layer)

`MarkdownRenderService` — `src/infrastructure/host/internal/markdown-render-service.ts`:

```ts
render(element: HTMLElement, markdown: string, sourcePath: string): Disposer
```

Injects `InternalObsidianAppToken`. Creates an Obsidian `Component` owner, calls
`MarkdownRenderer.render(app, markdown, element, sourcePath, owner)`, and returns
a disposer that unloads the owner and clears the element. Exported from the host
index, registered in the host module. A fake is added to host `testing.ts` for
consumers (the fake writes `markdown` into the element so output is assertable
under jsdom).

`UiMarkdown.vue` — `src/ui/UiMarkdown.vue`:

- Props: `{ markdown: string; sourcePath: string }`.
- Holds a container `ref`; `useService(MarkdownRenderService)`.
- Renders on mount and re-renders (dispose + render) when `markdown` or
  `sourcePath` changes; disposes on unmount.
- Keeps the Obsidian API behind the host boundary and is reusable by future
  blocks.

### 5. Config component — `ui/MarkdownTemplateBlockConfig.vue`

Props: `{ config: MarkdownTemplateConfig; onChange: (next: MarkdownTemplateConfig) => void }`.

- One `UiSettingRow` containing a file picker bound to `templatePath`.
- A short hint listing available variables (`date`, `current_date`, `time`,
  `journal_link`).
- `update(patch)` helper: `onChange({ ...config, ...patch })`.

**Refactor:** promote the existing generic `journals/settings/ui/FileInput.vue`
to a shared `src/ui/UiFileInput.vue` (it depends only on `NotesService` and
`UiInputSuggestInput`), and update the journals import. This avoids a
views → journals cross-feature dependency for the picker.

### 6. i18n

New paraglide messages:

- `view_block_markdown_template_label`
- `view_block_markdown_template_description`
- `view_block_markdown_template_path_label`
- `view_block_markdown_template_variables_hint`
- `view_block_markdown_template_empty`
- `view_block_markdown_template_read_error`

## Data flow

```
refDate (ViewContext)  ─┐
                        ├─> TemplateContext ─> TemplateEngine.renderString ─> markdown string ─> UiMarkdown ─> MarkdownRenderService ─> DOM
template file content ──┘                          (journal_link etc.)
        ▲
        └── NotesService.read + live-watch (metadata-changed / created / renamed)
```

## Error handling

- Empty `templatePath`: placeholder, no read attempted.
- File not found / read error: inline error state; no throw.
- Template render: `renderString` never throws — unknown variables and failed
  function handlers emit their raw token.
- Markdown render: handled inside `MarkdownRenderService`; render failures do not
  propagate out of the block.

## Testing

Colocated, behaviour-focused, testing-library + fakes:

- `MarkdownTemplateBlock.test.ts`
  - renders a `{{date}}` template against the focused refDate
  - shows the placeholder when the path is empty
  - shows an inline error when the read fails
  - re-renders when refDate changes
  - re-reads when a matching `metadata-changed` event fires
- `MarkdownTemplateBlockConfig.test.ts`
  - choosing a file calls `onChange` with the new path
- `UiMarkdown.test.ts`
  - renders via the injected service
  - re-renders on prop change
  - disposes on unmount

No tests for the thin `MarkdownRenderService` wrapper or for DI/module wiring,
per project conventions (wrappers around Obsidian APIs and wiring are not
unit-tested).

## Out of scope

- Inline-text templates (file reference only).
- Journal-bound variables (`journal_name`, `start_date`, `end_date`, numbering)
  — would require binding the block to a specific journal.
- Applying Templater to the rendered output (the engine handles variable
  processing; Templater is a note-creation concern).
