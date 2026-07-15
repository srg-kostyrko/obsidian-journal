# Template suggestion folder filter

## Problem

The template-path picker suggests **every** markdown note in the vault. Users
pick templates from a dedicated folder, so an unfiltered vault-wide list is
noisy. The suggestion list should be scoped to the vault's configured templates
folder(s).

Two independent template-folder configurations exist, and this plugin supports
both engines:

- **Core Templates** plugin — folder stored in `.obsidian/templates.json`
  (`{ "folder": "templates" }`), reachable at
  `app.internalPlugins.getPluginById("templates").instance.options.folder`.
- **Templater** plugin — its own `templates_folder` setting, reachable at
  `app.plugins.getPlugin("templater-obsidian").settings.templates_folder`.

## Decisions

- **Folder source:** union of the core Templates folder and Templater's folder
  (whichever are configured).
- **Fallback:** when neither is configured, suggest all markdown notes
  (preserves today's behavior — non-breaking).
- **Recursion:** a configured folder includes notes in its subfolders.
- **Scope:** the input value is still free-form — only the _suggestion list_ is
  filtered. A user can type any path.

## Approach

A dedicated `TemplatesService` owns assembling the configured folders and
producing the candidate list. It reads the core Templates folder itself and
delegates the Templater folder to `TemplaterService`, which already owns access
to the Templater plugin. The Vue input component stays dumb: it asks the service
for candidates and applies its existing query filter/sort on top. `NotesService`
is unchanged and does not learn about template folders.

## Components

### `TemplaterService` (`src/infrastructure/host/internal/templater-service.ts`)

Gains one public method, reusing its existing `#rawPlugin()` accessor and
`TEMPLATER_PLUGIN_ID`:

- `templatesFolder(): string | null` — reads `#rawPlugin()?.settings?.templates_folder`,
  guarding each hop; returns `null` when Templater is absent or the setting is
  unset. No new plugin-access code — it goes through `#rawPlugin`.

### `TemplatesService` (`src/infrastructure/host/internal/templates-service.ts`)

Injects `InternalObsidianAppToken`, `NotesService`, and `TemplaterService`.
Untyped core-plugin access follows the existing narrowing style of
`TemplaterService.#rawPlugin`.

- `#coreTemplatesFolder(): string | null` — reads
  `app.internalPlugins.getPluginById("templates")?.instance?.options?.folder`,
  guarding each hop; returns `null` when unavailable.
- `templateFolders(): VaultPath[]` — union of the core folder and
  `templater.templatesFolder()`, each normalized:
  trim, strip a trailing `/`; drop `""` and `"/"` (treated as "not configured").
  De-duplicated.
- `candidatePaths(): VaultPath[]` — the deep operation:
  - `const folders = this.templateFolders()`
  - if `folders` is empty → return `notes.allMarkdownNotes()`.
  - otherwise return `notes.allMarkdownNotes()` filtered to paths where, for some
    `folder`, `path === folder` or `path.startsWith(folder + "/")` (recursive).

Exported from `src/infrastructure/host/index.ts` and registered in the host
module (`src/infrastructure/host/module.ts`).

### `UiTemplateInput.vue` (renamed from `UiFileInput.vue`)

`UiFileInput` is renamed to `UiTemplateInput` — the component only ever picks
templates, so a "file input" name that silently hides non-template files is
misleading. Its `fetch` swaps `notes.allMarkdownNotes()` for
`useService(TemplatesService).candidatePaths()`; the existing
`.filter(path.includes(query)).toSorted()` is unchanged. `NotesService` may no
longer be needed as a direct dependency of the component.

Call sites updated:

- `src/journals/settings/ui/sections/TemplatesSection.vue`
- `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue`

Test file renamed alongside: `UiFileInput.test.ts` → `UiTemplateInput.test.ts`.

## Data flow

```
UiTemplateInput.fetch(query)
  └─ TemplatesService.candidatePaths()
       ├─ templateFolders()
       │    ├─ #coreTemplatesFolder()          ── app.internalPlugins "templates"
       │    └─ TemplaterService.templatesFolder() ── via #rawPlugin (reused)
       └─ NotesService.allMarkdownNotes()  ── filtered under folders, or all when none
  └─ .filter(includes(query)).toSorted()
```

## Error handling

No throwing paths. Every untyped plugin hop is guarded and degrades to `null`,
so a missing/disabled plugin, absent `instance`, or unexpected shape simply
contributes no folder. When both sources yield nothing, the list falls back to
all markdown notes.

## Testing

Unit tests on `TemplatesService` (sibling `testing`/`vi.spyOn` on the injected
app and on `TemplaterService.templatesFolder` per project conventions; no
baked-in fakes), one behavior per test:

- union when both folders configured
- core-only configured
- templater-only configured
- neither configured → falls back to all markdown notes
- recursive inclusion (note in a subfolder of the configured folder)
- normalization: trailing slash stripped; `""` and `"/"` treated as unconfigured
- de-duplication when both sources name the same folder

Unit test on `TemplaterService.templatesFolder()`: returns the setting when the
plugin is present, `null` when absent.

No new component or e2e test: the component change is a source-level dependency
swap (wiring), and suggestion dropdowns are poor e2e targets. Existing
`TemplatesSection` / `MarkdownTemplateBlockConfig` tests are updated only for the
rename.
