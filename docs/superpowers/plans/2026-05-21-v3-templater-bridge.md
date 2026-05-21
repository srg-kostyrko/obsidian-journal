# v3 Templater Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port v2's Templater integration — apply the Templater plugin to journal-note template content and jump the editor cursor after a newly-created note opens.

**Architecture:** A new `TemplaterService` host citizen wraps all `templater-obsidian` plugin access (capability detection, content application, cursor jump). `TemplateContentService` applies Templater as the last step of content rendering; `NoteCreationService` creates the note file empty before rendering so Templater has a real target file; `OpenJournalEntryFlow` jumps the cursor when it opened a note it just created. A settings-UI hint and modal inform the user that Templater is detected.

**Tech Stack:** TypeScript, Vue 3 SFCs, the project's DI container (`@/infrastructure/di`), `Result`/`AsyncResult` monads, Vitest + `@testing-library/vue`, Paraglide i18n (`@inlang/paraglide-js`).

**Spec:** `docs/superpowers/specs/2026-05-21-v3-templater-bridge-design.md`

**Per-task verification:** `npm test`, `npm run check:types`, `npm run check:lint` must all pass before each commit. Commands use `npm` (not pnpm). The branch is `v3-ai`; commit directly to it. Never add a `Co-Authored-By` trailer.

---

## Task 1: `TemplaterPlugin` type shim

The typed description of the `templater-obsidian` plugin's API surface. Obsidian's public `App`/`Plugin` types do not expose this; the shim narrows `unknown` plugin lookups.

**Files:**

- Create: `src/infrastructure/host/internal/templater-plugin.ts`

- [ ] **Step 1: Create the type shim**

`src/infrastructure/host/internal/templater-plugin.ts`:

```ts
import type { Plugin, TFile } from "obsidian";

interface RunningConfig {
  template_file: TFile | undefined;
  target_file: TFile;
  run_mode: number;
  active_file?: TFile | null;
}

export interface TemplaterPlugin extends Plugin {
  templater: {
    create_running_config(templateFile: TFile | undefined, targetFile: TFile, runMode: number): RunningConfig;
    parse_template(config: RunningConfig, content: string): Promise<string>;
  };
  editor_handler: {
    jump_to_next_cursor_location(file: TFile | null, autoJump: boolean): Promise<void>;
  };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run check:types`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/host/internal/templater-plugin.ts
git commit -m "feat(host/templater): add TemplaterPlugin type shim"
```

---

## Task 2: `TemplaterService`

The host service. `apply` runs Templater over content; `cursorJump` jumps the editor cursor; `isSupported` reports whether the plugin is installed. Every Templater failure soft-fails (logged at `debug`, original content/no-op returned).

**Files:**

- Create: `src/infrastructure/host/internal/templater-service.ts`
- Test: `src/infrastructure/host/internal/templater-service.test.ts`

- [ ] **Step 1: Write the failing test**

`src/infrastructure/host/internal/templater-service.test.ts`:

```ts
import { TFile } from "obsidian";
import { describe, it, expect } from "vitest";

import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";

import { TemplaterService } from "./templater-service";
import { InternalObsidianAppToken } from "./tokens";

import type { VaultPath } from "../types";
import type { App } from "obsidian";

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  return file;
}

interface FakeAppOptions {
  plugin?: unknown;
  files?: Record<string, TFile>;
}

function fakeApp(options: FakeAppOptions = {}): App {
  const files = options.files ?? {};
  return {
    plugins: {
      getPlugin: (id: string): unknown => (id === "templater-obsidian" ? (options.plugin ?? null) : null),
    },
    vault: {
      getAbstractFileByPath: (path: string): TFile | null => files[path] ?? null,
    },
  } as unknown as App;
}

function build(app: App): TemplaterService {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(InternalObsidianAppToken).useValue(app);
  c.register(TemplaterService).useClass(TemplaterService);
  return c.resolve(TemplaterService);
}

