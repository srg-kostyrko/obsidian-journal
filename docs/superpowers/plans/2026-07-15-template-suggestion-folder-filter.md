# Template Suggestion Folder Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope the template-path suggestion dropdown to the vault's configured templates folder(s) — the union of the core Templates plugin folder and Templater's folder — falling back to all markdown notes when neither is configured.

**Architecture:** A new `TemplatesService` (host layer) reads the core Templates folder from `app.internalPlugins` and delegates the Templater folder to `TemplaterService`, then produces the candidate note list. The suggestion component (`UiFileInput`, renamed to `UiTemplateInput`) asks `TemplatesService` for candidates instead of asking `NotesService` for all notes; its existing query filter/sort is unchanged.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, custom DI container (`inject`/`useService`), Vitest, `@testing-library/vue`.

## Global Constraints

- Tests colocate as `*.test.ts` next to the implementation.
- Field-initializer injection: `readonly #x = inject(...)` at declaration, not constructor-body assignment.
- No `eslint-disable` comments; no `@ts-expect-error` (use `expectTypeOf` for type assertions).
- No WHAT-comments; only WHY-comments where genuinely needed.
- One behavior per test; test names are subject+verb behavior descriptions, no "and"/comma lists.
- Assert observable outcomes (black-box), not spy call-shapes, unless the side effect _is_ the contract.
- Untyped Obsidian plugin access uses inline structural casts with per-hop guards (same style as `TemplaterService.#rawPlugin`), never `any`.
- Quality gates run at the end: `npm test`, `npm run check:types`, `npm run check:lint`.
- Single-file test run: `npx vitest run <path>`.

---

### Task 1: `TemplaterService.templatesFolder()`

Add a public accessor that returns Templater's configured templates folder, reusing the existing private `#rawPlugin()` accessor.

**Files:**

- Modify: `src/infrastructure/host/internal/templater-service.ts`
- Test: `src/infrastructure/host/internal/templater-service.test.ts`

**Interfaces:**

- Consumes: existing `TemplaterService.#rawPlugin(): object | null`, `TEMPLATER_PLUGIN_ID = "templater-obsidian"`.
- Produces: `TemplaterService.templatesFolder(): string | null` — returns `settings.templates_folder` when the plugin and setting are present, else `null`.

- [ ] **Step 1: Write the failing tests**

Append this `describe` block to `src/infrastructure/host/internal/templater-service.test.ts` (the `fakeApp` helper already returns the plugin for id `"templater-obsidian"`; pass a plugin carrying `settings`):

```ts
describe("TemplaterService.templatesFolder", () => {
  it("returns the configured Templater templates folder", () => {
    const plugin = { settings: { templates_folder: "Meta/Templater" } };
    expect(build(fakeApp({ plugin })).templatesFolder()).toBe("Meta/Templater");
  });

  it("returns null when the Templater plugin is absent", () => {
    expect(build(fakeApp()).templatesFolder()).toBeNull();
  });

  it("returns null when the plugin has no templates_folder setting", () => {
    const plugin = { settings: {} };
    expect(build(fakeApp({ plugin })).templatesFolder()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/infrastructure/host/internal/templater-service.test.ts`
Expected: FAIL — `service.templatesFolder is not a function`.

- [ ] **Step 3: Implement the method**

In `src/infrastructure/host/internal/templater-service.ts`, add this public method to the `TemplaterService` class (place it just above `apply`, after the `#rawPlugin` group):

```ts
  templatesFolder(): string | null {
    const settings = (this.#rawPlugin() as { settings?: unknown } | null)?.settings;
    if (!settings || typeof settings !== "object") return null;
    const folder = (settings as Record<string, unknown>).templates_folder;
    return typeof folder === "string" ? folder : null;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/infrastructure/host/internal/templater-service.test.ts`
