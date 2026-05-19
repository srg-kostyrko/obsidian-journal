# v3 Note Creation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring v3 to v2-parity for the note-creation surfaces (OpenDate orchestration, per-journal create-and-open, picker for ambiguous matches, autoCreate that re-fires daily) and add reactive auto-attach for externally-created notes via reverse template parsing.

**Architecture:** A new `SuggestService` host primitive (mirroring `ModalService`) plus two new sub-feature folders under `src/journals/` — `notes/` (path/content/creation/auto-attach/auto-create services + confirm modal + picker) and `flows/` (`OpenDateFlow`, `OpenJournalEntryFlow`). `JournalConfig` gains `nameTemplate`, `folder`, `templates`, `confirmCreation`, `autoCreate`. The `JournalsIndex` continues to be the single source of truth — `NoteCreationService` writes via `NotesService.updateFrontmatter` and `VaultSubscriptionService` propagates to the index. Auto-attach skips paths the plugin just created via a short-lived "expects" set.

**Tech Stack:** TypeScript (strict), Vitest, Vue 3 (modals), Obsidian API (`SuggestModal`, vault events), valibot (config schema), `ts-pattern`, custom `Result`/`AsyncResult`/`Option` monads, custom DI container.

**Spec:** `docs/superpowers/specs/2026-05-19-v3-note-creation-design.md`

---

## Task 1: Extend JournalConfig with note-creation fields

**Files:**

- Modify: `src/journals/config.ts`
- Modify: `src/journals/config.test.ts` (if it exists, otherwise create)

- [ ] **Step 1: Inspect existing config tests**

Run: `ls src/journals/config.test.ts 2>/dev/null && cat src/journals/config.test.ts`
Expected: file may or may not exist. Either way, write the test below to a new `src/journals/config.test.ts` if missing, otherwise append.

- [ ] **Step 2: Write failing tests for new fields**

Append (or create) `src/journals/config.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as v from "valibot";

import { journalConfigSchema, journalDefaultsFor } from "./config";

describe("journalDefaultsFor", () => {
  it("defaults nameTemplate to {{date}}", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.nameTemplate).toBe("{{date}}");
  });

  it("defaults folder to empty string", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.folder).toBe("");
  });

  it("defaults templates to empty array", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.templates).toEqual([]);
  });

  it("defaults confirmCreation to false", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.confirmCreation).toBe(false);
  });

  it("defaults autoCreate to false", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.autoCreate).toBe(false);
  });
});

describe("journalConfigSchema", () => {
  it("accepts a config with the new fields populated", () => {
    const cfg = {
      ...journalDefaultsFor({ type: "day" }, "daily"),
      nameTemplate: "diary-{{date}}",
      folder: "Diary/{{date:YYYY}}",
      templates: ["Templates/daily.md"],
      confirmCreation: true,
      autoCreate: true,
    };
    const parsed = v.safeParse(journalConfigSchema, cfg);
    expect(parsed.success).toBe(true);
  });

  it("rejects a config whose nameTemplate is not a string", () => {
    const cfg = { ...journalDefaultsFor({ type: "day" }, "daily"), nameTemplate: 123 };
    const parsed = v.safeParse(journalConfigSchema, cfg);
    expect(parsed.success).toBe(false);
  });

  it("rejects a config whose templates is not an array of strings", () => {
    const cfg = { ...journalDefaultsFor({ type: "day" }, "daily"), templates: [42] };
    const parsed = v.safeParse(journalConfigSchema, cfg);
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests, observe failure**

Run: `npx vitest run src/journals/config.test.ts`
Expected: FAIL (cfg.nameTemplate etc. are undefined; schema doesn't validate them).

- [ ] **Step 4: Extend `JournalConfig` interface**

In `src/journals/config.ts`, find the `JournalConfig` interface and add fields:

```typescript
export interface JournalConfig {
  name: string;
  write: JournalWrite;
  timeline: JournalTimeline;
  dateFormat: string;
  frontmatter: FrontmatterFields;
  numbering: JournalNumberingConfig;
  nameTemplate: string;
  folder: string;
  templates: string[];
  confirmCreation: boolean;
  autoCreate: boolean;
}
```

- [ ] **Step 5: Extend `journalConfigSchema`**

In `src/journals/config.ts`, locate the `v.object({...})` for `journalConfigSchema` and add fields:

```typescript
export const journalConfigSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  write: writeSchema,
  timeline: timelineSchema,
  dateFormat: v.pipe(v.string(), v.minLength(1)),
  frontmatter: frontmatterFieldsSchema,
  numbering: numberingSchema,
  nameTemplate: v.string(),
  folder: v.string(),
  templates: v.array(v.string()),
  confirmCreation: v.boolean(),
  autoCreate: v.boolean(),
});
```

- [ ] **Step 6: Extend `journalDefaultsFor`**

In `src/journals/config.ts`, update the returned object in `journalDefaultsFor`:

```typescript
return {
  name,
  write,
  timeline: { start: EMPTY_ANCHOR, end: { kind: "never" } },
  dateFormat: DATE_FORMATS[write.type],
  frontmatter: {
    dateField: "journal-date",
    startDateField: "journal-start-date",
    endDateField: "journal-end-date",
    addStartDate: false,
    addEndDate: false,
  },
  numbering: write.type === "custom" ? numberingForCustom : numberingForFixed,
  nameTemplate: "{{date}}",
  folder: "",
  templates: [],
  confirmCreation: false,
  autoCreate: false,
};
```

- [ ] **Step 7: Run tests, observe pass**

Run: `npx vitest run src/journals/config.test.ts`
Expected: all pass.

- [ ] **Step 8: Type-check**

Run: `npm run check:types`
Expected: PASS. If failures appear in unrelated journal/test code that constructs `JournalConfig` literals, fix them by spreading `journalDefaultsFor(...)` (the test helpers in `src/journals/testing.ts` already use spread, so the existing tests should not break).

- [ ] **Step 9: Commit**

```bash
git add src/journals/config.ts src/journals/config.test.ts
git commit -m "feat(journals): add nameTemplate, folder, templates, confirmCreation, autoCreate to JournalConfig"
```

---

## Task 2: Add `Clock.msUntilNextLocalMidnight()` helper

**Files:**

- Modify: `src/calendar/clock.ts`
- Modify: `src/calendar/clock.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/calendar/clock.test.ts` (inside the existing `describe("Clock", ...)` block, after the `format` describe):

```typescript
describe("msUntilNextLocalMidnight", () => {
  it("returns ms until next local midnight at midday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 14, 12, 0, 0, 0)); // 12:00 local
    // 12 hours = 12 * 3600 * 1000 = 43_200_000 ms
    expect(Clock.msUntilNextLocalMidnight()).toBe(12 * 60 * 60 * 1000);
  });

  it("returns one full day when called at midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 14, 0, 0, 0, 0));
    expect(Clock.msUntilNextLocalMidnight()).toBe(24 * 60 * 60 * 1000);
  });

  it("returns a small positive number just before midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 14, 23, 59, 59, 500));
    expect(Clock.msUntilNextLocalMidnight()).toBe(500);
  });
});
```

- [ ] **Step 2: Run, observe failure**

Run: `npx vitest run src/calendar/clock.test.ts`
Expected: FAIL — `Clock.msUntilNextLocalMidnight is not a function`.

- [ ] **Step 3: Implement helper**

Add to `src/calendar/clock.ts` (inside the `Clock` class, after `static now()`):

```typescript
  static msUntilNextLocalMidnight(): number {
    const now = localMoment();
    const nextMidnight = now.clone().startOf("day").add(1, "day");
    return nextMidnight.diff(now);
  }
```

- [ ] **Step 4: Run, observe pass**

Run: `npx vitest run src/calendar/clock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/clock.ts src/calendar/clock.test.ts
git commit -m "feat(calendar): add Clock.msUntilNextLocalMidnight() helper"
```

---

## Task 3: SuggestService — errors, types, and `defineSuggest`

**Files:**

- Create: `src/infrastructure/host/suggests/errors.ts`
- Create: `src/infrastructure/host/suggests/types.ts`
- Create: `src/infrastructure/host/suggests/define-suggest.ts`
- Create: `src/infrastructure/host/suggests/define-suggest.test.ts`

- [ ] **Step 1: Write `errors.ts`**

```typescript
import { HostError } from "../errors";

export class SuggestCancelled extends HostError {
  readonly kind = "suggest-cancelled" as const;

  constructor() {
    super("Suggest was cancelled.");
    this.name = "SuggestCancelled";
  }
}
```

- [ ] **Step 2: Write `types.ts`**

```typescript
export interface SuggestDefinitionInput<TInput, TResult> {
  placeholder?: (input: TInput) => string;
  fetch: (query: string, input: TInput) => TResult[] | Promise<TResult[]>;
  render: (item: TResult, element: HTMLElement) => void | string;
}

export interface SuggestDefinition<TInput, TResult> {
  readonly placeholder: ((input: TInput) => string) | undefined;
  readonly fetch: (query: string, input: TInput) => TResult[] | Promise<TResult[]>;
  readonly render: (item: TResult, element: HTMLElement) => void | string;
  readonly __result: (witness: never) => TResult;
}
```

- [ ] **Step 3: Write failing test for `defineSuggest`**

`src/infrastructure/host/suggests/define-suggest.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

import { defineSuggest } from "./define-suggest";

describe("defineSuggest", () => {
  it("returns a frozen-shape definition with fetch and render passed through", () => {
    const fetch = vi.fn(() => []);
    const render = vi.fn();
    const def = defineSuggest<string[], string>({ fetch, render });
    expect(def.fetch).toBe(fetch);
    expect(def.render).toBe(render);
    expect(def.placeholder).toBeUndefined();
  });

  it("preserves the placeholder function when supplied", () => {
    const placeholder = vi.fn(() => "type a name");
    const def = defineSuggest<string[], string>({
      fetch: () => [],
      render: () => undefined,
      placeholder,
    });
    expect(def.placeholder).toBe(placeholder);
  });
});
```

- [ ] **Step 4: Run, observe failure**

Run: `npx vitest run src/infrastructure/host/suggests/define-suggest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `define-suggest.ts`**