describe("TemplaterService.apply", () => {
  it("returns content unchanged when it has no Templater directives", async () => {
    const service = build(fakeApp());
    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "plain content");
    expect(result.isOk() && result.value).toBe("plain content");
  });

  it("returns content unchanged when the Templater plugin is absent", async () => {
    const service = build(fakeApp({ files: { "T.md": tfile("T.md"), "N.md": tfile("N.md") } }));
    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "<% tp.date.now() %>");
    expect(result.isOk() && result.value).toBe("<% tp.date.now() %>");
  });

  it("returns content unchanged when the plugin lacks the parse API", async () => {
    const plugin = { templater: { create_running_config: () => ({}) } };
    const service = build(fakeApp({ plugin, files: { "T.md": tfile("T.md"), "N.md": tfile("N.md") } }));
    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "<% x %>");
    expect(result.isOk() && result.value).toBe("<% x %>");
  });

  it("returns the parsed result when Templater is available", async () => {
    const plugin = {
      templater: {
        create_running_config: () => ({}),
        parse_template: async (_config: unknown, content: string) => `parsed:${content}`,
      },
    };
    const service = build(fakeApp({ plugin, files: { "T.md": tfile("T.md"), "N.md": tfile("N.md") } }));
    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "<% x %>");
    expect(result.isOk() && result.value).toBe("parsed:<% x %>");
  });

  it("passes the resolved template and target files to create_running_config", async () => {
    const calls: { template: unknown; target: unknown; mode: unknown }[] = [];
    const templateFile = tfile("T.md");
    const targetFile = tfile("N.md");
    const plugin = {
      templater: {
        create_running_config: (template: unknown, target: unknown, mode: unknown) => {
          calls.push({ template, target, mode });
          return {};
        },
        parse_template: async () => "done",
      },
    };
    const service = build(fakeApp({ plugin, files: { "T.md": templateFile, "N.md": targetFile } }));
    await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "<% x %>");
    expect(calls).toEqual([{ template: templateFile, target: targetFile, mode: 0 }]);
  });

  it("returns content unchanged when parse_template throws", async () => {
    const plugin = {
      templater: {
        create_running_config: () => ({}),
        parse_template: async () => {
          throw new Error("boom");
        },
      },
    };
    const service = build(fakeApp({ plugin, files: { "T.md": tfile("T.md"), "N.md": tfile("N.md") } }));
    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "<% x %>");
    expect(result.isOk() && result.value).toBe("<% x %>");
  });
});

describe("TemplaterService.cursorJump", () => {
  it("jumps to the next cursor location when Templater supports it", async () => {
    const jumps: { file: unknown; auto: unknown }[] = [];
    const plugin = {
      templater: { create_running_config: () => ({}), parse_template: async () => "" },
      editor_handler: {
        jump_to_next_cursor_location: async (file: unknown, auto: unknown) => {
          jumps.push({ file, auto });
        },
      },
    };
    const noteFile = tfile("N.md");
    const service = build(fakeApp({ plugin, files: { "N.md": noteFile } }));
    await service.cursorJump("N.md" as VaultPath);
    expect(jumps).toEqual([{ file: noteFile, auto: true }]);
  });

  it("does nothing when the plugin has no editor handler", async () => {
    const plugin = { templater: { create_running_config: () => ({}), parse_template: async () => "" } };
    const service = build(fakeApp({ plugin, files: { "N.md": tfile("N.md") } }));
    const result = await service.cursorJump("N.md" as VaultPath);
    expect(result.isOk()).toBe(true);
  });

  it("absorbs errors thrown by the cursor jump", async () => {
    const plugin = {
      templater: { create_running_config: () => ({}), parse_template: async () => "" },
      editor_handler: {
        jump_to_next_cursor_location: async () => {
          throw new Error("boom");
        },
      },
    };
    const service = build(fakeApp({ plugin, files: { "N.md": tfile("N.md") } }));
    const result = await service.cursorJump("N.md" as VaultPath);
    expect(result.isOk()).toBe(true);
  });
});