Expected: PASS (all `TemplaterService` describes green).

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/host/internal/templater-service.ts src/infrastructure/host/internal/templater-service.test.ts
git commit -m "feat(host): expose Templater templates folder"
```

---

### Task 2: `TemplatesService`

Create the service that unions the configured folders and produces the candidate note list, then wire it into DI and the barrel export.

**Files:**

- Create: `src/infrastructure/host/internal/templates-service.ts`
- Create: `src/infrastructure/host/internal/templates-service.test.ts`
- Modify: `src/infrastructure/host/module.ts`
- Modify: `src/infrastructure/host/index.ts`

**Interfaces:**

- Consumes: `InternalObsidianAppToken` (`App`), `NotesService.allMarkdownNotes(): VaultPath[]`, `TemplaterService.templatesFolder(): string | null` (Task 1).
- Produces:
  - `TemplatesService.templateFolders(): VaultPath[]` — normalized, de-duplicated union of the core Templates folder and Templater's folder.
  - `TemplatesService.candidatePaths(): VaultPath[]` — markdown notes under any configured folder (recursive); all markdown notes when no folder is configured.

- [ ] **Step 1: Write the failing tests**

Create `src/infrastructure/host/internal/templates-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { FakeNotesService } from "@/infrastructure/host/testing";

import { NotesService } from "./notes-service";
import { TemplatesService } from "./templates-service";
import { TemplaterService } from "./templater-service";
import { InternalObsidianAppToken } from "./tokens";

import type { VaultPath } from "../types";
import type { App } from "obsidian";

function fakeApp(coreFolder: string | null): App {
  return {
    internalPlugins: {
      getPluginById: (id: string): unknown =>
        id === "templates" && coreFolder !== null ? { instance: { options: { folder: coreFolder } } } : null,
    },
  } as unknown as App;
}

function build(options: { coreFolder?: string | null; templaterFolder?: string | null; notes?: string[] } = {}): {
  service: TemplatesService;
} {
  const notes = new FakeNotesService();
  for (const path of options.notes ?? []) notes.seed(path as VaultPath);
  const templater = { templatesFolder: () => options.templaterFolder ?? null } as unknown as TemplaterService;

  const c = new Container();
  c.register(InternalObsidianAppToken).useValue(fakeApp(options.coreFolder ?? null));
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(TemplaterService).useValue(templater);
  c.register(TemplatesService).useClass(TemplatesService);
  return { service: c.resolve(TemplatesService) };
}

describe("TemplatesService.templateFolders", () => {
  it("unions the core Templates folder and the Templater folder", () => {
    const { service } = build({ coreFolder: "Templates", templaterFolder: "Meta/Templater" });
    expect(service.templateFolders().toSorted()).toEqual(["Meta/Templater", "Templates"]);
  });

  it("de-duplicates when both sources name the same folder", () => {
    const { service } = build({ coreFolder: "Templates", templaterFolder: "Templates" });
    expect(service.templateFolders()).toEqual(["Templates"]);
  });

  it("strips a trailing slash from a configured folder", () => {
    const { service } = build({ coreFolder: "Templates/", templaterFolder: null });
    expect(service.templateFolders()).toEqual(["Templates"]);
  });

  it("treats an empty-string folder as unconfigured", () => {
    const { service } = build({ coreFolder: "", templaterFolder: null });
    expect(service.templateFolders()).toEqual([]);
  });

  it("treats a root folder as unconfigured", () => {
    const { service } = build({ coreFolder: "/", templaterFolder: null });
    expect(service.templateFolders()).toEqual([]);
  });
});