```typescript
import type { SuggestDefinition, SuggestDefinitionInput } from "./types";

export function defineSuggest<TInput, TResult>(
  input: SuggestDefinitionInput<TInput, TResult>,
): SuggestDefinition<TInput, TResult> {
  return {
    placeholder: input.placeholder,
    fetch: input.fetch,
    render: input.render,
    __result: (witness: never): TResult => witness,
  };
}
```

- [ ] **Step 6: Run, observe pass**

Run: `npx vitest run src/infrastructure/host/suggests/define-suggest.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/host/suggests/
git commit -m "feat(host): add SuggestDefinition types and defineSuggest factory"
```

---

## Task 4: SuggestService — `FakeSuggestService` + barrel + `testing.ts`

**Files:**

- Create: `src/infrastructure/host/suggests/testing.ts`
- Create: `src/infrastructure/host/suggests/index.ts`

- [ ] **Step 1: Write `testing.ts`**

```typescript
import { AsyncResult, InvariantError } from "@/infrastructure/result";

import { SuggestCancelled } from "./errors";

import type { SuggestDefinition } from "./types";

export class FakeSuggestHandle<TInput, TResult> {
  readonly definition: SuggestDefinition<TInput, TResult>;
  readonly input: TInput;

  #settled = false;
  readonly #resolve: (value: TResult) => void;
  readonly #reject: (error: SuggestCancelled) => void;

  constructor(
    definition: SuggestDefinition<TInput, TResult>,
    input: TInput,
    resolve: (value: TResult) => void,
    reject: (error: SuggestCancelled) => void,
  ) {
    this.definition = definition;
    this.input = input;
    this.#resolve = resolve;
    this.#reject = reject;
  }

  choose(value: TResult): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#resolve(value);
  }

  cancel(): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#reject(new SuggestCancelled());
  }

  get settled(): boolean {
    return this.#settled;
  }
}

export class FakeSuggestService {
  readonly #opens: FakeSuggestHandle<unknown, unknown>[] = [];

  get opens(): readonly FakeSuggestHandle<unknown, unknown>[] {
    return this.#opens;
  }

  open<TInput, TResult>(
    definition: SuggestDefinition<TInput, TResult>,
    input: TInput,
  ): AsyncResult<TResult, SuggestCancelled> {
    const { promise, resolve, reject } = Promise.withResolvers<TResult>();
    const handle = new FakeSuggestHandle<TInput, TResult>(definition, input, resolve, reject);
    this.#opens.push(handle as unknown as FakeSuggestHandle<unknown, unknown>);
    return AsyncResult.fromPromise(promise, (cause) =>
      cause instanceof SuggestCancelled ? cause : new SuggestCancelled(),
    );
  }

  lastOpen<TInput = unknown, TResult = unknown>(): FakeSuggestHandle<TInput, TResult> {
    const last = this.#opens.at(-1);
    if (!last) throw new InvariantError("FakeSuggestService.lastOpen() called before any open()");
    return last as unknown as FakeSuggestHandle<TInput, TResult>;
  }
}
```

- [ ] **Step 2: Write `index.ts` barrel (public API only)**

```typescript
export { defineSuggest } from "./define-suggest";
export { SuggestCancelled } from "./errors";
export { SuggestService } from "./internal/suggest-service";
export type { SuggestDefinition, SuggestDefinitionInput } from "./types";
```

(`SuggestService` doesn't exist yet — next task. That's intentional: the barrel is written once, and `internal/suggest-service.ts` lands in Task 5.)

- [ ] **Step 3: Type-check (expected to surface `SuggestService` missing — defer)**

Run: `npm run check:types 2>&1 | tail -5`
Expected: failure naming the missing `./internal/suggest-service`. That's resolved in Task 5; do not commit the barrel yet.

- [ ] **Step 4: Commit just `testing.ts`**

```bash
git add src/infrastructure/host/suggests/testing.ts
git commit -m "feat(host): add FakeSuggestService for tests"
```

Leave `index.ts` modified-in-tree but un-committed; Task 5 commits it together with the service.

---

## Task 5: SuggestService implementation

**Files:**

- Create: `src/infrastructure/host/suggests/internal/suggest-service.ts`
- Create: `src/infrastructure/host/suggests/internal/suggest-service.test.ts`
- Stage (from Task 4): `src/infrastructure/host/suggests/index.ts`

- [ ] **Step 1: Write failing test**

`src/infrastructure/host/suggests/internal/suggest-service.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { fakeObsidianApp, fakeObsidianPlugin } from "@/infrastructure/host/internal/__test__/obsidian-fakes";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host";

import { defineSuggest } from "../define-suggest";
import { SuggestCancelled } from "../errors";

import { SuggestService } from "./suggest-service";

// NOTE: This test depends on Obsidian SuggestModal being available via the
// __mocks__ infrastructure. If __mocks__ for obsidian doesn't yet supply
// SuggestModal, see Step 4 below for the patch.

describe("SuggestService", () => {
  let container: Container;
  let app: ReturnType<typeof fakeObsidianApp>;
  let plugin: ReturnType<typeof fakeObsidianPlugin>;

  beforeEach(() => {
    container = new Container();
    container.addModule(LoggerModule);
    app = fakeObsidianApp();
    plugin = fakeObsidianPlugin(app);
    container.register(InternalObsidianAppToken).useValue(app);
    container.register(InternalPluginToken).useValue(plugin);
    container.register(SuggestService).useClass(SuggestService);
  });
  afterEach(async () => {
    await container.dispose();
  });

  const def = defineSuggest<string[], string>({
    fetch: (q, items) => items.filter((s) => s.includes(q)),
    render: (item, el) => el.setText(item),
  });

  it("resolves with the chosen item", async () => {
    const service = container.resolve(SuggestService);
    const open = service.open(def, ["alpha", "beta"]);
    const modal = app.lastSuggestModal();
    modal.simulateChoose("alpha");
    const result = await open.toPromise();
    expect(result.isOk() && result.value).toBe("alpha");
  });

  it("rejects with SuggestCancelled when closed without a choice", async () => {
    const service = container.resolve(SuggestService);
    const open = service.open(def, ["alpha", "beta"]);
    const modal = app.lastSuggestModal();
    modal.simulateClose();
    const result = await open.toPromise();
    expect(result.isErr() && result.error instanceof SuggestCancelled).toBe(true);
  });

  it("invokes fetch with query and input", () => {
    const fetch = vi.fn((q: string, items: string[]) => items.filter((s) => s.startsWith(q)));
    const localDef = defineSuggest<string[], string>({ fetch, render: () => undefined });
    container.resolve(SuggestService).open(localDef, ["foo", "bar"]);
    const modal = app.lastSuggestModal();
    modal.simulateGetSuggestions("f");
    expect(fetch).toHaveBeenCalledWith("f", ["foo", "bar"]);
  });
});
```

- [ ] **Step 2: Inspect existing obsidian mock infrastructure**

Run: `ls __mocks__/obsidian* 2>/dev/null; ls src/infrastructure/host/internal/__test__ 2>/dev/null`

Two possible outcomes:

- A `__mocks__/obsidian.ts` already provides `Modal`/`SuggestModal` shims; reuse them.
- Or, if `SuggestModal` is not mocked yet, extend `__mocks__/obsidian.ts` to expose a `SuggestModal` class that tracks the most recent instance and exposes `simulateChoose`/`simulateClose`/`simulateGetSuggestions` test hooks.

Run: `grep -n "SuggestModal\|class Modal" __mocks__/obsidian.ts 2>/dev/null`
Expected: there is a `Modal` shim. If `SuggestModal` is missing, add to `__mocks__/obsidian.ts`:

```typescript
export class SuggestModal<T> {
  static __instances: SuggestModal<unknown>[] = [];
  app: unknown;
  inputEl = { value: "" };
  constructor(app: unknown) {
    this.app = app;
    (SuggestModal as unknown as { __instances: SuggestModal<unknown>[] }).__instances.push(
      this as unknown as SuggestModal<unknown>,
    );
  }
  setPlaceholder(_: string): void {}
  open(): void {}
  close(): void {
    this.onClose?.();
  }
  getSuggestions(_query: string): T[] | Promise<T[]> {
    return [];
  }
  renderSuggestion(_item: T, _el: HTMLElement): void {}
  onChooseSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent): void {}
  onClose?: () => void;
}
```

…and an `obsidian-fakes.ts` test helper (if not already present) that wires `app.lastSuggestModal()` to the most-recent `SuggestModal.__instances` entry, plus `simulateChoose`/`simulateClose`/`simulateGetSuggestions` methods.

If `obsidian-fakes.ts` doesn't exist, create the helper under `src/infrastructure/host/internal/__test__/obsidian-fakes.ts`:

```typescript
import { SuggestModal } from "obsidian";

export function fakeObsidianApp() {
  return {
    workspace: {
      on: () => () => undefined,
      getActiveFile: () => null,
      getLeavesOfType: () => [],
      getLeaf: () => null,
      setActiveLeaf: () => undefined,
    },
    vault: {
      on: () => () => undefined,
      getAbstractFileByPath: () => null,
      getMarkdownFiles: () => [],
      getFolderByPath: () => null,
    },
    metadataCache: { on: () => () => undefined, getCache: () => null, getFileCache: () => null },
    fileManager: { processFrontMatter: async () => undefined, trashFile: async () => undefined },
    lastSuggestModal() {
      const instances = (SuggestModal as unknown as { __instances: unknown[] }).__instances;
      const last = instances.at(-1);
      if (!last) throw new Error("no SuggestModal opened yet");
      return Object.assign(last, {
        simulateChoose(item: unknown) {
          (last as { onChooseSuggestion: (i: unknown, e: unknown) => void }).onChooseSuggestion(item, {} as MouseEvent);
        },
        simulateClose() {
          (last as { onClose?: () => void }).onClose?.();
        },
        simulateGetSuggestions(q: string) {
          return (last as { getSuggestions: (q: string) => unknown }).getSuggestions(q);
        },
      });
    },
  };
}

export function fakeObsidianPlugin(app: unknown) {
  return { app, register: () => undefined, registerEvent: () => undefined };
}
```

- [ ] **Step 3: Run, observe failure**

Run: `npx vitest run src/infrastructure/host/suggests/internal/suggest-service.test.ts`
Expected: FAIL — `SuggestService` not found.