describe("TemplaterService.isSupported", () => {
  it("reports supported when the plugin exposes the apply API", () => {
    const plugin = { templater: { create_running_config: () => ({}), parse_template: async () => "" } };
    expect(build(fakeApp({ plugin })).isSupported()).toBe(true);
  });

  it("reports unsupported when the plugin is absent", () => {
    expect(build(fakeApp()).isSupported()).toBe(false);
  });

  it("reports unsupported when the plugin API is incomplete", () => {
    const plugin = { templater: { create_running_config: () => ({}) } };
    expect(build(fakeApp({ plugin })).isSupported()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/infrastructure/host/internal/templater-service.test.ts`
Expected: FAIL — `templater-service` module does not exist.

- [ ] **Step 3: Write the implementation**

`src/infrastructure/host/internal/templater-service.ts`:

```ts
import { TFile } from "obsidian";

import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";

import { InternalObsidianAppToken } from "./tokens";

import type { TemplaterPlugin } from "./templater-plugin";
import type { VaultPath } from "../types";

const TEMPLATER_PLUGIN_ID = "templater-obsidian";
const RUN_MODE_CREATE_NEW_FROM_TEMPLATE = 0;

export class TemplaterService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #logger = inject(LoggerFactoryToken).named("templater");

  apply(templatePath: VaultPath, targetPath: VaultPath, content: string): AsyncResult<string, never> {
    return AsyncResult.fromPromise(this.#apply(templatePath, targetPath, content), () => {
      throw new Error("unreachable: #apply never rejects");
    });
  }

  cursorJump(path: VaultPath): AsyncResult<void, never> {
    return AsyncResult.fromPromise(this.#cursorJump(path), () => {
      throw new Error("unreachable: #cursorJump never rejects");
    });
  }

  isSupported(): boolean {
    return this.#applyCapablePlugin() !== null;
  }

  async #apply(templatePath: VaultPath, targetPath: VaultPath, content: string): Promise<string> {
    if (!content.includes("<%") && !content.includes("%>")) return content;
    const plugin = this.#applyCapablePlugin();
    if (!plugin) return content;
    const templateFile = this.#app.vault.getAbstractFileByPath(templatePath);
    const targetFile = this.#app.vault.getAbstractFileByPath(targetPath);
    if (!(templateFile instanceof TFile) || !(targetFile instanceof TFile)) return content;
    try {
      const config = plugin.templater.create_running_config(
        templateFile,
        targetFile,
        RUN_MODE_CREATE_NEW_FROM_TEMPLATE,
      );
      return await plugin.templater.parse_template(config, content);
    } catch (cause) {
      this.#logger.debug("templater apply failed", { cause: String(cause) });
      return content;
    }
  }

  async #cursorJump(path: VaultPath): Promise<void> {
    const plugin = this.#cursorCapablePlugin();
    if (!plugin) return;
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    try {
      await plugin.editor_handler.jump_to_next_cursor_location(file, true);
    } catch (cause) {
      this.#logger.debug("templater cursor jump failed", { cause: String(cause) });
    }
  }

  #applyCapablePlugin(): TemplaterPlugin | null {
    const plugin = this.#rawPlugin();
    const templater = (plugin as { templater?: unknown } | null)?.templater;
    if (!templater || typeof templater !== "object") return null;
    const api = templater as Record<string, unknown>;
    if (typeof api.create_running_config !== "function") return null;
    if (typeof api.parse_template !== "function") return null;
    return plugin as TemplaterPlugin;
  }

  #cursorCapablePlugin(): TemplaterPlugin | null {
    const plugin = this.#rawPlugin();
    const handler = (plugin as { editor_handler?: unknown } | null)?.editor_handler;
    if (!handler || typeof handler !== "object") return null;
    if (typeof (handler as Record<string, unknown>).jump_to_next_cursor_location !== "function") return null;
    return plugin as TemplaterPlugin;
  }

  #rawPlugin(): object | null {
    const plugins = (this.#app as { plugins?: { getPlugin?: (id: string) => unknown } }).plugins;
    const plugin = plugins?.getPlugin?.(TEMPLATER_PLUGIN_ID);
    return plugin && typeof plugin === "object" ? plugin : null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/infrastructure/host/internal/templater-service.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Verify and commit**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

```bash
git add src/infrastructure/host/internal/templater-service.ts src/infrastructure/host/internal/templater-service.test.ts
git commit -m "feat(host/templater): add TemplaterService"
```

---

## Task 3: Host wiring

Export `TemplaterService` from the host barrel, register it in `createHostModule`, and add `FakeTemplaterService` to the host testing barrel for downstream tests. Module wiring is not unit-tested (per repo convention).

**Files:**

- Modify: `src/infrastructure/host/index.ts`
- Modify: `src/infrastructure/host/module.ts`
- Modify: `src/infrastructure/host/testing.ts`

- [ ] **Step 1: Export `TemplaterService` from the host barrel**

In `src/infrastructure/host/index.ts`, add this line next to the other `internal/` service exports (after the `WorkspaceService` export):

```ts
export { TemplaterService } from "./internal/templater-service";
```

- [ ] **Step 2: Register `TemplaterService` in `createHostModule`**

In `src/infrastructure/host/module.ts`, add the import next to the other `internal/` imports:

```ts
import { TemplaterService } from "./internal/templater-service";
```

And add this registration inside `register(c)`, after the `WorkspaceService` line:

```ts
c.register(TemplaterService).useClass(TemplaterService);
```

(No `.eager()` — the service holds no subscriptions and does no startup work.)

- [ ] **Step 3: Add `FakeTemplaterService` to the host testing barrel**

In `src/infrastructure/host/testing.ts`, add `TemplaterService` to the existing type-only import block:

```ts
import type { TemplaterService } from "./internal/templater-service";
```

Then add this class before the final `export { FakeModalHandle, FakeModalService } from "./modals/testing";` line:

```ts
export class FakeTemplaterService implements Pick<TemplaterService, "apply" | "cursorJump" | "isSupported"> {
  #supported = false;
  #transform: (content: string) => string = (content) => content;
  readonly applyCalls: { templatePath: VaultPath; targetPath: VaultPath; content: string }[] = [];
  readonly cursorJumps: VaultPath[] = [];

  setSupported(value: boolean): void {
    this.#supported = value;
  }

  setTransform(transform: (content: string) => string): void {
    this.#transform = transform;
  }

  apply(templatePath: VaultPath, targetPath: VaultPath, content: string): AsyncResult<string, never> {
    this.applyCalls.push({ templatePath, targetPath, content });
    return AsyncResult.ok(this.#transform(content));
  }

  cursorJump(path: VaultPath): AsyncResult<void, never> {
    this.cursorJumps.push(path);
    return AsyncResult.ok();
  }

  isSupported(): boolean {
    return this.#supported;
  }
}
```

(`AsyncResult` and `VaultPath` are already imported in `testing.ts`.)

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS (the full suite is still green — nothing consumes the new wiring yet).

```bash
git add src/infrastructure/host/index.ts src/infrastructure/host/module.ts src/infrastructure/host/testing.ts
git commit -m "feat(host): register and export TemplaterService"
```

---

## Task 4: Apply Templater in `TemplateContentService`

`renderFor` gains a `targetPath` parameter and applies Templater to the engine-rendered content as its final step. `note-creation.ts`'s two call sites are updated to pass the path (no reorder yet — that is Task 5). The three test files that build containers with `TemplateContentService` register a `FakeTemplaterService`.

**Files:**

- Modify: `src/journals/notes/template-content.ts`
- Modify: `src/journals/notes/note-creation.ts:73` and `:94`
- Test: `src/journals/notes/template-content.test.ts`
- Modify: `src/journals/notes/note-creation.test.ts` (container builder)
- Modify: `src/journals/flows/open-journal-entry.test.ts` (container builder)

- [ ] **Step 1: Update `template-content.test.ts` — builder, existing calls, new tests**

Replace the import block and `build` function in `src/journals/notes/template-content.test.ts` so it registers a `FakeTemplaterService`. The new imports add `TemplaterService` and `FakeTemplaterService`; the new `build` takes an optional `templater` argument:

```ts
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
```

```ts
function build(settings: SettingsService, notes: FakeNotesService, templater = new FakeTemplaterService()): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(TemplaterService).useValue(templater as unknown as TemplaterService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  return c;
}
```

Every existing `.renderFor(...)` call in this file currently passes three arguments. Append a fourth `targetPath` argument to each — use `"note.md" as VaultPath` (the value is irrelevant; `FakeTemplaterService` ignores the vault). For example:

```ts
.renderFor("daily", meta, "2026-05-19", "note.md" as VaultPath)
```

Apply that fourth-argument addition to all seven existing `renderFor` calls.

Then append this new describe block to the end of the file:

```ts
describe("TemplateContentService.renderFor — Templater", () => {
  it("passes engine-rendered content through Templater", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# {{date}}");
    const templater = new FakeTemplaterService();
    templater.setTransform((content) => `${content} [templated]`);
    const result = await build(settings, notes, templater)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);
    expectOk(result);
    expect(result.value).toBe("# 2026-05-19 [templated]");
  });

  it("passes the winning template path and target path to Templater", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "body");
    const templater = new FakeTemplaterService();
    await build(settings, notes, templater)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);
    expect(templater.applyCalls).toEqual([
      { templatePath: "Templates/daily.md", targetPath: "2026-05-19.md", content: "body" },
    ]);
  });

  it("does not invoke Templater when no templates are configured", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const templater = new FakeTemplaterService();
    await build(settings, notes, templater)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);
    expect(templater.applyCalls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/journals/notes/template-content.test.ts`
Expected: FAIL — `renderFor` does not accept a fourth argument / `TemplaterService` is not injected.

- [ ] **Step 3: Update `template-content.ts`**

Replace the entire contents of `src/journals/notes/template-content.ts` with:

```ts
import { inject } from "@/infrastructure/di";
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { NoteReadError, VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";
import { TemplateEngine } from "@/templates";

import { journalConfigCollection } from "../config";
import { JournalNotFoundError } from "../errors";

import { NotePathService } from "./note-path";

import type { JournalConfig } from "../config";
import type { JournalMetadata } from "../types";

export class TemplateContentService {
  readonly #settings = inject(SettingsService);
  readonly #notes = inject(NotesService);
  readonly #engine = inject(TemplateEngine);
  readonly #path = inject(NotePathService);
  readonly #templater = inject(TemplaterService);

  renderFor(
    name: string,
    metadata: JournalMetadata,
    noteName: string,
    targetPath: VaultPath,
  ): AsyncResult<string, JournalNotFoundError | NoteReadError> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
    if (!config) return AsyncResult.err(new JournalNotFoundError(name));
    if (config.templates.length === 0) return AsyncResult.ok("");

    const pathContext = this.#path.contextFor(config, metadata);
    const bodyContext = this.#path.bodyContextFor(config, metadata, noteName);

    return AsyncResult.fromPromise(
      (async () => {
        for (const entry of config.templates) {
          const withExtension = entry.endsWith(".md") ? entry : `${entry}.md`;
          const renderedPath = this.#engine.renderString(withExtension, pathContext) as VaultPath;
          if (this.#notes.find(renderedPath).isNone()) continue;
          const readResult = await this.#notes.read(renderedPath);
          if (readResult.isErr()) throw readResult.error;
          const rendered = this.#engine.renderString(readResult.value, bodyContext);
          const applied = await this.#templater.apply(renderedPath, targetPath, rendered);
          return applied.match({ ok: (content) => content, err: () => rendered });
        }
        return "";
      })(),
      (cause) => cause as JournalNotFoundError | NoteReadError,
    );
  }
}
```

- [ ] **Step 4: Update the `note-creation.ts` call sites**

In `src/journals/notes/note-creation.ts`, both `renderFor` calls currently pass three arguments. Append `path` as the fourth argument to each:

- Line ~73 (inside `ensureNote`): `const content = yield* this.#content.renderFor(name, metadata, this.#basename(path), path);`
- Line ~94 (inside `attachNote`): `const content = yield* this.#content.renderFor(name, metadata, this.#basename(path), path);`

(`path` is in scope in both methods.)

- [ ] **Step 5: Register `FakeTemplaterService` in `note-creation.test.ts`**

In `src/journals/notes/note-creation.test.ts`, update the host imports:

```ts
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
```

Replace the `build` function with one that takes an optional `templater` argument and registers it:

```ts
function build(
  settings: SettingsService,
  notes: FakeNotesService,
  modals: FakeModalService,
  templater = new FakeTemplaterService(),
): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(TemplaterService).useValue(templater as unknown as TemplaterService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(NoteCreationService).useClass(NoteCreationService);
  return c;
}
```

- [ ] **Step 6: Register `FakeTemplaterService` in `open-journal-entry.test.ts`**

In `src/journals/flows/open-journal-entry.test.ts`, update the host imports:

```ts
import { NotesService, TemplaterService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeNotesService, FakeTemplaterService, FakeWorkspaceService } from "@/infrastructure/host/testing";
```

Replace the `build` function with one that takes an optional `templater` argument and registers it:

```ts
function build(
  settings: SettingsService,
  notes: FakeNotesService,
  workspace: FakeWorkspaceService,
  modals: FakeModalService,
  templater = new FakeTemplaterService(),
) {
  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(TemplaterService).useValue(templater as unknown as TemplaterService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(OpenJournalEntryFlow).useClass(OpenJournalEntryFlow);
  return c;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- src/journals/notes/template-content.test.ts src/journals/notes/note-creation.test.ts src/journals/flows/open-journal-entry.test.ts`
Expected: PASS (all three files green, including the new Templater describe block).

- [ ] **Step 8: Verify and commit**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS.

```bash
git add src/journals/notes/template-content.ts src/journals/notes/template-content.test.ts src/journals/notes/note-creation.ts src/journals/notes/note-creation.test.ts src/journals/flows/open-journal-entry.test.ts
git commit -m "feat(journals/notes/template-content): apply Templater to rendered content"
```

---

## Task 5: Reorder `NoteCreationService.ensureNote`

Templater's `create_running_config` needs the target file to exist. `ensureNote` must create the note file empty, then render content (Templater included), then write. This is v2 parity.

**Files:**

- Modify: `src/journals/notes/note-creation.ts` (`ensureNote` missing-path branch)
- Test: `src/journals/notes/note-creation.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this describe block to the end of `src/journals/notes/note-creation.test.ts`:

```ts
describe("NoteCreationService.ensureNote — Templater", () => {
  it("applies Templater to the created note's content", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# {{date}}");
    const templater = new FakeTemplaterService();
    templater.setTransform((content) => `${content}\n<!-- templated -->`);
    const result = await build(settings, notes, new FakeModalService(), templater)
      .resolve(NoteCreationService)
      .ensureNote("daily", meta);
    expectOk(result);
    const read = await notes.read("2026-05-19.md" as VaultPath);
    expectOk(read);
    expect(read.value).toBe("# 2026-05-19\n<!-- templated -->");
  });

  it("targets the created note path when applying Templater", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "body");
    const templater = new FakeTemplaterService();
    await build(settings, notes, new FakeModalService(), templater)
      .resolve(NoteCreationService)
      .ensureNote("daily", meta);
    expect(templater.applyCalls).toEqual([
      { templatePath: "Templates/daily.md", targetPath: "2026-05-19.md", content: "body" },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass against the current code**

Run: `npm test -- src/journals/notes/note-creation.test.ts`
Expected: PASS — these tests already pass because `FakeTemplaterService` ignores the vault. They are kept as regression coverage; the reorder below is required for the _real_ `TemplaterService`, whose `create_running_config` needs an existing target file.

- [ ] **Step 3: Reorder the `ensureNote` missing-path branch**

In `src/journals/notes/note-creation.ts`, inside `ensureNote`, the `attempt.in` block currently renders content, then marks expected, then creates with content. Replace the body of that block (everything after the `confirmCreation` modal handling, from `const content = yield* ...` through `return { path, created: true as const };`) with:

```ts
this.#markExpected(path);
const createResult = await this.#notes.create(path, "");
if (createResult.isErr()) {
  this.#clearExpected(path);
  return yield * new Err(createResult.error as NoteCreationError);
}
const content = yield * this.#content.renderFor(name, metadata, this.#basename(path), path);
if (content !== "") yield * this.#notes.write(path, content);
yield * this.#notes.updateFrontmatter(path, mutator);
return { path, created: true as const };
```

The full `ensureNote` `attempt.in` block now reads:

```ts
return attempt.in(this, async function* () {
  const config = this.#path.configFor(name);
  if (config?.confirmCreation) {
    const confirmed = yield* this.#modals
      .open(confirmCreationModal, { journalName: name, noteName: this.#basename(path) })
      .mapErr(() => new UserAborted("confirm-creation") as NoteCreationError);
    if (!confirmed) return yield* new Err(new UserAborted("confirm-creation"));
  }
  this.#markExpected(path);
  const createResult = await this.#notes.create(path, "");
  if (createResult.isErr()) {
    this.#clearExpected(path);
    return yield* new Err(createResult.error as NoteCreationError);
  }
  const content = yield* this.#content.renderFor(name, metadata, this.#basename(path), path);
  if (content !== "") yield* this.#notes.write(path, content);
  yield* this.#notes.updateFrontmatter(path, mutator);
  return { path, created: true as const };
});
```

- [ ] **Step 4: Run the tests to verify they still pass**

Run: `npm test -- src/journals/notes/note-creation.test.ts`
Expected: PASS (all describe blocks, including the existing `note_name binding` and `attachNote` tests, and the new Templater block).

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS.

```bash
git add src/journals/notes/note-creation.ts src/journals/notes/note-creation.test.ts
git commit -m "feat(journals/notes/note-creation): create empty note before rendering content"
```

---

## Task 6: Cursor jump in `OpenJournalEntryFlow`

After opening a note the flow just created, jump the editor cursor to the next Templater cursor marker.

**Files:**

- Modify: `src/journals/flows/open-journal-entry.ts`
- Test: `src/journals/flows/open-journal-entry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this describe block to the end of `src/journals/flows/open-journal-entry.test.ts`:

```ts
describe("OpenJournalEntryFlow — cursor jump", () => {
  it("jumps the cursor after opening a newly created note", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const workspace = new FakeWorkspaceService();
    const templater = new FakeTemplaterService();
    await build(settings, notes, workspace, new FakeModalService(), templater)
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });
    expect(templater.cursorJumps).toEqual(["2026-05-19.md"]);
  });

  it("does not jump the cursor when the note already existed", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    notes.seed("2026-05-19.md" as VaultPath, "existing");
    const workspace = new FakeWorkspaceService();
    const templater = new FakeTemplaterService();
    await build(settings, notes, workspace, new FakeModalService(), templater)
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });
    expect(templater.cursorJumps).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/journals/flows/open-journal-entry.test.ts`
Expected: FAIL — `templater.cursorJumps` is empty in the first test (the flow does not call `cursorJump` yet).

- [ ] **Step 3: Add the cursor jump to the flow**

Replace the entire contents of `src/journals/flows/open-journal-entry.ts` with:

```ts
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Flow } from "@/infrastructure/flows";
import { TemplaterService, WorkspaceService } from "@/infrastructure/host";
import type { OpenMode, VaultPath, WorkspaceOpenError } from "@/infrastructure/host";
import { attempt } from "@/infrastructure/result";
import type { AsyncResult } from "@/infrastructure/result";

import { FrontmatterService } from "../frontmatter";
import { NoteCreationService } from "../notes/note-creation";

import type { NoteCreationError } from "../notes/note-creation";

export interface OpenJournalEntryParameters {
  journalName: string;
  anchor: AnchorString;
  openMode?: OpenMode;
}

export interface OpenJournalEntryResult {
  path: VaultPath;
  created: boolean;
}

export class OpenJournalEntryFlow implements Flow<
  OpenJournalEntryParameters,
  OpenJournalEntryResult,
  NoteCreationError | WorkspaceOpenError
> {
  readonly #frontmatter = inject(FrontmatterService);
  readonly #creation = inject(NoteCreationService);
  readonly #workspace = inject(WorkspaceService);
  readonly #templater = inject(TemplaterService);

  execute(p: OpenJournalEntryParameters): AsyncResult<OpenJournalEntryResult, NoteCreationError | WorkspaceOpenError> {
    return attempt.in(this, async function* (this: OpenJournalEntryFlow) {
      const metadata = yield* this.#frontmatter.buildMetadata(p.journalName, p.anchor);
      const { path, created } = yield* this.#creation.ensureNote(p.journalName, metadata);
      yield* this.#workspace.openNote(path, p.openMode ?? "active");
      if (created) yield* this.#templater.cursorJump(path);
      return { path, created };
    });
  }
}
```

(`cursorJump` returns `AsyncResult<void, never>`, so the flow's error union is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/journals/flows/open-journal-entry.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS.

```bash
git add src/journals/flows/open-journal-entry.ts src/journals/flows/open-journal-entry.test.ts
git commit -m "feat(journals/flows): jump Templater cursor after opening a new note"
```

---

## Task 7: Paraglide messages

Add the i18n messages for the support hint and caveats modal, then recompile the Paraglide output.

**Files:**

- Modify: `messages/en.json`
- Modify (generated): `src/i18n/paraglide/**`

- [ ] **Step 1: Add the message keys**

Add these keys to `messages/en.json` (the file is a flat JSON object of key/string pairs — insert them anywhere among the existing keys; keep valid JSON):

```json
"journal_edit_templater_supported": "Templater syntax is {slot}.",
"journal_edit_templater_supported_link": "supported",
"templater_support_modal_title": "Templater caveats",
"templater_support_intro": "Templater can interfere with plugin actions, leaving a note partially broken or journal data missing from its frontmatter.",
"templater_support_setup_intro": "The safest setup:",
"templater_support_option_settings": "Configure the template in this plugin's journal settings.",
"templater_support_option_trigger_off": "Disable Templater's \"Trigger Templater on new file creation\".",
"templater_support_option_trigger_on": "Or keep \"Trigger Templater on new file creation\" enabled, with \"Enable Folder Templates\" on and no folder template configured.",
"templater_support_outro": "This way only the journal plugin processes the note template — it runs Templater itself under the hood — which avoids conflicts."
```

- [ ] **Step 2: Recompile Paraglide**

Run: `npm run compile:i18n`
Expected: regenerates `src/i18n/paraglide/messages.js` and `src/i18n/paraglide/messages/*` with the new message functions.

- [ ] **Step 3: Verify the messages type-check**

Run: `npm run check:types`
Expected: PASS — `m.journal_edit_templater_supported`, `m.templater_support_modal_title`, etc. now exist. `m.journal_edit_templater_supported` is a function taking `{ slot: string }`.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json src/i18n/paraglide
git commit -m "feat(i18n): add Templater support hint and caveats messages"
```

---

## Task 8: Templater caveats modal

The modal explaining how to configure Templater to avoid conflicts, plus its `defineModal` definition.

**Files:**

- Create: `src/journals/settings/ui/TemplaterSupportModal.vue`
- Create: `src/journals/settings/ui/templater-support-modal.ts`
- Test: `src/journals/settings/ui/TemplaterSupportModal.test.ts`

- [ ] **Step 1: Write the failing test**

`src/journals/settings/ui/TemplaterSupportModal.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import TemplaterSupportModal from "./TemplaterSupportModal.vue";

afterEach(() => cleanup());

describe("TemplaterSupportModal", () => {
  it("lists the three safe-setup options", () => {
    render(TemplaterSupportModal);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/journals/settings/ui/TemplaterSupportModal.test.ts`
Expected: FAIL — `TemplaterSupportModal.vue` does not exist.

- [ ] **Step 3: Create the modal component**

`src/journals/settings/ui/TemplaterSupportModal.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
</script>

<template>
  <div class="templater-support">
    <p>{{ m.templater_support_intro() }}</p>
    <p>{{ m.templater_support_setup_intro() }}</p>
    <ul>
      <li>{{ m.templater_support_option_settings() }}</li>
      <li>{{ m.templater_support_option_trigger_off() }}</li>
      <li>{{ m.templater_support_option_trigger_on() }}</li>
    </ul>
    <p>{{ m.templater_support_outro() }}</p>
  </div>
</template>
```

- [ ] **Step 4: Create the modal definition**

`src/journals/settings/ui/templater-support-modal.ts`:

```ts
import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import TemplaterSupportModal from "./TemplaterSupportModal.vue";

import type { Component } from "vue";

export const templaterSupportModal: ModalDefinition<Record<string, never>, void> = defineModal({
  component: TemplaterSupportModal as Component,
  title: () => m.templater_support_modal_title(),
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/journals/settings/ui/TemplaterSupportModal.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS.

```bash
git add src/journals/settings/ui/TemplaterSupportModal.vue src/journals/settings/ui/templater-support-modal.ts src/journals/settings/ui/TemplaterSupportModal.test.ts
git commit -m "feat(journals/settings/ui): add Templater caveats modal"
```

---

## Task 9: `TemplaterSupportHint` component

The settings-UI hint: when Templater is installed, it shows one line with a link to the caveats modal; otherwise it renders nothing.

**Files:**

- Create: `src/journals/settings/ui/TemplaterSupportHint.vue`
- Test: `src/journals/settings/ui/TemplaterSupportHint.test.ts`

- [ ] **Step 1: Write the failing test**

`src/journals/settings/ui/TemplaterSupportHint.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService, TemplaterService } from "@/infrastructure/host";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeTemplaterService } from "@/infrastructure/host/testing";

import { templaterSupportModal } from "./templater-support-modal";
import TemplaterSupportHint from "./TemplaterSupportHint.vue";

afterEach(() => cleanup());

function build(supported: boolean) {
  const modals = new FakeModalService();
  const templater = new FakeTemplaterService();
  templater.setSupported(supported);
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(TemplaterService).useValue(templater as unknown as TemplaterService);
  return { modals, container };
}

function mountHint(container: Container) {
  render(TemplaterSupportHint, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

describe("TemplaterSupportHint", () => {
  it("renders nothing when Templater is not supported", () => {
    const { container } = build(false);
    mountHint(container);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the support hint link when Templater is supported", () => {
    const { container } = build(true);
    mountHint(container);
    expect(screen.getByRole("link")).toBeTruthy();
  });

  it("opens the caveats modal when the link is clicked", async () => {
    const { modals, container } = build(true);
    mountHint(container);
    await userEvent.click(screen.getByRole("link"));
    expect(modals.lastOpen().definition).toBe(templaterSupportModal);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/journals/settings/ui/TemplaterSupportHint.test.ts`
Expected: FAIL — `TemplaterSupportHint.vue` does not exist.

- [ ] **Step 3: Create the component**

`src/journals/settings/ui/TemplaterSupportHint.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService, TemplaterService } from "@/infrastructure/host";

import I18nWithSlot from "./I18nWithSlot.vue";
import { templaterSupportModal } from "./templater-support-modal";

const templater = useService(TemplaterService);
const modals = useService(ModalService);
const supported = templater.isSupported();

function show(event: Event): void {
  event.preventDefault();
  void modals.open(templaterSupportModal, {});
}
</script>

<template>
  <I18nWithSlot v-if="supported" :message="m.journal_edit_templater_supported">
    <a href="#" @click="show">{{ m.journal_edit_templater_supported_link() }}</a>
  </I18nWithSlot>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/journals/settings/ui/TemplaterSupportHint.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS.

```bash
git add src/journals/settings/ui/TemplaterSupportHint.vue src/journals/settings/ui/TemplaterSupportHint.test.ts
git commit -m "feat(journals/settings/ui): add TemplaterSupportHint"
```

---

## Task 10: Show the hint in the journal-edit Templates section

Place `TemplaterSupportHint` in the Templates collapsible block of the journal-edit page. This is UI wiring — not unit-tested.

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`

- [ ] **Step 1: Import the component**

In `src/journals/settings/ui/JournalEditSubpage.vue`, add this import alongside the other local component imports (near the `TemplatePathPreview` / `VariableReferenceHint` imports):

```ts
import TemplaterSupportHint from "./TemplaterSupportHint.vue";
```

- [ ] **Step 2: Render the hint in the Templates section description**

In the Templates `UiCollapsibleBlock`, the `#description` slot currently contains a `<div>` with the templates description and a `<VariableReferenceHint context="template-path" .../>`. Add `<TemplaterSupportHint />` immediately after that `VariableReferenceHint`, so the block reads:

```vue
<UiSettingRow>
        <template #description>
          <div>{{ m.journal_edit_templates_description() }}</div>
          <VariableReferenceHint
            context="template-path"
            :journal-name="journalName"
            :date-format="config.dateFormat"
            :has-cycle="hasCycle"
            :numbering-variable-names="numberingVariableNames"
          />
          <TemplaterSupportHint />
        </template>
      </UiSettingRow>
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: PASS.

Run: `npm run test:e2e:smoke`
Expected: PASS (per-spec smoke gate).

- [ ] **Step 4: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue
git commit -m "feat(journals/settings/ui): show Templater support hint in templates section"
```

---

## Done

All ten tasks complete the v3 Templater bridge: content application during note creation and auto-attach, cursor jump after opening a newly-created note, and the settings-UI support hint. Run the full e2e suite (`npm run test:e2e`) in CI before pushing.