describe("TemplatesService.candidatePaths", () => {
  it("returns notes under the core Templates folder", () => {
    const { service } = build({
      coreFolder: "Templates",
      notes: ["Templates/daily.md", "Journal/2026.md"],
    });
    expect(service.candidatePaths()).toEqual(["Templates/daily.md"]);
  });

  it("includes notes in subfolders of a configured folder", () => {
    const { service } = build({
      coreFolder: "Templates",
      notes: ["Templates/journals/daily.md", "Other/x.md"],
    });
    expect(service.candidatePaths()).toEqual(["Templates/journals/daily.md"]);
  });

  it("returns notes under the Templater folder when only Templater is configured", () => {
    const { service } = build({
      templaterFolder: "Meta/Templater",
      notes: ["Meta/Templater/t.md", "Journal/2026.md"],
    });
    expect(service.candidatePaths()).toEqual(["Meta/Templater/t.md"]);
  });

  it("falls back to all markdown notes when no folder is configured", () => {
    const { service } = build({ notes: ["a.md", "b.md"] });
    expect(service.candidatePaths().toSorted()).toEqual(["a.md", "b.md"]);
  });

  it("does not match a folder name as a path prefix of an unrelated folder", () => {
    const { service } = build({
      coreFolder: "Templates",
      notes: ["TemplatesArchive/old.md", "Templates/daily.md"],
    });
    expect(service.candidatePaths()).toEqual(["Templates/daily.md"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/infrastructure/host/internal/templates-service.test.ts`
Expected: FAIL — cannot resolve `./templates-service` (module does not exist yet).

- [ ] **Step 3: Create the service**

Create `src/infrastructure/host/internal/templates-service.ts`:

```ts
import { inject } from "@/infrastructure/di";

import { NotesService } from "./notes-service";
import { TemplaterService } from "./templater-service";
import { InternalObsidianAppToken } from "./tokens";

import type { VaultPath } from "../types";

const CORE_TEMPLATES_PLUGIN_ID = "templates";

export class TemplatesService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #notes = inject(NotesService);
  readonly #templater = inject(TemplaterService);

  templateFolders(): VaultPath[] {
    const folders = new Set<VaultPath>();
    for (const value of [this.#coreTemplatesFolder(), this.#templater.templatesFolder()]) {
      const normalized = normalizeFolder(value);
      if (normalized !== null) folders.add(normalized);
    }
    return [...folders];
  }

  candidatePaths(): VaultPath[] {
    const folders = this.templateFolders();
    const all = this.#notes.allMarkdownNotes();
    if (folders.length === 0) return all;
    return all.filter((path) => folders.some((folder) => path === folder || path.startsWith(`${folder}/`)));
  }

  #coreTemplatesFolder(): string | null {
    const internalPlugins = (this.#app as { internalPlugins?: { getPluginById?: (id: string) => unknown } })
      .internalPlugins;
    const plugin = internalPlugins?.getPluginById?.(CORE_TEMPLATES_PLUGIN_ID);
    const instance = (plugin as { instance?: unknown } | null)?.instance;
    const options = (instance as { options?: unknown } | null)?.options;
    const folder = (options as { folder?: unknown } | null)?.folder;
    return typeof folder === "string" ? folder : null;
  }
}

function normalizeFolder(value: string | null): VaultPath | null {
  if (value === null) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed === "") return null;
  return trimmed as VaultPath;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/infrastructure/host/internal/templates-service.test.ts`
Expected: PASS (all `TemplatesService` describes green).

- [ ] **Step 5: Register the service in the host module**

In `src/infrastructure/host/module.ts`, add the import (keep imports alphabetical among the `./internal/*` group) and the registration. Add the import line after the `TemplaterService` import:

```ts
import { TemplatesService } from "./internal/templates-service";
```

Add the registration inside `register(c)`, immediately after the `TemplaterService` line:

```ts
c.register(TemplatesService).useClass(TemplatesService);
```

- [ ] **Step 6: Export the service from the host barrel**

In `src/infrastructure/host/index.ts`, add next to the existing `TemplaterService` export:

```ts
export { TemplatesService } from "./internal/templates-service";
```

- [ ] **Step 7: Run type-check to verify wiring compiles**

Run: `npm run check:types`
Expected: PASS (no errors).

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/host/internal/templates-service.ts src/infrastructure/host/internal/templates-service.test.ts src/infrastructure/host/module.ts src/infrastructure/host/index.ts
git commit -m "feat(host): add TemplatesService for configured template folders"
```

---

### Task 3: Rename `UiFileInput` → `UiTemplateInput` and filter by candidate paths

Rename the component to reflect that it only picks templates, swap its data source to `TemplatesService.candidatePaths()`, and update both call sites and the test.

**Files:**

- Rename: `src/ui/UiFileInput.vue` → `src/ui/UiTemplateInput.vue`
- Rename: `src/ui/UiFileInput.test.ts` → `src/ui/UiTemplateInput.test.ts`
- Modify: `src/journals/settings/ui/sections/TemplatesSection.vue`
- Modify: `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue`

**Interfaces:**

- Consumes: `TemplatesService.candidatePaths(): VaultPath[]` (Task 2), `defineInputSuggest`, `UiInputSuggestInput` (props: `modelValue`, `definition`, `placeholder?`, `disabled?`).
- Produces: `UiTemplateInput` — same props/emits as before (`modelValue: string`, `placeholder?: string`, `disabled?: boolean`; emits `update:modelValue`).

- [ ] **Step 1: Rename the files with git**

```bash
git mv src/ui/UiFileInput.vue src/ui/UiTemplateInput.vue
git mv src/ui/UiFileInput.test.ts src/ui/UiTemplateInput.test.ts
```

- [ ] **Step 2: Rewrite the failing test**

Replace the entire contents of `src/ui/UiTemplateInput.test.ts` with a test that registers `TemplatesService` (stubbed to return fixed candidates) and asserts the component offers those candidates filtered by query:

```ts
import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, TemplatesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import UiTemplateInput from "./UiTemplateInput.vue";

afterEach(() => cleanup());

function build() {
  const templates = {
    candidatePaths: () => ["templates/daily.md", "templates/weekly.md"],
  } as unknown as TemplatesService;
  const inputSuggest = new FakeInputSuggestService();
  const container = new Container();
  container.register(TemplatesService).useValue(templates);
  container.register(InputSuggestService).useValue(inputSuggest as unknown as InputSuggestService);
  return { inputSuggest, container };
}

describe("UiTemplateInput", () => {
  it("offers template candidate paths filtered by query", () => {
    const { inputSuggest, container } = build();
    render(UiTemplateInput, {
      props: { modelValue: "", "onUpdate:modelValue": vi.fn() },
      global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
    });
    const handle = inputSuggest.attachments[0];
    expect(handle.query("").toSorted()).toEqual(["templates/daily.md", "templates/weekly.md"]);
    expect(handle.query("weekly")).toEqual(["templates/weekly.md"]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/ui/UiTemplateInput.test.ts`
Expected: FAIL — the component still injects `NotesService`/`allMarkdownNotes`, so resolving `TemplatesService` from an empty container throws (or the offered list is empty).

- [ ] **Step 4: Rewrite the component**

Replace the entire `<script setup>` block of `src/ui/UiTemplateInput.vue` with:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";
import { defineInputSuggest, TemplatesService } from "@/infrastructure/host";
import UiInputSuggestInput from "@/ui/UiInputSuggestInput.vue";

defineProps<{ modelValue: string; placeholder?: string; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: string] }>();

const templates = useService(TemplatesService);

const definition = computed(() =>
  defineInputSuggest<string>({
    fetch: (query) => {
      const q = query.toLowerCase();
      return templates
        .candidatePaths()
        .filter((path) => path.toLowerCase().includes(q))
        .toSorted();
    },
    render: (path, element) => {
      element.setText(path);
    },
    toValue: (path) => path,
  }),
);
</script>
```

Leave the `<template>` block unchanged.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/ui/UiTemplateInput.test.ts`
Expected: PASS.

- [ ] **Step 6: Update the journal Templates section call site**

In `src/journals/settings/ui/sections/TemplatesSection.vue`:

Change the import line

```ts
import UiFileInput from "@/ui/UiFileInput.vue";
```

to

```ts
import UiTemplateInput from "@/ui/UiTemplateInput.vue";
```

Change the element in the template

```vue
<UiFileInput v-model="config.templates[index]" class="grow" :placeholder="m.journal_edit_template_path_placeholder()" />
```

to

```vue
<UiTemplateInput
  v-model="config.templates[index]"
  class="grow"
  :placeholder="m.journal_edit_template_path_placeholder()"
/>
```

- [ ] **Step 7: Update the markdown-template block config call site**

In `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue`:

Change the import line

```ts
import UiFileInput from "@/ui/UiFileInput.vue";
```

to

```ts
import UiTemplateInput from "@/ui/UiTemplateInput.vue";
```

Change the element in the template

```vue
<UiFileInput
  :model-value="config.templatePath"
  :placeholder="m.view_block_markdown_template_path_placeholder()"
  @update:model-value="(value: string) => update({ templatePath: value })"
/>
```

to

```vue
<UiTemplateInput
  :model-value="config.templatePath"
  :placeholder="m.view_block_markdown_template_path_placeholder()"
  @update:model-value="(value: string) => update({ templatePath: value })"
/>
```

- [ ] **Step 8: Verify no stale references remain**

Run: `grep -rn "UiFileInput" src`
Expected: no output (all references renamed).

- [ ] **Step 9: Commit**

```bash
git add src/ui/UiTemplateInput.vue src/ui/UiTemplateInput.test.ts src/journals/settings/ui/sections/TemplatesSection.vue src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue
git commit -m "feat(ui): filter template suggestions by configured templates folder"
```

---

### Task 4: Full quality gates

Run the project-wide gates and fix any fallout.

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Run the type-checker**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 3: Run the linter**

Run: `npm run check:lint`
Expected: PASS (no errors, no warnings).

- [ ] **Step 4: Commit any gate fixes**

If Steps 1-3 required changes, commit them:

```bash
git add -A
git commit -m "chore: satisfy quality gates for template suggestion filter"
```

If nothing changed, skip this step.