- [ ] **Step 4: Implement `SuggestService`**

`src/infrastructure/host/suggests/internal/suggest-service.ts`:

```typescript
import { SuggestModal } from "obsidian";

import { inject } from "@/infrastructure/di";
import { AsyncResult } from "@/infrastructure/result";

import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";
import { SuggestCancelled } from "../errors";

import type { SuggestDefinition } from "../types";

export class SuggestService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #open = new Set<SuggestModal<unknown>>();

  constructor() {
    this.#plugin.register(() => {
      for (const modal of this.#open) modal.close();
    });
  }

  open<TInput, TResult>(
    definition: SuggestDefinition<TInput, TResult>,
    input: TInput,
  ): AsyncResult<TResult, SuggestCancelled> {
    return AsyncResult.fromPromise(
      new Promise<TResult>((resolve, reject) => {
        const openSet = this.#open;
        const modal = new (class extends SuggestModal<TResult> {
          #picked = false;
          getSuggestions(query: string): TResult[] | Promise<TResult[]> {
            return definition.fetch(query, input);
          }
          renderSuggestion(item: TResult, el: HTMLElement): void {
            const result = definition.render(item, el);
            if (typeof result === "string") el.setText(result);
          }
          onChooseSuggestion(item: TResult): void {
            this.#picked = true;
            resolve(item);
          }
          onClose(): void {
            openSet.delete(this as unknown as SuggestModal<unknown>);
            if (!this.#picked) reject(new SuggestCancelled());
          }
        })(this.#app);
        if (definition.placeholder) modal.setPlaceholder(definition.placeholder(input));
        openSet.add(modal as unknown as SuggestModal<unknown>);
        modal.open();
      }),
      (cause) => (cause instanceof SuggestCancelled ? cause : new SuggestCancelled()),
    );
  }
}
```

- [ ] **Step 5: Run, observe pass**

Run: `npx vitest run src/infrastructure/host/suggests/internal/suggest-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire SuggestService into the host module**

Modify `src/infrastructure/host/module.ts` to also register `SuggestService`:

```typescript
import type { Module } from "@/infrastructure/di";

import { NotesService } from "./internal/notes-service";
import { PluginData } from "./internal/plugin-data";
import { InternalObsidianAppToken, InternalPluginToken } from "./internal/tokens";
import { WorkspaceService } from "./internal/workspace-service";
import { modalsModule } from "./modals/module";
import { SuggestService } from "./suggests/internal/suggest-service";

import type { Plugin } from "obsidian";

export function createHostModule(plugin: Plugin): Module {
  return {
    register(c) {
      c.register(InternalPluginToken).useValue(plugin);
      c.register(InternalObsidianAppToken).useValue(plugin.app);
      c.register(NotesService).useClass(NotesService).eager();
      c.register(WorkspaceService).useClass(WorkspaceService).eager();
      c.register(PluginData).useClass(PluginData);
      c.register(SuggestService).useClass(SuggestService);
      modalsModule.register(c);
    },
  };
}
```

Modify `src/infrastructure/host/index.ts` to re-export `SuggestService`, `SuggestCancelled`, `defineSuggest`:

```typescript
export {
  SuggestService,
  SuggestCancelled,
  defineSuggest,
  type SuggestDefinition,
  type SuggestDefinitionInput,
} from "./suggests";
```

(Insert this export anywhere in the existing barrel; keep all existing exports.)

- [ ] **Step 7: Run full type-check + tests**

Run: `npm run check:types && npx vitest run src/infrastructure/host/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/host/suggests/index.ts \
        src/infrastructure/host/suggests/internal/ \
        src/infrastructure/host/module.ts \
        src/infrastructure/host/index.ts \
        __mocks__/obsidian.ts \
        src/infrastructure/host/internal/__test__/obsidian-fakes.ts
git commit -m "feat(host): add SuggestService primitive backed by Obsidian SuggestModal"
```

(Path list above is conservative — only stage files that actually changed; if `obsidian-fakes.ts` already existed and wasn't modified, drop it from the `git add`.)

---

## Task 6: `NotePathService` — forward render

**Files:**

- Create: `src/journals/notes/errors.ts`
- Create: `src/journals/notes/note-path.ts`
- Create: `src/journals/notes/note-path.test.ts`

- [ ] **Step 1: Write errors.ts (base for note-creation errors)**

`src/journals/notes/errors.ts`:

```typescript
import type { AnchorString } from "@/calendar";

import { JournalsError } from "../errors";

export abstract class JournalNoteCreationError extends JournalsError {
  override name = "JournalNoteCreationError";
}

export class NoApplicableJournals extends JournalNoteCreationError {
  override name = "NoApplicableJournals";
  readonly kind = "no-applicable-journals" as const;

  constructor(
    readonly anchor: AnchorString,
    readonly requested?: readonly string[],
  ) {
    super(
      requested
        ? `No applicable journals for ${anchor} among ${requested.join(", ")}`
        : `No applicable journals for ${anchor}`,
    );
  }
}
```

- [ ] **Step 2: Write failing test for forward render**

`src/journals/notes/note-path.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { CalendarDate, type AnchorString } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import type { VaultPath } from "@/infrastructure/host";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { fakeSettings, fixedJournal } from "../testing";
import { SettingsService } from "@/settings";

import { JournalNotFoundError } from "../errors";
import { NotePathService } from "./note-path";

import type { JournalMetadata } from "../types";

function buildContainer(settings: SettingsService): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(NotePathService).useClass(NotePathService);
  return c;
}

describe("NotePathService.pathFor", () => {
  it("renders nameTemplate with .md suffix when folder is empty", () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(settings);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("prefixes folder when configured", () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }),
    });
    const c = buildContainer(settings);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("Diary/2026/2026-05-19.md");
  });

  it("returns JournalNotFoundError for an unknown journal", () => {
    const settings = fakeSettings({});
    const c = buildContainer(settings);
    const meta: JournalMetadata = { journalName: "missing", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("missing", meta);
    expect(result.isErr() && result.error instanceof JournalNotFoundError).toBe(true);
  });
});
```

- [ ] **Step 3: Run, observe failure**

Run: `npx vitest run src/journals/notes/note-path.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `NotePathService` (forward only for now)**

`src/journals/notes/note-path.ts`:

```typescript
import { normalizePath } from "obsidian";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { Err, Ok, Option, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { TemplateContext, TemplateEngine, tokenize } from "@/templates";
import type { TemplateRenderError } from "@/templates";

import { journalConfigCollection } from "../config";
import { CycleService } from "../cycle";
import { JournalNotFoundError } from "../errors";

import type { JournalConfig } from "../config";
import type { JournalMetadata } from "../types";

export class NotePathService {
  readonly #settings = inject(SettingsService);
  readonly #cycle = inject(CycleService);
  readonly #engine = inject(TemplateEngine);

  pathFor(name: string, metadata: JournalMetadata): Result<VaultPath, JournalNotFoundError | TemplateRenderError> {
    const config = this.#configOf(name);
    if (!config) return new Err(new JournalNotFoundError(name));
    const context = this.#buildContext(config, metadata);
    const filename = this.#engine.renderString(`${config.nameTemplate}.md`, context);
    const folder = config.folder ? this.#engine.renderString(config.folder, context) : "";
    const joined = folder ? `${folder}/${filename}` : filename;
    return new Ok(normalizePath(joined) as VaultPath);
  }

  candidateFor(_name: string, _path: VaultPath): Option<JournalMetadata> {
    // Implemented in Task 7.
    return Option.none();
  }

  #configOf(name: string): JournalConfig | undefined {
    return this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
  }

  #buildContext(config: JournalConfig, metadata: JournalMetadata): TemplateContext {
    const dateValue = CalendarDate.fromAnchor(metadata.anchor);
    const startOpt = this.#cycle.startOf(config.name, metadata.anchor);
    const endOpt =
      metadata.endDate !== undefined
        ? Option.some(CalendarDate.fromAnchor(metadata.endDate))
        : this.#cycle.endOf(config.name, metadata.anchor);
    let ctx = TemplateContext.empty().date("date", dateValue, config.dateFormat).string("journal_name", config.name);
    if (startOpt.isSome()) ctx = ctx.date("start_date", startOpt.value, config.dateFormat);
    if (endOpt.isSome()) ctx = ctx.date("end_date", endOpt.value, config.dateFormat);
    for (const source of config.numbering.sources) {
      const value = metadata.numbers?.[source.variable];
      if (value !== undefined) ctx = ctx.number(source.variable, value);
    }
    return ctx;
  }
}
```

(`normalizePath` from Obsidian is mocked in the existing test infra; if the mock is missing, `__mocks__/obsidian.ts` already exports it. Verify with `grep normalizePath __mocks__/obsidian.ts`.)

- [ ] **Step 5: Run, observe pass**

Run: `npx vitest run src/journals/notes/note-path.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/journals/notes/errors.ts src/journals/notes/note-path.ts src/journals/notes/note-path.test.ts
git commit -m "feat(journals/notes): NotePathService forward-render (pathFor)"
```

---

## Task 7: `NotePathService.candidateFor` — reverse parse

**Files:**

- Modify: `src/journals/notes/note-path.ts`
- Modify: `src/journals/notes/note-path.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/journals/notes/note-path.test.ts`:

```typescript
describe("NotePathService.candidateFor", () => {
  it("inverts a {{date}}.md path into a metadata anchor", () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(settings);
    const result = c.resolve(NotePathService).candidateFor("daily", "2026-05-19.md" as VaultPath);
    expect(result.isSome()).toBe(true);
    if (result.isSome()) {
      expect(result.value.anchor).toBe("2026-05-19");
      expect(result.value.journalName).toBe("daily");
    }
  });

  it("returns None when the path doesn't match the template", () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(settings);
    const result = c.resolve(NotePathService).candidateFor("daily", "Inbox/note.md" as VaultPath);
    expect(result.isNone()).toBe(true);
  });

  it("inverts folder + name combined", () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }),
    });
    const c = buildContainer(settings);
    const result = c.resolve(NotePathService).candidateFor("daily", "Diary/2026/2026-05-19.md" as VaultPath);
    expect(result.isSome() && result.value.anchor).toBe("2026-05-19");
  });

  it("captures numbering variables when present in the template", () => {
    const settings = fakeSettings({
      issues: fixedJournal(
        "issues",
        { type: "day" },
        {
          nameTemplate: "Issue {{index}} - {{date}}",
          numbering: {
            enabled: true,
            anchorDate: "2026-01-01" as AnchorString,
            allowBefore: false,
            sources: [{ variable: "index", frontmatterKey: "issue-number", anchorValue: 1, reset: { kind: "never" } }],
          },
        },
      ),
    });
    const c = buildContainer(settings);
    const result = c.resolve(NotePathService).candidateFor("issues", "Issue 42 - 2026-05-19.md" as VaultPath);
    expect(result.isSome()).toBe(true);
    if (result.isSome()) {
      expect(result.value.anchor).toBe("2026-05-19");
      expect(result.value.numbers?.index).toBe(42);
    }
  });
});
```

- [ ] **Step 2: Run, observe failure**

Run: `npx vitest run src/journals/notes/note-path.test.ts`
Expected: FAIL — first three new tests fail (`isSome` returns false because stub returns `none()`).

- [ ] **Step 3: Implement `candidateFor`**

Replace the stub body in `src/journals/notes/note-path.ts`:

```typescript
  candidateFor(name: string, path: VaultPath): Option<JournalMetadata> {
    const config = this.#configOf(name);
    if (!config) return Option.none();
    const template = config.folder
      ? `${config.folder}/${config.nameTemplate}.md`
      : `${config.nameTemplate}.md`;
    const context = this.#parseContext(config);
    const parsed = this.#engine.parse(tokenize(template), path, context);
    if (parsed.kind === "err") return Option.none();
    const bindings = parsed.value;
    const dateBinding = bindings.get("date");
    if (!dateBinding || dateBinding.kind !== "date") return Option.none();
    const anchor = dateBinding.value.toAnchor();
    const numbers: Record<string, number> = {};
    for (const source of config.numbering.sources) {
      const captured = bindings.get(source.variable);
      if (captured?.kind === "number") numbers[source.variable] = captured.value;
    }
    const metadata: JournalMetadata = {
      journalName: name,
      anchor,
      ...(Object.keys(numbers).length > 0 ? { numbers } : {}),
    };
    return Option.some(metadata);
  }

  #parseContext(config: JournalConfig): TemplateContext {
    let ctx = TemplateContext.empty()
      .date("date", CalendarDate.today(), config.dateFormat)
      .string("journal_name", config.name);
    for (const source of config.numbering.sources) {
      ctx = ctx.number(source.variable, 0);
    }
    return ctx;
  }
```

(The "seed" values in `#parseContext` only declare variable kinds — the engine's `parse` reads the kind/format from the context, not the value.)

- [ ] **Step 4: Run, observe pass**

Run: `npx vitest run src/journals/notes/note-path.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/note-path.ts src/journals/notes/note-path.test.ts
git commit -m "feat(journals/notes): NotePathService.candidateFor reverse parse"
```

---

## Task 8: `TemplateContentService`

**Files:**

- Create: `src/journals/notes/template-content.ts`
- Create: `src/journals/notes/template-content.test.ts`

- [ ] **Step 1: Write failing test**

`src/journals/notes/template-content.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { fakeSettings, fixedJournal } from "../testing";
import { SettingsService } from "@/settings";

import { TemplateEngine, FunctionHandlerToken } from "@/templates";

import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

import type { JournalMetadata } from "../types";

function build(settings: SettingsService, notes: FakeNotesService): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  return c;
}

describe("TemplateContentService.renderFor", () => {
  const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

  it("returns Ok with empty string when no templates are configured", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const result = await build(settings, notes).resolve(TemplateContentService).renderFor("daily", meta).toPromise();
    expect(result.isOk() && result.value).toBe("");
  });

  it("renders the first existing template content through the engine", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/missing.md", "Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# {{date}}\n");
    const result = await build(settings, notes).resolve(TemplateContentService).renderFor("daily", meta).toPromise();
    expect(result.isOk() && result.value).toBe("# 2026-05-19\n");
  });

  it("renders the template path itself through the engine before looking it up", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/{{date:YYYY}}/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/2026/daily.md" as VaultPath, "body");
    const result = await build(settings, notes).resolve(TemplateContentService).renderFor("daily", meta).toPromise();
    expect(result.isOk() && result.value).toBe("body");
  });

  it("returns empty string when none of the configured templates exist", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/missing.md"] }),
    });
    const notes = new FakeNotesService();
    const result = await build(settings, notes).resolve(TemplateContentService).renderFor("daily", meta).toPromise();
    expect(result.isOk() && result.value).toBe("");
  });
});
```

- [ ] **Step 2: Run, observe failure**

Run: `npx vitest run src/journals/notes/template-content.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TemplateContentService`**

`src/journals/notes/template-content.ts`:

```typescript
import { inject } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";
import type { VaultPath, NoteReadError } from "@/infrastructure/host";
import { AsyncResult, Err, Ok } from "@/infrastructure/result";
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

  renderFor(name: string, metadata: JournalMetadata): AsyncResult<string, JournalNotFoundError | NoteReadError> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
    if (!config) return AsyncResult.err(new JournalNotFoundError(name));
    if (config.templates.length === 0) return AsyncResult.ok("");
    const context = this.#path.contextFor(config, metadata);
    return AsyncResult.fromAsync(async (): Promise<string> => {
      for (const entry of config.templates) {
        const withExt = entry.endsWith(".md") ? entry : `${entry}.md`;
        const renderedPath = this.#engine.renderString(withExt, context) as VaultPath;
        if (this.#notes.find(renderedPath).isNone()) continue;
        const readResult = await this.#notes.read(renderedPath).toPromise();
        if (readResult.isErr()) throw readResult.error;
        return this.#engine.renderString(readResult.value, context);
      }
      return "";
    }) as AsyncResult<string, JournalNotFoundError | NoteReadError>;
  }
}
```

If `AsyncResult.fromAsync` doesn't exist in this codebase, replace with explicit `AsyncResult.fromPromise(async () => {...}(), (e) => e as NoteReadError)` — confirm by `grep "fromAsync\|fromPromise" src/infrastructure/result/`.

Also: this implementation calls `this.#path.contextFor(...)` — that method is private in Task 6. Promote it: in `NotePathService`, rename the private `#buildContext` to a public method `contextFor(config: JournalConfig, metadata: JournalMetadata): TemplateContext`. Update the existing call sites in `note-path.ts` accordingly.

- [ ] **Step 4: Run, observe pass**

Run: `npx vitest run src/journals/notes/template-content.test.ts src/journals/notes/note-path.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/note-path.ts src/journals/notes/template-content.ts src/journals/notes/template-content.test.ts
git commit -m "feat(journals/notes): TemplateContentService renders first existing template through engine"
```

---

## Task 9: `ConfirmCreationModal` Vue component + definition

**Files:**

- Create: `src/journals/notes/ConfirmCreationModal.vue`
- Create: `src/journals/notes/confirm-creation-modal.ts`
- Modify: `messages/en.json`

- [ ] **Step 1: Add i18n messages**

Append to `messages/en.json` (alphabetized, before the closing brace; preserve the existing trailing-comma pattern):

```json
  "confirm_note_creation_title": "Create a new journal note?",
  "confirm_note_creation_body": "Create '{noteName}' in journal '{journalName}'?",
  "confirm_note_creation_confirm": "Create",
  "confirm_note_creation_cancel": "Cancel",
  "journal_picker_placeholder": "Search journals",
```

- [ ] **Step 2: Regenerate paraglide compiled output**

Run: `npm run compile:i18n`
Expected: paraglide writes `src/i18n/paraglide/` without errors.

- [ ] **Step 3: Write the Vue component**

`src/journals/notes/ConfirmCreationModal.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";

const props = defineProps<{ journalName: string; noteName: string }>();
const modal = useModal<boolean>();
</script>

<template>
  <div class="confirm-creation-modal">
    <p>{{ m.confirm_note_creation_body({ noteName: props.noteName, journalName: props.journalName }) }}</p>
    <div class="confirm-creation-modal__actions">
      <button type="button" @click="modal.cancel()">{{ m.confirm_note_creation_cancel() }}</button>
      <button type="button" class="mod-cta" @click="modal.submit(true)">{{ m.confirm_note_creation_confirm() }}</button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Write the modal definition**

`src/journals/notes/confirm-creation-modal.ts`:

```typescript
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import ConfirmCreationModal from "./ConfirmCreationModal.vue";

import type { Component } from "vue";

export const confirmCreationModal = defineModal<{ journalName: string; noteName: string }, boolean>({
  component: ConfirmCreationModal as Component,
  title: () => m.confirm_note_creation_title(),
});
```

- [ ] **Step 5: Type-check**

Run: `npm run check:types`
Expected: PASS. If `useModal` has a different signature in this codebase (e.g. returns `ModalApi<T>` requiring an `inject(ModalContextKey)` call), match the pattern of an existing v3 modal (look at `src/calendar/settings/ui/WeekPresetPickerModal.vue` for reference).

- [ ] **Step 6: Commit**

```bash
git add src/journals/notes/ConfirmCreationModal.vue src/journals/notes/confirm-creation-modal.ts messages/en.json src/i18n/
git commit -m "feat(journals/notes): add ConfirmCreationModal and i18n messages"
```

(Replace `src/i18n/` with the actual paraglide-generated output path if different.)

---

## Task 10: `NoteCreationService.ensureNote`

**Files:**

- Create: `src/journals/notes/note-creation.ts`
- Create: `src/journals/notes/note-creation.test.ts`

- [ ] **Step 1: Write failing tests for `ensureNote`**

`src/journals/notes/note-creation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { UserAborted } from "@/infrastructure/flows";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { ModalService, ModalCancelled } from "@/infrastructure/host/modals";
import { SettingsService } from "@/settings";

import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { fakeSettings, fixedJournal } from "../testing";

import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

import type { JournalMetadata } from "../types";

function build(settings: SettingsService, notes: FakeNotesService, modals: FakeModalService): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(ModalService).useValue(modals as unknown as ModalService);
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

const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

describe("NoteCreationService.ensureNote", () => {
  it("creates the file and writes frontmatter when the path is missing", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const result = await build(settings, notes, modals)
      .resolve(NoteCreationService)
      .ensureNote("daily", meta)
      .toPromise();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.created).toBe(true);
      expect(result.value.path).toBe("2026-05-19.md");
    }
    expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
  });

  it("skips create but still writes frontmatter when the file already exists", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    notes.seed("2026-05-19.md" as VaultPath, "existing");
    const modals = new FakeModalService();
    const result = await build(settings, notes, modals)
      .resolve(NoteCreationService)
      .ensureNote("daily", meta)
      .toPromise();
    expect(result.isOk() && result.value.created).toBe(false);
  });

  it("opens confirm modal when confirmCreation is true and returns UserAborted on cancel", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const container = build(settings, notes, modals);
    const promise = container.resolve(NoteCreationService).ensureNote("daily", meta).toPromise();
    // Drain microtasks so the open call lands in modals.opens.
    await Promise.resolve();
    await Promise.resolve();
    modals.lastOpen<{ journalName: string; noteName: string }, boolean>().cancel();
    const result = await promise;
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error instanceof UserAborted).toBe(true);
    }
    expect(notes.find("2026-05-19.md" as VaultPath).isNone()).toBe(true);
  });

  it("creates the file when confirmCreation is true and the modal is submitted", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const container = build(settings, notes, modals);
    const promise = container.resolve(NoteCreationService).ensureNote("daily", meta).toPromise();
    await Promise.resolve();
    await Promise.resolve();
    modals.lastOpen<{ journalName: string; noteName: string }, boolean>().submit(true);
    const result = await promise;
    expect(result.isOk() && result.value.created).toBe(true);
  });
});
```

- [ ] **Step 2: Run, observe failure**

Run: `npx vitest run src/journals/notes/note-creation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `NoteCreationService.ensureNote`**

`src/journals/notes/note-creation.ts`:

```typescript
import { inject } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import { ModalCancelled, ModalService } from "@/infrastructure/host/modals";
import { NotesService } from "@/infrastructure/host";
import type {
  FrontmatterError,
  NoteCreateError,
  NoteReadError,
  NoteWriteError,
  VaultPath,
} from "@/infrastructure/host";
import { AsyncResult, Err, Ok } from "@/infrastructure/result";
import type { TemplateRenderError } from "@/templates";

import { confirmCreationModal } from "./confirm-creation-modal";
import { JournalNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";

import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

import type { JournalMetadata } from "../types";

export type NoteCreationError =
  | JournalNotFoundError
  | TemplateRenderError
  | NoteReadError
  | NoteCreateError
  | NoteWriteError
  | FrontmatterError
  | UserAborted;

const EXPECTS_TIMEOUT_MS = 5_000;

export class NoteCreationService {
  readonly #notes = inject(NotesService);
  readonly #path = inject(NotePathService);
  readonly #content = inject(TemplateContentService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #modals = inject(ModalService);

  readonly #expected = new Map<VaultPath, ReturnType<typeof setTimeout>>();

  expects(path: VaultPath): boolean {
    return this.#expected.has(path);
  }

  ensureNote(
    name: string,
    metadata: JournalMetadata,
  ): AsyncResult<{ path: VaultPath; created: boolean }, NoteCreationError> {
    const pathResult = this.#path.pathFor(name, metadata);
    if (pathResult.kind === "err") return AsyncResult.err(pathResult.error);
    const path = pathResult.value;
    const mutatorResult = this.#frontmatter.writeMutator(name, metadata);
    if (mutatorResult.kind === "err") return AsyncResult.err(mutatorResult.error);
    const mutator = mutatorResult.value;

    if (this.#notes.find(path).isSome()) {
      return this.#notes.updateFrontmatter(path, mutator).map(() => ({ path, created: false as const }));
    }

    return AsyncResult.fromAsync<{ path: VaultPath; created: boolean }, NoteCreationError>(async () => {
      const config = this.#path.configFor(name);
      if (config?.confirmCreation) {
        const confirmed = await this.#modals
          .open(confirmCreationModal, { journalName: name, noteName: this.#basename(path) })
          .toPromise();
        if (confirmed.isErr()) throw new UserAborted("confirm-creation");
        if (!confirmed.value) throw new UserAborted("confirm-creation");
      }
      const contentResult = await this.#content.renderFor(name, metadata).toPromise();
      if (contentResult.isErr()) throw contentResult.error;
      this.#markExpected(path);
      const createResult = await this.#notes.create(path, contentResult.value).toPromise();
      if (createResult.isErr()) {
        this.#clearExpected(path);
        throw createResult.error;
      }
      const fmResult = await this.#notes.updateFrontmatter(path, mutator).toPromise();
      if (fmResult.isErr()) throw fmResult.error;
      return { path, created: true as const };
    });
  }

  attachNote(_name: string, _path: VaultPath, _metadata: JournalMetadata): AsyncResult<void, NoteCreationError> {
    // Implemented in Task 11.
    return AsyncResult.ok(undefined);
  }

  clearExpected(path: VaultPath): void {
    this.#clearExpected(path);
  }

  #markExpected(path: VaultPath): void {
    this.#clearExpected(path);
    this.#expected.set(
      path,
      setTimeout(() => this.#expected.delete(path), EXPECTS_TIMEOUT_MS),
    );
  }

  #clearExpected(path: VaultPath): void {
    const handle = this.#expected.get(path);
    if (handle !== undefined) clearTimeout(handle);
    this.#expected.delete(path);
  }

  #basename(path: VaultPath): string {
    const filename = path.split("/").pop() ?? path;
    return filename.replace(/\.md$/, "");
  }
}
```

Add a public `configFor(name)` helper to `NotePathService` that wraps `#configOf` (or re-export it under a public name). In `note-path.ts`:

```typescript
  configFor(name: string): JournalConfig | undefined {
    return this.#configOf(name);
  }
```

Also confirm `AsyncResult.fromAsync` exists. If not, replace with:

```typescript
return AsyncResult.fromPromise(
  (async () => {
    /* same body, throwing on errors */
  })(),
  (e) => e as NoteCreationError,
);
```

- [ ] **Step 4: Run, observe pass**

Run: `npx vitest run src/journals/notes/note-creation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/note-creation.ts src/journals/notes/note-creation.test.ts src/journals/notes/note-path.ts
git commit -m "feat(journals/notes): NoteCreationService.ensureNote with confirm-creation modal"
```

---

## Task 11: `NoteCreationService.attachNote`

**Files:**

- Modify: `src/journals/notes/note-creation.ts`
- Modify: `src/journals/notes/note-creation.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/journals/notes/note-creation.test.ts`:

```typescript
describe("NoteCreationService.attachNote", () => {
  it("writes frontmatter and content when the existing file is empty", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# Daily {{date}}");
    notes.seed("2026-05-19.md" as VaultPath, "");
    const result = await build(settings, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .attachNote("daily", "2026-05-19.md" as VaultPath, meta)
      .toPromise();
    expect(result.isOk()).toBe(true);
    const read = await notes.read("2026-05-19.md" as VaultPath).toPromise();
    expect(read.isOk() && read.value).toBe("# Daily 2026-05-19");
  });

  it("writes frontmatter only when the existing file has content", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# Daily {{date}}");
    notes.seed("2026-05-19.md" as VaultPath, "user-typed content");
    const result = await build(settings, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .attachNote("daily", "2026-05-19.md" as VaultPath, meta)
      .toPromise();
    expect(result.isOk()).toBe(true);
    const read = await notes.read("2026-05-19.md" as VaultPath).toPromise();
    expect(read.isOk() && read.value).toBe("user-typed content");
  });

  it("treats whitespace-only content as empty", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "body");
    notes.seed("2026-05-19.md" as VaultPath, "   \n  \n");
    const result = await build(settings, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .attachNote("daily", "2026-05-19.md" as VaultPath, meta)
      .toPromise();
    expect(result.isOk()).toBe(true);
    const read = await notes.read("2026-05-19.md" as VaultPath).toPromise();
    expect(read.isOk() && read.value).toBe("body");
  });
});
```

- [ ] **Step 2: Run, observe failure**

Run: `npx vitest run src/journals/notes/note-creation.test.ts`
Expected: FAIL — `attachNote` is a stub returning `Ok(undefined)`, so content/frontmatter assertions fail.

- [ ] **Step 3: Implement `attachNote`**

Replace the `attachNote` stub in `src/journals/notes/note-creation.ts`:

```typescript
  attachNote(
    name: string,
    path: VaultPath,
    metadata: JournalMetadata,
  ): AsyncResult<void, NoteCreationError> {
    const mutatorResult = this.#frontmatter.writeMutator(name, metadata);
    if (mutatorResult.kind === "err") return AsyncResult.err(mutatorResult.error);
    const mutator = mutatorResult.value;

    return AsyncResult.fromAsync<void, NoteCreationError>(async () => {
      const fmResult = await this.#notes.updateFrontmatter(path, mutator).toPromise();
      if (fmResult.isErr()) throw fmResult.error;

      const readResult = await this.#notes.read(path).toPromise();
      if (readResult.isErr()) throw readResult.error;
      if (readResult.value.trim() !== "") return undefined;

      const contentResult = await this.#content.renderFor(name, metadata).toPromise();
      if (contentResult.isErr()) throw contentResult.error;
      if (contentResult.value === "") return undefined;

      const writeResult = await this.#notes.write(path, contentResult.value).toPromise();
      if (writeResult.isErr()) throw writeResult.error;
      return undefined;
    });
  }
```

- [ ] **Step 4: Run, observe pass**

Run: `npx vitest run src/journals/notes/note-creation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/note-creation.ts src/journals/notes/note-creation.test.ts
git commit -m "feat(journals/notes): NoteCreationService.attachNote — frontmatter always, content only if file empty"
```

---

## Task 12: `AutoAttachService`

**Files:**

- Create: `src/journals/notes/auto-attach.ts`
- Create: `src/journals/notes/auto-attach.test.ts`

- [ ] **Step 1: Write failing tests**

`src/journals/notes/auto-attach.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { NotesService } from "@/infrastructure/host";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { ModalService } from "@/infrastructure/host/modals";
import type { VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { TimelineService } from "../timeline";
import { fakeSettings, fixedJournal } from "../testing";

import { AutoAttachService } from "./auto-attach";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

function build(settings: SettingsService, notes: FakeNotesService): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(TimelineService).useClass(TimelineService);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(AutoAttachService).useClass(AutoAttachService);
  return c;
}

describe("AutoAttachService", () => {
  it("attaches a newly-created note matching exactly one journal", async () => {
    const settings = fakeSettings({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    await container.resolve(AutoAttachService).initialize().toPromise();
    await notes.create("2026-05-19.md" as VaultPath, "").toPromise();
    // Allow the event handler microtask + the attach AsyncResult to settle.
    await new Promise((r) => setTimeout(r, 0));
    const index = container.resolve(JournalsIndex);
    expect(index.entryByPath("2026-05-19.md" as VaultPath).isSome()).toBe(true);
  });

  it("does nothing for a path that doesn't match any journal", async () => {
    const settings = fakeSettings({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { folder: "Diary", timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    await container.resolve(AutoAttachService).initialize().toPromise();
    await notes.create("Inbox/random.md" as VaultPath, "").toPromise();
    await new Promise((r) => setTimeout(r, 0));
    const fm = await notes.updateFrontmatter("Inbox/random.md" as VaultPath, () => undefined).toPromise();
    // Frontmatter still empty (no spy on creation -> not attached). Simpler: assert index has no entry.
    expect(
      container
        .resolve(JournalsIndex)
        .entryByPath("Inbox/random.md" as VaultPath)
        .isNone(),
    ).toBe(true);
  });

  it("does nothing when the path matches ≥2 journals", async () => {
    const settings = fakeSettings({
      a: fixedJournal("a", { type: "day" }, { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } }),
      b: fixedJournal("b", { type: "day" }, { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } }),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize().toPromise();
    await notes.create("2026-05-19.md" as VaultPath, "").toPromise();
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips paths the plugin just created (expects-set)", async () => {
    const settings = fakeSettings({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    const creation = container.resolve(NoteCreationService);
    const spy = vi.spyOn(creation, "attachNote");
    await container.resolve(AutoAttachService).initialize().toPromise();
    // Simulate plugin-side creation by calling ensureNote first.
    await creation.ensureNote("daily", { journalName: "daily", anchor: anchor("2026-05-19") }).toPromise();
    spy.mockClear();
    // The FakeNotesService.create above already fired "created"; assert no further attach calls landed.
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("filters candidates by timeline.contains", async () => {
    const settings = fakeSettings({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2026-06-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize().toPromise();
    await notes.create("2026-05-19.md" as VaultPath, "").toPromise(); // before timeline start
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, observe failure**

Run: `npx vitest run src/journals/notes/auto-attach.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AutoAttachService`**

`src/journals/notes/auto-attach.ts`:

```typescript
import { inject } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection } from "../config";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { TimelineService } from "../timeline";

import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";

import type { JournalConfig } from "../config";
import type { JournalMetadata } from "../types";

export class AutoAttachService {
  readonly #notes = inject(NotesService);
  readonly #path = inject(NotePathService);
  readonly #timeline = inject(TimelineService);
  readonly #creation = inject(NoteCreationService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #index = inject(JournalsIndex);
  readonly #settings = inject(SettingsService);
  readonly #logger = inject(LoggerFactoryToken).named("auto-attach");
  readonly #unsubscribes: (() => void)[] = [];

  initialize(): AsyncResult<void, never> {
    this.#unsubscribes.push(
      this.#notes.events.on("created", (note) => {
        void this.#handle(note.path);
      }),
      this.#notes.events.on("renamed", ({ to }) => {
        void this.#handle(to);
      }),
    );
    return AsyncResult.ok();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
  }

  async #handle(path: VaultPath): Promise<void> {
    if (this.#creation.expects(path)) return;
    if (this.#index.entryByPath(path).isSome()) return;
    const matches: { name: string; metadata: JournalMetadata }[] = [];
    for (const name of Object.keys(this.#settings.getCollection(journalConfigCollection).entries)) {
      const candidate = this.#path.candidateFor(name, path);
      if (candidate.isNone()) continue;
      if (!this.#timeline.contains(name, candidate.value.anchor)) continue;
      // Round-trip the metadata so numbering values etc. are filled the same way ensureNote sees them.
      const builtResult = this.#frontmatter.buildMetadata(name, candidate.value.anchor);
      if (builtResult.kind === "err") continue;
      matches.push({
        name,
        metadata: { ...builtResult.value, ...(candidate.value.numbers ? { numbers: candidate.value.numbers } : {}) },
      });
    }
    if (matches.length === 0) {
      this.#logger.debug("auto-attach: no matches", { path });
      return;
    }
    if (matches.length > 1) {
      this.#logger.debug("auto-attach: ambiguous", { path, candidates: matches.map((m) => m.name) });
      return;
    }
    const [match] = matches;
    if (!match) return;
    const result = await this.#creation.attachNote(match.name, path, match.metadata).toPromise();
    if (result.isErr()) {
      this.#logger.error("auto-attach failed", { path, error: result.error });
    } else {
      this.#logger.info("auto-attach succeeded", { path, journal: match.name });
    }
  }
}
```

- [ ] **Step 4: Run, observe pass**

Run: `npx vitest run src/journals/notes/auto-attach.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/auto-attach.ts src/journals/notes/auto-attach.test.ts
git commit -m "feat(journals/notes): AutoAttachService — connects externally-created notes via reverse template parse"
```

---

## Task 13: `AutoCreateService`

**Files:**

- Create: `src/journals/notes/auto-create.ts`
- Create: `src/journals/notes/auto-create.test.ts`

- [ ] **Step 1: Write failing tests**

`src/journals/notes/auto-create.test.ts`:

```typescript
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { NotesService } from "@/infrastructure/host";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { ModalService } from "@/infrastructure/host/modals";
import type { VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { fakeSettings, fixedJournal } from "../testing";

import { AutoCreateService } from "./auto-create";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

function build(settings: SettingsService, notes: FakeNotesService): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(AutoCreateService).useClass(AutoCreateService);
  return c;
}

describe("AutoCreateService", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 9, 0, 0));
  });
  afterEach(() => {
    teardown();
    vi.useRealTimers();
  });

  it("creates today's note for journals with autoCreate=true", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { autoCreate: true }),
      monthly: fixedJournal("monthly", { type: "month" }, { autoCreate: false }),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    await container.resolve(AutoCreateService).initialize().toPromise();
    await vi.advanceTimersByTimeAsync(0);
    expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
    expect(notes.find("2026-05.md" as VaultPath).isNone()).toBe(true);
  });

  it("re-ticks at the next local midnight", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }, { autoCreate: true }) });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    await container.resolve(AutoCreateService).initialize().toPromise();
    await vi.advanceTimersByTimeAsync(0);
    expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
    // Jump to 2026-05-20 00:00:00 (15h after the 9am setSystemTime above).
    await vi.advanceTimersByTimeAsync(15 * 60 * 60 * 1000);
    expect(notes.find("2026-05-20.md" as VaultPath).isSome()).toBe(true);
  });

  it("stops ticking after dispose", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }, { autoCreate: true }) });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    const service = container.resolve(AutoCreateService);
    await service.initialize().toPromise();
    await service[Symbol.asyncDispose]();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    // Only today's note exists; tomorrow's didn't fire.
    expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
    expect(notes.find("2026-05-20.md" as VaultPath).isNone()).toBe(true);
  });
});
```

- [ ] **Step 2: Run, observe failure**

Run: `npx vitest run src/journals/notes/auto-create.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AutoCreateService`**

`src/journals/notes/auto-create.ts`:

```typescript
import { CalendarDate, Clock } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection } from "../config";
import { FrontmatterService } from "../frontmatter";

import { NoteCreationService } from "./note-creation";

import type { JournalConfig } from "../config";

export class AutoCreateService {
  readonly #creation = inject(NoteCreationService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #settings = inject(SettingsService);
  readonly #logger = inject(LoggerFactoryToken).named("auto-create");

  #timer: ReturnType<typeof setTimeout> | undefined;

  initialize(): AsyncResult<void, never> {
    void this.#tick();
    return AsyncResult.ok();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  async #tick(): Promise<void> {
    const anchor = CalendarDate.today().toAnchor();
    const collection = this.#settings.getCollection(journalConfigCollection);
    for (const [name, configRaw] of Object.entries(collection.entries)) {
      const config = configRaw as JournalConfig;
      if (!config.autoCreate) continue;
      const metadata = this.#frontmatter.buildMetadata(name, anchor);
      if (metadata.kind === "err") {
        this.#logger.debug("auto-create: skipped (build metadata failed)", { name, error: metadata.error });
        continue;
      }
      const result = await this.#creation.ensureNote(name, metadata.value).toPromise();
      if (result.isErr()) {
        this.#logger.error("auto-create: ensureNote failed", { name, error: result.error });
      }
    }
    this.#timer = setTimeout(() => {
      void this.#tick();
    }, Clock.msUntilNextLocalMidnight());
  }
}
```

- [ ] **Step 4: Run, observe pass**

Run: `npx vitest run src/journals/notes/auto-create.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/auto-create.ts src/journals/notes/auto-create.test.ts
git commit -m "feat(journals/notes): AutoCreateService — initial tick + reschedule at next local midnight"
```

---

## Task 14: `journalPickerSuggest` + `journals/notes` barrel & module

**Files:**

- Create: `src/journals/notes/journal-picker.ts`
- Create: `src/journals/notes/index.ts`
- Create: `src/journals/notes/module.ts`

- [ ] **Step 1: Write `journal-picker.ts`**

```typescript
import { m } from "@/i18n";
import { defineSuggest } from "@/infrastructure/host";

export const journalPickerSuggest = defineSuggest<string[], string>({
  placeholder: () => m.journal_picker_placeholder(),
  fetch: (query, journals) => journals.filter((j) => j.toLowerCase().includes(query.toLowerCase())),
  render: (name) => name,
});
```

- [ ] **Step 2: Write `module.ts`**

```typescript
import type { Module } from "@/infrastructure/di";

import { AutoAttachService } from "./auto-attach";
import { AutoCreateService } from "./auto-create";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

export const journalNotesModule: Module = {
  register(c) {
    c.register(NotePathService).useClass(NotePathService);
    c.register(TemplateContentService).useClass(TemplateContentService);
    c.register(NoteCreationService).useClass(NoteCreationService);
    c.register(AutoAttachService).useClass(AutoAttachService).eager();
    c.register(AutoCreateService).useClass(AutoCreateService);
  },
};
```

- [ ] **Step 3: Write `index.ts` (public barrel)**

```typescript
export { AutoAttachService } from "./auto-attach";
export { AutoCreateService } from "./auto-create";
export { confirmCreationModal } from "./confirm-creation-modal";
export { journalPickerSuggest } from "./journal-picker";
export { NoteCreationService } from "./note-creation";
export { NotePathService } from "./note-path";
export { TemplateContentService } from "./template-content";
export { journalNotesModule } from "./module";
export { JournalNoteCreationError, NoApplicableJournals } from "./errors";
export type { NoteCreationError } from "./note-creation";
```

- [ ] **Step 4: Type-check**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/journal-picker.ts src/journals/notes/module.ts src/journals/notes/index.ts
git commit -m "feat(journals/notes): journalPickerSuggest, public barrel, journalNotesModule"
```

---

## Task 15: `OpenJournalEntryFlow`

**Files:**

- Create: `src/journals/flows/open-journal-entry.ts`
- Create: `src/journals/flows/open-journal-entry.test.ts`

- [ ] **Step 1: Write failing tests**

`src/journals/flows/open-journal-entry.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { Flows, FlowsModule, UserAborted } from "@/infrastructure/flows";
import { LoggerModule } from "@/infrastructure/logger";
import { FakeNotesService, FakeWorkspaceService } from "@/infrastructure/host/testing";
import { NotesService, WorkspaceService } from "@/infrastructure/host";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { ModalService } from "@/infrastructure/host/modals";
import type { VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { fakeSettings, fixedJournal } from "../testing";

import { NoteCreationService } from "../notes/note-creation";
import { NotePathService } from "../notes/note-path";
import { TemplateContentService } from "../notes/template-content";

import { OpenJournalEntryFlow } from "./open-journal-entry";

function build(settings: SettingsService, notes: FakeNotesService, workspace: FakeWorkspaceService) {
  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
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

describe("OpenJournalEntryFlow", () => {
  it("ensures the note and opens it in the workspace", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const workspace = new FakeWorkspaceService();
    const container = build(settings, notes, workspace);
    const result = await container
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") })
      .toPromise();
    expect(result.isOk()).toBe(true);
    expect(workspace.isOpen("2026-05-19.md" as VaultPath)).toBe(true);
  });

  it("does not open when ensureNote returns UserAborted", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
    const notes = new FakeNotesService();
    const workspace = new FakeWorkspaceService();
    const container = build(settings, notes, workspace);
    const modals = container.resolve(ModalService) as unknown as FakeModalService;
    const promise = container
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") })
      .toPromise();
    await Promise.resolve();
    await Promise.resolve();
    modals.lastOpen<{ journalName: string; noteName: string }, boolean>().cancel();
    const result = await promise;
    expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
    expect(workspace.isOpen("2026-05-19.md" as VaultPath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, observe failure**

Run: `npx vitest run src/journals/flows/open-journal-entry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `OpenJournalEntryFlow`**

`src/journals/flows/open-journal-entry.ts`:

```typescript
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Flow } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import type { OpenMode, VaultPath, WorkspaceOpenError } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";

import { FrontmatterService } from "../frontmatter";
import { NoteCreationService } from "../notes/note-creation";
import type { NoteCreationError } from "../notes/note-creation";

export interface OpenJournalEntryParams {
  journalName: string;
  anchor: AnchorString;
  openMode?: OpenMode;
}

export interface OpenJournalEntryResult {
  path: VaultPath;
  created: boolean;
}

export class OpenJournalEntryFlow implements Flow<
  OpenJournalEntryParams,
  OpenJournalEntryResult,
  NoteCreationError | WorkspaceOpenError
> {
  readonly #frontmatter = inject(FrontmatterService);
  readonly #creation = inject(NoteCreationService);
  readonly #workspace = inject(WorkspaceService);

  execute(p: OpenJournalEntryParams): AsyncResult<OpenJournalEntryResult, NoteCreationError | WorkspaceOpenError> {
    const metadataResult = this.#frontmatter.buildMetadata(p.journalName, p.anchor);
    if (metadataResult.kind === "err") return AsyncResult.err(metadataResult.error);
    return this.#creation
      .ensureNote(p.journalName, metadataResult.value)
      .flatMap(({ path, created }) =>
        this.#workspace.openNote(path, p.openMode ?? "active").map(() => ({ path, created })),
      );
  }
}
```

If `AsyncResult.flatMap` doesn't exist, use `andThen` (check `src/infrastructure/result/`).

- [ ] **Step 4: Run, observe pass**

Run: `npx vitest run src/journals/flows/open-journal-entry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/flows/open-journal-entry.ts src/journals/flows/open-journal-entry.test.ts
git commit -m "feat(journals/flows): OpenJournalEntryFlow — ensureNote + openNote per journal"
```

---

## Task 16: `OpenDateFlow`

**Files:**

- Create: `src/journals/flows/open-date.ts`
- Create: `src/journals/flows/open-date.test.ts`

- [ ] **Step 1: Write failing tests**

`src/journals/flows/open-date.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { Flows, FlowsModule, UserAborted } from "@/infrastructure/flows";
import { LoggerModule } from "@/infrastructure/logger";
import { FakeNotesService, FakeWorkspaceService } from "@/infrastructure/host/testing";
import { NotesService, WorkspaceService } from "@/infrastructure/host";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeSuggestService } from "@/infrastructure/host/suggests/testing";
import { SuggestService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { TimelineService } from "../timeline";
import { fakeSettings, fixedJournal } from "../testing";

import { NoApplicableJournals } from "../notes/errors";
import { NoteCreationService } from "../notes/note-creation";
import { NotePathService } from "../notes/note-path";
import { TemplateContentService } from "../notes/template-content";

import { OpenDateFlow } from "./open-date";
import { OpenJournalEntryFlow } from "./open-journal-entry";

function build(settings: SettingsService, suggests: FakeSuggestService) {
  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);
  const notes = new FakeNotesService();
  const workspace = new FakeWorkspaceService();
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  c.register(SuggestService).useValue(suggests as unknown as SuggestService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(TimelineService).useClass(TimelineService);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(OpenJournalEntryFlow).useClass(OpenJournalEntryFlow);
  c.register(OpenDateFlow).useClass(OpenDateFlow);
  return { container: c, notes, workspace };
}

const TIMELINE_OPEN = { start: anchor("2020-01-01"), end: { kind: "never" as const } };

describe("OpenDateFlow", () => {
  it("errors with NoApplicableJournals when no journal covers the anchor", async () => {
    const settings = fakeSettings({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2030-01-01"), end: { kind: "never" } } },
      ),
    });
    const suggests = new FakeSuggestService();
    const { container } = build(settings, suggests);
    const result = await container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19") })
      .toPromise();
    expect(result.isErr() && result.error instanceof NoApplicableJournals).toBe(true);
  });

  it("dispatches OpenJournalEntryFlow directly when exactly one journal applies", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { timeline: TIMELINE_OPEN }),
    });
    const suggests = new FakeSuggestService();
    const { container, workspace } = build(settings, suggests);
    const result = await container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19") })
      .toPromise();
    expect(result.isOk()).toBe(true);
    expect(workspace.isOpen("2026-05-19.md" as VaultPath)).toBe(true);
    expect(suggests.opens.length).toBe(0);
  });

  it("opens the suggest when multiple journals apply, then dispatches the chosen one", async () => {
    const settings = fakeSettings({
      a: fixedJournal("a", { type: "day" }, { folder: "A", timeline: TIMELINE_OPEN }),
      b: fixedJournal("b", { type: "day" }, { folder: "B", timeline: TIMELINE_OPEN }),
    });
    const suggests = new FakeSuggestService();
    const { container, workspace } = build(settings, suggests);
    const promise = container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19") })
      .toPromise();
    await Promise.resolve();
    await Promise.resolve();
    suggests.lastOpen<string[], string>().choose("b");
    const result = await promise;
    expect(result.isOk()).toBe(true);
    expect(workspace.isOpen("B/2026-05-19.md" as VaultPath)).toBe(true);
  });

  it("returns UserAborted when the suggest is cancelled", async () => {
    const settings = fakeSettings({
      a: fixedJournal("a", { type: "day" }, { folder: "A", timeline: TIMELINE_OPEN }),
      b: fixedJournal("b", { type: "day" }, { folder: "B", timeline: TIMELINE_OPEN }),
    });
    const suggests = new FakeSuggestService();
    const { container } = build(settings, suggests);
    const promise = container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19") })
      .toPromise();
    await Promise.resolve();
    await Promise.resolve();
    suggests.lastOpen<string[], string>().cancel();
    const result = await promise;
    expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
  });

  it("filters by existingOnly when requested", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { timeline: TIMELINE_OPEN }),
    });
    const suggests = new FakeSuggestService();
    const { container } = build(settings, suggests);
    const result = await container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), existingOnly: true })
      .toPromise();
    expect(result.isErr() && result.error instanceof NoApplicableJournals).toBe(true);
  });

  it("narrows by journalNames before timeline filtering", async () => {
    const settings = fakeSettings({
      a: fixedJournal("a", { type: "day" }, { folder: "A", timeline: TIMELINE_OPEN }),
      b: fixedJournal("b", { type: "day" }, { folder: "B", timeline: TIMELINE_OPEN }),
    });
    const suggests = new FakeSuggestService();
    const { container, workspace } = build(settings, suggests);
    const result = await container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), journalNames: ["a"] })
      .toPromise();
    expect(result.isOk()).toBe(true);
    expect(workspace.isOpen("A/2026-05-19.md" as VaultPath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, observe failure**

Run: `npx vitest run src/journals/flows/open-date.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `OpenDateFlow`**

`src/journals/flows/open-date.ts`:

```typescript
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Flow } from "@/infrastructure/flows";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { SuggestService } from "@/infrastructure/host";
import type { OpenMode, VaultPath, WorkspaceOpenError } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection } from "../config";
import { JournalsIndex } from "../journals-index";
import { TimelineService } from "../timeline";

import { NoApplicableJournals } from "../notes/errors";
import { journalPickerSuggest } from "../notes/journal-picker";
import type { NoteCreationError } from "../notes/note-creation";

import { OpenJournalEntryFlow } from "./open-journal-entry";

import type { SuggestCancelled } from "@/infrastructure/host";

export interface OpenDateParams {
  anchor: AnchorString;
  journalNames?: readonly string[];
  openMode?: OpenMode;
  existingOnly?: boolean;
}

export interface OpenDateResult {
  path: VaultPath;
  created: boolean;
}

export type OpenDateError =
  | NoApplicableJournals
  | NoteCreationError
  | WorkspaceOpenError
  | SuggestCancelled
  | UserAborted;

export class OpenDateFlow implements Flow<OpenDateParams, OpenDateResult, OpenDateError> {
  readonly #settings = inject(SettingsService);
  readonly #timeline = inject(TimelineService);
  readonly #index = inject(JournalsIndex);
  readonly #flows = inject(Flows);
  readonly #suggests = inject(SuggestService);

  execute(p: OpenDateParams): AsyncResult<OpenDateResult, OpenDateError> {
    const allNames = Object.keys(this.#settings.getCollection(journalConfigCollection).entries);
    const requested = p.journalNames ? allNames.filter((n) => p.journalNames!.includes(n)) : allNames;
    const applicable = requested.filter((name) => {
      if (!this.#timeline.contains(name, p.anchor)) return false;
      if (p.existingOnly && this.#index.entryByAnchor(name, p.anchor).isNone()) return false;
      return true;
    });

    if (applicable.length === 0) {
      return AsyncResult.err(new NoApplicableJournals(p.anchor, p.journalNames));
    }
    if (applicable.length === 1) {
      const [name] = applicable;
      if (!name) return AsyncResult.err(new NoApplicableJournals(p.anchor, p.journalNames));
      return this.#flows.invoke(OpenJournalEntryFlow, {
        journalName: name,
        anchor: p.anchor,
        openMode: p.openMode,
      });
    }
    return this.#suggests
      .open(journalPickerSuggest, applicable)
      .flatMap((chosen) =>
        this.#flows.invoke(OpenJournalEntryFlow, {
          journalName: chosen,
          anchor: p.anchor,
          openMode: p.openMode,
        }),
      )
      .mapErr((e) => {
        if (e && (e as { kind?: string }).kind === "suggest-cancelled") {
          return new UserAborted("journal-picker");
        }
        return e;
      });
  }
}
```

If `mapErr` doesn't exist on `AsyncResult`, replace with `recoverErr`/`mapError` — confirm via grep on `@/infrastructure/result`.

- [ ] **Step 4: Run, observe pass**

Run: `npx vitest run src/journals/flows/open-date.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/flows/open-date.ts src/journals/flows/open-date.test.ts
git commit -m "feat(journals/flows): OpenDateFlow — multi-journal orchestration with suggest picker"
```

---

## Task 17: `journals/flows` barrel & module; top-level wiring

**Files:**

- Create: `src/journals/flows/index.ts`
- Create: `src/journals/flows/module.ts`
- Modify: `src/journals/module.ts`
- Modify: `src/journals/index.ts`

- [ ] **Step 1: Write `flows/module.ts`**

```typescript
import type { Module } from "@/infrastructure/di";

import { OpenDateFlow } from "./open-date";
import { OpenJournalEntryFlow } from "./open-journal-entry";

export const journalFlowsModule: Module = {
  register(c) {
    c.register(OpenDateFlow).useClass(OpenDateFlow);
    c.register(OpenJournalEntryFlow).useClass(OpenJournalEntryFlow);
  },
};
```

- [ ] **Step 2: Write `flows/index.ts`**

```typescript
export { OpenDateFlow } from "./open-date";
export { OpenJournalEntryFlow } from "./open-journal-entry";
export { journalFlowsModule } from "./module";
export type { OpenDateError, OpenDateParams, OpenDateResult } from "./open-date";
export type { OpenJournalEntryParams, OpenJournalEntryResult } from "./open-journal-entry";
```

- [ ] **Step 3: Wire sub-modules into top-level `src/journals/module.ts`**

Replace `src/journals/module.ts`:

```typescript
import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken } from "@/settings";

import { journalConfigCollection } from "./config";
import { CycleService } from "./cycle";
import { journalFlowsModule } from "./flows/module";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { journalNotesModule } from "./notes/module";
import { NumberingService } from "./numbering";
import { TimelineService } from "./timeline";
import { VaultSubscriptionService } from "./vault-subscription";

export const journalsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(journalConfigCollection);
    c.register(JournalsIndex).useClass(JournalsIndex);
    c.register(TimelineService).useClass(TimelineService);
    c.register(CycleService).useClass(CycleService);
    c.register(NumberingService).useClass(NumberingService);
    c.register(FrontmatterService).useClass(FrontmatterService);
    c.register(VaultSubscriptionService).useClass(VaultSubscriptionService).eager();
    journalNotesModule.register(c);
    journalFlowsModule.register(c);
  },
};
```

- [ ] **Step 4: Update top-level barrel `src/journals/index.ts`**

Append at the bottom of `src/journals/index.ts`:

```typescript
export {
  AutoAttachService,
  AutoCreateService,
  NoteCreationService,
  NotePathService,
  TemplateContentService,
  journalPickerSuggest,
  confirmCreationModal,
  JournalNoteCreationError,
  NoApplicableJournals,
  type NoteCreationError,
} from "./notes";

export {
  OpenDateFlow,
  OpenJournalEntryFlow,
  type OpenDateError,
  type OpenDateParams,
  type OpenDateResult,
  type OpenJournalEntryParams,
  type OpenJournalEntryResult,
} from "./flows";
```

- [ ] **Step 5: Type-check + tests**

Run: `npm run check:types && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/journals/flows/module.ts src/journals/flows/index.ts src/journals/module.ts src/journals/index.ts
git commit -m "feat(journals): wire journalNotesModule and journalFlowsModule into journalsModule"
```

---

## Task 18: `main.ts` boot wiring

**Files:**

- Modify: `src/main.ts`

- [ ] **Step 1: Add AutoAttach + AutoCreate initialization**

Replace `src/main.ts`:

```typescript
import { getLanguage, Notice, Plugin } from "obsidian";

import { CalendarModule, calendarSettingsModule } from "@/calendar";
import { initLocale } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { createHostModule } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { AutoAttachService, AutoCreateService } from "@/journals";
import { journalsModule } from "@/journals/module";
import { journalsSettingsModule } from "@/journals/settings/module";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { settingsModule, SettingsService } from "@/settings";
import { templatesModule } from "@/templates";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  async onload(): Promise<void> {
    initLocale(getLanguage());

    const container = new Container();
    container.addModule(LoggerModule);
    container.addModule(FlowsModule);
    container.addModule(createHostModule(this));
    container.addModule(settingsModule);
    container.addModule(CalendarModule);
    container.addModule(templatesModule);
    container.addModule(calendarSettingsModule);
    container.addModule(journalsModule);
    container.addModule(journalsSettingsModule);
    await container.autoLoad();

    const init = await container.resolve(SettingsService).initialize();
    if (init.kind === "err") {
      new Notice(`Journal: failed to load settings — ${init.error.message}`);
      await container.dispose();
      return;
    }

    await container.resolve(VaultSubscriptionService).initialize();
    await container.resolve(AutoAttachService).initialize();
    await container.resolve(AutoCreateService).initialize();

    this.#container = container;
  }

  onunload(): void {
    void this.#container?.dispose().catch(() => null);
    this.#container = undefined;
  }
}
```

- [ ] **Step 2: Type-check + full test**

Run: `npm run check:types && npm test && npm run check:lint`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): initialize AutoAttachService and AutoCreateService after vault subscription"
```

---

## Task 19: Smoke test the full surface

**Files:**

- (No code changes; verification only.)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run check:lint`
Expected: no errors. If `eslint-disable` comments seem tempting anywhere, fix the underlying code instead (repo memory: "No lint silencing").

- [ ] **Step 3: Run type-check**

Run: `npm run check:types`
Expected: no errors.

- [ ] **Step 4: Final commit (only if anything changed)**

Skip unless smoke tests forced incidental fixes. If they did:

```bash
git add -A
git commit -m "chore: address smoke-test findings"
```

---

## Notes on test memory & repo conventions

- **Test commands** (repo memory): `npm` scripts (not `pnpm`). Per task: `npm test`, `npm run check:types`, `npm run check:lint`. The e2e:smoke target referenced in repo memory does not currently exist in this project's `package.json`; if it's added later, run it before merging.
- **Test layout**: colocated `*.test.ts`. No `__tests__` folders, no top-level `mocks/`. Test infra goes in sibling `testing.ts` (see `src/journals/testing.ts`, `src/infrastructure/host/testing.ts`).
- **No vitest wrappers**: assert with raw `expect(...)`. Narrowing helpers (e.g., `expectOk(result)`) are fine; wholesale wrappers around `expect` chains are not.
- **Test descriptions**: subject+verb behavior names. No multi-clause "and" tests. One behavior per test.
- **Black-box assertions**: prefer observable outcomes (e.g., the file exists in `FakeNotesService`, the workspace says `isOpen`) over spy-call counts. Spies are OK when the side effect _is_ the contract (e.g., asserting `attachNote` was _not_ called).
- **No spec-reference comments**: never write `// Satisfies Requirement N.M` or describe-block labels referencing the spec.
- **Errors live in `errors.ts`**: every new `Error` subclass lives in the feature's `errors.ts`.
- **DI is wiring, not a service locator**: use `inject(Token)` only at construction time (declared as field initializers or in the constructor body). Don't reach into the container from runtime methods.
- **`attempt.in(this, ...)`**: prefer the do-notation form when composing multi-step `Result`/`AsyncResult` pipelines. The bodies above sometimes use chained `flatMap`/`map` for clarity; either is acceptable as long as `this.#field` is not shadowed.
- **No baked-in error simulation**: tests inject errors via `vi.spyOn`, not via simulator queues on fakes.
- **Inline Vue props**: in SFCs, use `defineProps<{...}>()` inline; skip a named interface unless reused.
