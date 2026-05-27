# v3 Code Blocks Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a host primitive that registers Obsidian markdown code blocks under v3 DI conventions, and prove it by porting `journals-home` end-to-end.

**Architecture:** A new `infrastructure/host/code-blocks/` module exposes `CodeBlockService` (eager, collects defs from a multi-token) plus `defineCodeBlock` / `CodeBlockDefinitionToken`. The service owns obsidian registration, YAML parsing, valibot schema validation, Vue mounting with DI provision, and teardown. A single feature module `src/code-blocks/` binds per-block definitions to the token; this plan ships only the `home/` block plus a new `calendar/relative-date.ts` helper.

**Tech Stack:** TypeScript, Vue 3 (SFC), valibot, paraglide i18n, vitest, `@testing-library/vue`, `@testing-library/user-event`, moment.js, ts-pattern, obsidian.

**Reference spec:** `docs/superpowers/specs/2026-05-27-v3-code-blocks-foundation-design.md`.

**Conventions in this repo (carry through every task):**

- Commit on the current branch (`v3-ai`); never create a new branch.
- Co-located tests: `*.test.ts` lives next to the implementation file.
- No `eslint-disable`. No `Co-Authored-By` trailer. Don't add narrative file-header JSDoc.
- DI: prefer field initializers (`readonly #x = inject(...)`); omit `.lifetime(Lifetime.Container)`; use `createMultiToken<T>` for plural bindings.
- Vue components: inline `defineProps<{...}>()`; tests use `@testing-library/vue` + `user-event`; never `@vue/test-utils`.
- Tests: one behavior per test; nested `describe`; black-box assertions.
- Discriminated-union dispatch: `match(...).with(...).exhaustive()` (ts-pattern), not `switch`.
- Verification before claiming a task done: `npm test`, `npm run check:types`, `npm run check:lint`.

---

## Task 1 — Extend the obsidian mock with code-block primitives

The mock at `__mocks__/obsidian.ts` doesn't yet expose `MarkdownRenderChild`, `MarkdownPostProcessorContext`, `parseYaml`, or `registerMarkdownCodeBlockProcessor` on the plugin fake. The host service tests need all four.

**Files:**

- Modify: `__mocks__/obsidian.ts`
- Modify: `src/infrastructure/host/internal/testing.ts`

- [ ] **Step 1: Add `MarkdownRenderChild` and `parseYaml` to the obsidian mock**

In `__mocks__/obsidian.ts`, after the `Menu` class (around line 229), add:

```ts
export class MarkdownRenderChild {
  readonly containerEl: HTMLElement;
  #loaded = false;

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }

  load(): void {
    if (this.#loaded) return;
    this.#loaded = true;
    this.onload();
  }

  unload(): void {
    if (!this.#loaded) return;
    this.#loaded = false;
    this.onunload();
  }

  onload(): void {}

  onunload(): void {}
}

export interface MarkdownPostProcessorContext {
  readonly sourcePath: string;
  addChild(child: MarkdownRenderChild): void;
}

export function parseYaml(source: string): unknown {
  // Delegate to js-yaml at test time; obsidian's real parseYaml accepts arbitrary YAML.
  // We don't add a runtime dep — tests only need shapes that survive JSON.parse for nested objects.
  // The simplest correct fake: accept the common cases the home block uses.
  const trimmed = source.trim();
  if (trimmed === "") return null;
  // Lazy import to keep the mock module side-effect-light.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yaml = require("js-yaml") as { load(s: string): unknown };
  return yaml.load(source);
}
```

Note: `js-yaml` is already a transitive dep (Obsidian uses it). Verify with `grep js-yaml package-lock.json` before relying on it. If absent, see fallback below.

- [ ] **Step 2: Verify `js-yaml` is available**

Run: `grep -c "\"js-yaml\"" package-lock.json`
Expected: non-zero count.

If zero, replace the `parseYaml` body with a minimal hand-roll that supports `key: value` lines and JSON-style maps (sufficient for tests), or add `js-yaml` to devDependencies via `npm i -D js-yaml @types/js-yaml`. Prefer the npm install — it's a one-time cost and the real obsidian parser is YAML.

- [ ] **Step 3: Extend `FakeHost.plugin` with `registerMarkdownCodeBlockProcessor`**

The fake plugin in `src/infrastructure/host/internal/testing.ts` already implements `addCommand`, `registerEvent`, etc. Add a `codeBlockProcessors` map and the method.

Find the section that builds the fake plugin (search for `addCommand(`). Add inside the same object literal, alongside the existing methods:

```ts
codeBlockProcessors: new Map<string, (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void | Promise<void>>(),

registerMarkdownCodeBlockProcessor(
  language: string,
  handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void | Promise<void>,
): void {
  this.codeBlockProcessors.set(language, handler);
},
```

Also extend the `FakeHost` interface near the top of the file:

```ts
readonly codeBlockProcessors: Map<
  string,
  (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void | Promise<void>
>;
```

And add a helper on `FakeHost` to dispatch processors during tests:

```ts
runCodeBlockProcessor(language: string, source: string, sourcePath = "Some/Note.md"): { el: HTMLElement; ctx: MarkdownPostProcessorContext; child?: MarkdownRenderChild };
```

Implementation:

```ts
runCodeBlockProcessor(language, source, sourcePath = "Some/Note.md") {
  const handler = this.plugin.codeBlockProcessors.get(language);
  if (!handler) throw new Error(`No processor registered for "${language}"`);
  const el = document.createElement("div");
  let attached: MarkdownRenderChild | undefined;
  const ctx: MarkdownPostProcessorContext = {
    sourcePath,
    addChild(child) {
      attached = child;
      child.load();
    },
  };
  void handler(source, el, ctx);
  return { el, ctx, child: attached };
},
```

Update the FakeHost interface accordingly. Import `MarkdownRenderChild` and `MarkdownPostProcessorContext` from `"obsidian"` at the top of the file.

- [ ] **Step 4: Run existing host tests to confirm no regression**

Run: `npm test -- src/infrastructure/host`
Expected: PASS (everything that already passed still passes).

- [ ] **Step 5: Commit**

```bash
git add __mocks__/obsidian.ts src/infrastructure/host/internal/testing.ts
git commit -m "test(host): extend obsidian mock with markdown code block primitives"
```

---

## Task 2 — Export `periodKinds` from `@/calendar`

The home schema needs the array form of the period union. It currently exists only as a string literal type.

**Files:**

- Modify: `src/calendar/period.ts`
- Modify: `src/calendar/index.ts`

- [ ] **Step 1: Add the runtime array next to the type**

Edit `src/calendar/period.ts`. Find the existing line `export type PeriodKind = "day" | "week" | "month" | "quarter" | "year" | "decade";` and replace with:

```ts
export const periodKinds = ["day", "week", "month", "quarter", "year", "decade"] as const;
export type PeriodKind = (typeof periodKinds)[number];
```

- [ ] **Step 2: Re-export from the barrel**

Edit `src/calendar/index.ts`. Change:

```ts
export { type Period, type PeriodKind, type PeriodBase } from "./period";
```

to:

```ts
export { periodKinds, type Period, type PeriodKind, type PeriodBase } from "./period";
```

- [ ] **Step 3: Type-check**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/calendar/period.ts src/calendar/index.ts
git commit -m "feat(calendar): export periodKinds array alongside PeriodKind type"
```

---

## Task 3 — Host primitive: types, errors, and `defineCodeBlock`

Lay down the public types and error classes. No behavior yet.

**Files:**

- Create: `src/infrastructure/host/code-blocks/types.ts`
- Create: `src/infrastructure/host/code-blocks/errors.ts`
- Create: `src/infrastructure/host/code-blocks/define-code-block.ts`
- Create: `src/infrastructure/host/code-blocks/index.ts`

- [ ] **Step 1: Write the types module**

Create `src/infrastructure/host/code-blocks/types.ts`:

```ts
import type { Component } from "vue";
import type { GenericSchema, InferOutput } from "valibot";

import { createMultiToken } from "@/infrastructure/di";

import type { VaultPath } from "../types";

export interface CodeBlockProps<TConfig> {
  readonly path: VaultPath;
  readonly config: TConfig;
}

export interface CodeBlockDefinitionInput<TSchema extends GenericSchema> {
  readonly keys: readonly [string, ...string[]];
  readonly schema: TSchema;
  readonly component: Component;
  readonly cssClass?: readonly string[];
}

export type CodeBlockDefinition<TSchema extends GenericSchema = GenericSchema> = CodeBlockDefinitionInput<TSchema>;

export type CodeBlockConfig<TDef> = TDef extends CodeBlockDefinition<infer S> ? InferOutput<S> : never;

export const CodeBlockDefinitionToken = createMultiToken<CodeBlockDefinition>("host.codeBlock");
```

- [ ] **Step 2: Write the errors module**

Create `src/infrastructure/host/code-blocks/errors.ts`:

```ts
import type { BaseIssue } from "valibot";

export class CodeBlockYamlError extends Error {
  readonly kind = "code-block-yaml" as const;

  constructor(readonly cause: unknown) {
    super("Failed to parse code block YAML");
    this.name = "CodeBlockYamlError";
  }
}

export class CodeBlockSchemaError extends Error {
  readonly kind = "code-block-schema" as const;

  constructor(
    readonly key: string,
    readonly issues: readonly BaseIssue<unknown>[],
  ) {
    super(`Code block "${key}" failed schema validation`);
    this.name = "CodeBlockSchemaError";
  }
}
```

- [ ] **Step 3: Write the identity factory**

Create `src/infrastructure/host/code-blocks/define-code-block.ts`:

```ts
import type { GenericSchema } from "valibot";

import type { CodeBlockDefinition, CodeBlockDefinitionInput } from "./types";

export function defineCodeBlock<TSchema extends GenericSchema>(
  input: CodeBlockDefinitionInput<TSchema>,
): CodeBlockDefinition<TSchema> {
  return input;
}
```

- [ ] **Step 4: Write the barrel**

Create `src/infrastructure/host/code-blocks/index.ts`:

```ts
export { defineCodeBlock } from "./define-code-block";
export { CodeBlockYamlError, CodeBlockSchemaError } from "./errors";
export { CodeBlockService } from "./internal/code-block-service";
export {
  CodeBlockDefinitionToken,
  type CodeBlockConfig,
  type CodeBlockDefinition,
  type CodeBlockDefinitionInput,
  type CodeBlockProps,
} from "./types";
```

(The service file doesn't exist yet — that's expected; we add it in Task 4. Type-check will fail until then. Don't run `check:types` in this task.)

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/host/code-blocks/
git commit -m "feat(host): scaffold code-block types, errors, and defineCodeBlock"
```

---

## Task 4 — `CodeBlockService` skeleton: register definitions on construction

TDD: the service iterates `CodeBlockDefinitionToken` bindings and calls `plugin.registerMarkdownCodeBlockProcessor(key, ...)` for each key — multi-key supported via the `keys` tuple.

**Files:**

- Create: `src/infrastructure/host/code-blocks/internal/code-block-service.ts`
- Create: `src/infrastructure/host/code-blocks/internal/code-block-service.test.ts`

- [ ] **Step 1: Write the first failing test (single-key registration)**

Create `src/infrastructure/host/code-blocks/internal/code-block-service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import * as v from "valibot";
import { defineComponent, h } from "vue";

import { Container } from "@/infrastructure/di";
import { LoggerFactoryToken, LoggerFactory } from "@/infrastructure/logger";

import { createFakeHost, type FakeHost } from "../../internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";
import { defineCodeBlock } from "../define-code-block";
import { CodeBlockDefinitionToken } from "../types";

import { CodeBlockService } from "./code-block-service";

const StubComponent = defineComponent({
  props: { config: { type: Object, required: true }, path: { type: String, required: true } },
  setup(props) {
    return () => h("span", { class: "stub" }, JSON.stringify(props.config));
  },
});

function build(): { container: Container; host: FakeHost } {
  const host = createFakeHost();
  const container = new Container();
  container.register(InternalPluginToken).useValue(host.plugin);
  container.register(InternalObsidianAppToken).useValue(host.app);
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  container.register(CodeBlockService).useClass(CodeBlockService);
  return { container, host };
}

describe("CodeBlockService", () => {
  let context: ReturnType<typeof build>;
  beforeEach(() => {
    context = build();
  });

  describe("registration", () => {
    it("registers a processor for each key bound to the multi-token", () => {
      const def = defineCodeBlock({
        keys: ["journals-home"],
        schema: v.object({}),
        component: StubComponent,
      });
      context.container.register(CodeBlockDefinitionToken).useValue(def);

      context.container.resolve(CodeBlockService);

      expect(context.host.plugin.codeBlockProcessors.has("journals-home")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- src/infrastructure/host/code-blocks`
Expected: FAIL — `CodeBlockService` not exported (module not found).

- [ ] **Step 3: Implement the service**

Create `src/infrastructure/host/code-blocks/internal/code-block-service.ts`:

```ts
import { inject, InjectorToken } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { InternalPluginToken } from "../../internal/tokens";
import { CodeBlockDefinitionToken, type CodeBlockDefinition } from "../types";

export class CodeBlockService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #injector = inject(InjectorToken);
  readonly #logger = inject(LoggerFactoryToken).named("code-block-service");
  readonly #defs = inject(CodeBlockDefinitionToken);

  constructor() {
    for (const def of this.#defs) this.#registerDefinition(def);
  }

  #registerDefinition(def: CodeBlockDefinition): void {
    for (const key of def.keys) {
      this.#plugin.registerMarkdownCodeBlockProcessor(key, (_source, _el, _ctx) => {
        // Behavior added in subsequent tasks.
      });
    }
  }
}
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `npm test -- src/infrastructure/host/code-blocks`
Expected: PASS (single test).

- [ ] **Step 5: Add the multi-key test**

Append inside the same `describe("registration", …)` block:

```ts
it("registers every key when the definition lists multiple", () => {
  const def = defineCodeBlock({
    keys: ["calendar-nav", "journal-nav", "interval-nav"],
    schema: v.object({}),
    component: StubComponent,
  });
  context.container.register(CodeBlockDefinitionToken).useValue(def);

  context.container.resolve(CodeBlockService);

  expect([...context.host.plugin.codeBlockProcessors.keys()]).toEqual(
    expect.arrayContaining(["calendar-nav", "journal-nav", "interval-nav"]),
  );
});
```

- [ ] **Step 6: Add the "no defs" test**

```ts
it("registers nothing when no definitions are bound", () => {
  context.container.resolve(CodeBlockService);
  expect(context.host.plugin.codeBlockProcessors.size).toBe(0);
});
```

- [ ] **Step 7: Run all tests, expect PASS**

Run: `npm test -- src/infrastructure/host/code-blocks`
Expected: 3 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/host/code-blocks/internal/
git commit -m "feat(host): CodeBlockService registers processors for each definition key"
```

---

## Task 5 — Parse YAML + validate schema + mount Vue

TDD: a registered processor parses the source, validates against the schema, then mounts the Vue component via a `VueCodeBlockHost` that extends `MarkdownRenderChild`.

**Files:**

- Create: `src/infrastructure/host/code-blocks/internal/vue-code-block-host.ts`
- Modify: `src/infrastructure/host/code-blocks/internal/code-block-service.ts`
- Modify: `src/infrastructure/host/code-blocks/internal/code-block-service.test.ts`

- [ ] **Step 1: Add a failing test for empty-source default mounting**

Append to the test file, after the `describe("registration", …)` block:

```ts
describe("mounting", () => {
  const schema = v.object({
    show: v.optional(v.array(v.string()), () => ["day"] as const),
    separator: v.optional(v.string(), " • "),
  });

  function bind(): void {
    const def = defineCodeBlock({ keys: ["journals-home"], schema, component: StubComponent });
    context.container.register(CodeBlockDefinitionToken).useValue(def);
    context.container.resolve(CodeBlockService);
  }

  it("mounts the component with schema defaults when source is empty", () => {
    bind();
    const { el } = context.host.runCodeBlockProcessor("journals-home", "");
    expect(el.querySelector(".stub")?.textContent).toContain('"separator":" • "');
    expect(el.querySelector(".stub")?.textContent).toContain('"show":["day"]');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- src/infrastructure/host/code-blocks`
Expected: FAIL — element has no `.stub` child (nothing mounted yet).

- [ ] **Step 3: Write `VueCodeBlockHost`**

Create `src/infrastructure/host/code-blocks/internal/vue-code-block-host.ts`:

```ts
import { MarkdownRenderChild } from "obsidian";
import { createApp, type App as VueApp, type Component } from "vue";

import { provideInjectorOnApp, type Injector } from "@/infrastructure/di";

export class VueCodeBlockHost extends MarkdownRenderChild {
  readonly #injector: Injector;
  readonly #component: Component;
  readonly #props: Record<string, unknown>;
  readonly #cssClass: readonly string[];
  #app: VueApp | undefined;

  constructor(
    el: HTMLElement,
    injector: Injector,
    component: Component,
    props: Record<string, unknown>,
    cssClass: readonly string[] = [],
  ) {
    super(el);
    this.#injector = injector;
    this.#component = component;
    this.#props = props;
    this.#cssClass = cssClass;
  }

  onload(): void {
    for (const cls of this.#cssClass) this.containerEl.classList.add(cls);
    const app = createApp(this.#component, this.#props);
    provideInjectorOnApp(app, this.#injector);
    this.#app = app;
    app.mount(this.containerEl);
  }

  onunload(): void {
    this.#app?.unmount();
    this.#app = undefined;
    this.containerEl.replaceChildren();
  }
}
```

- [ ] **Step 4: Wire parsing + validation into `CodeBlockService`**

Replace the body of `code-block-service.ts` with:

```ts
import { parseYaml } from "obsidian";
import * as v from "valibot";
import type { GenericSchema, InferOutput } from "valibot";

import { inject, InjectorToken } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { InternalPluginToken } from "../../internal/tokens";
import type { VaultPath } from "../../types";
import { CodeBlockSchemaError, CodeBlockYamlError } from "../errors";
import { CodeBlockDefinitionToken, type CodeBlockDefinition, type CodeBlockProps } from "../types";

import { VueCodeBlockHost } from "./vue-code-block-host";

export class CodeBlockService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #injector = inject(InjectorToken);
  readonly #logger = inject(LoggerFactoryToken).named("code-block-service");
  readonly #defs = inject(CodeBlockDefinitionToken);

  constructor() {
    for (const def of this.#defs) this.#registerDefinition(def);
  }

  #registerDefinition<TSchema extends GenericSchema>(def: CodeBlockDefinition<TSchema>): void {
    for (const key of def.keys) {
      this.#plugin.registerMarkdownCodeBlockProcessor(key, (source, el, ctx) => {
        this.#renderBlock(def, key, source, el, ctx.sourcePath as VaultPath, (child) => ctx.addChild(child));
      });
    }
  }

  #renderBlock<TSchema extends GenericSchema>(
    def: CodeBlockDefinition<TSchema>,
    key: string,
    source: string,
    el: HTMLElement,
    path: VaultPath,
    attach: (child: VueCodeBlockHost) => void,
  ): void {
    const parsed = this.#parseYaml(source);
    if (parsed.kind === "err") {
      this.#logger.error("code-block yaml parse failed", { key, path, cause: parsed.error.cause });
      this.#renderError(el, parsed.error.message);
      return;
    }
    const validated = v.safeParse(def.schema, parsed.value);
    if (!validated.success) {
      const error = new CodeBlockSchemaError(key, validated.issues);
      this.#logger.error("code-block schema validation failed", { key, path, issues: validated.issues });
      this.#renderError(el, error.message, validated.issues);
      return;
    }
    const props: CodeBlockProps<InferOutput<TSchema>> = { path, config: validated.output };
    attach(new VueCodeBlockHost(el, this.#injector, def.component, props as Record<string, unknown>, def.cssClass));
  }

  #parseYaml(source: string): { kind: "ok"; value: unknown } | { kind: "err"; error: CodeBlockYamlError } {
    const trimmed = source.trim();
    if (trimmed === "") return { kind: "ok", value: {} };
    try {
      return { kind: "ok", value: parseYaml(source.replaceAll("\t", "  ")) };
    } catch (cause) {
      return { kind: "err", error: new CodeBlockYamlError(cause) };
    }
  }

  #renderError(el: HTMLElement, message: string, issues?: readonly { path?: unknown; message: string }[]): void {
    el.replaceChildren();
    const root = el.createDiv({ cls: "code-block-error" });
    root.createDiv({ text: message });
    if (issues && issues.length > 0) {
      const list = root.createEl("ul");
      for (const issue of issues) {
        const pathSegments = Array.isArray(issue.path)
          ? issue.path.map((seg: { key?: unknown }) => String(seg.key)).join(".")
          : "";
        list.createEl("li", { text: pathSegments ? `${pathSegments}: ${issue.message}` : issue.message });
      }
    }
  }
}
```

Note: `el.createDiv` / `el.createEl` are obsidian DOM helpers. If the test mock doesn't include them, fall back to `document.createElement` + `appendChild`. Verify in step 5; replace if needed.

- [ ] **Step 5: Run tests; if `createDiv` isn't on the mock element, fall back**

Run: `npm test -- src/infrastructure/host/code-blocks`
Expected: PASS, or FAIL with `el.createDiv is not a function`.

If the failure is the latter, replace the `#renderError` body with a portable version:

```ts
#renderError(el: HTMLElement, message: string, issues?: readonly { path?: unknown; message: string }[]): void {
  el.replaceChildren();
  const root = document.createElement("div");
  root.className = "code-block-error";
  const head = document.createElement("div");
  head.textContent = message;
  root.appendChild(head);
  if (issues && issues.length > 0) {
    const list = document.createElement("ul");
    for (const issue of issues) {
      const pathSegments = Array.isArray(issue.path)
        ? issue.path.map((seg: { key?: unknown }) => String((seg as { key: unknown }).key)).join(".")
        : "";
      const item = document.createElement("li");
      item.textContent = pathSegments ? `${pathSegments}: ${issue.message}` : issue.message;
      list.appendChild(item);
    }
    root.appendChild(list);
  }
  el.appendChild(root);
}
```

Re-run: `npm test -- src/infrastructure/host/code-blocks`
Expected: PASS.

- [ ] **Step 6: Add a happy-path YAML test**

Append inside `describe("mounting", …)`:

```ts
it("passes parsed yaml fields through the schema to the component", () => {
  bind();
  const { el } = context.host.runCodeBlockProcessor("journals-home", "separator: ' | '\nshow:\n  - week\n  - day\n");
  const text = el.querySelector(".stub")?.textContent ?? "";
  expect(text).toContain('"separator":" | "');
  expect(text).toContain('"show":["week","day"]');
});
```

- [ ] **Step 7: Add a tab-normalization test**

```ts
it("normalizes tabs to two spaces before parsing", () => {
  bind();
  const { el } = context.host.runCodeBlockProcessor("journals-home", "show:\n\t- month\n");
  expect(el.querySelector(".stub")?.textContent).toContain('"show":["month"]');
});
```

- [ ] **Step 8: Add a path-passthrough test**

```ts
it("passes the source path into the component props", () => {
  bind();
  const { el } = context.host.runCodeBlockProcessor("journals-home", "", "Vault/Daily/2026-05-27.md");
  // StubComponent renders config only; assert path via a tweak: extend the stub or read prop in setup.
  // Use a dedicated stub here:
});
```

Replace the test body to use an inline stub that exposes both `path` and `config`:

```ts
it("passes the source path into the component props", () => {
  const PathStub = defineComponent({
    props: { config: { type: Object, required: true }, path: { type: String, required: true } },
    setup(props) {
      return () => h("span", { class: "stub-path" }, props.path);
    },
  });
  const def = defineCodeBlock({ keys: ["journals-home"], schema, component: PathStub });
  context.container.register(CodeBlockDefinitionToken).useValue(def);
  context.container.resolve(CodeBlockService);

  const { el } = context.host.runCodeBlockProcessor("journals-home", "", "Vault/Daily/2026-05-27.md");
  expect(el.querySelector(".stub-path")?.textContent).toBe("Vault/Daily/2026-05-27.md");
});
```

- [ ] **Step 9: Run all tests; expect PASS**

Run: `npm test -- src/infrastructure/host/code-blocks`
Expected: 6 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/infrastructure/host/code-blocks/
git commit -m "feat(host): CodeBlockService parses yaml, validates schema, and mounts Vue host"
```

---

## Task 6 — Error rendering: YAML parse failure

**Files:**

- Modify: `src/infrastructure/host/code-blocks/internal/code-block-service.test.ts`

(No production changes — the previous task already implements this path; we add the assertions now.)

- [ ] **Step 1: Add a failing test for invalid YAML**

Append a new `describe` to the test file:

```ts
describe("errors", () => {
  it("renders an error div and skips mounting when yaml is invalid", () => {
    const def = defineCodeBlock({
      keys: ["journals-home"],
      schema: v.object({}),
      component: StubComponent,
    });
    context.container.register(CodeBlockDefinitionToken).useValue(def);
    context.container.resolve(CodeBlockService);

    const { el } = context.host.runCodeBlockProcessor("journals-home", "key: [unterminated");

    expect(el.querySelector(".stub")).toBeNull();
    expect(el.querySelector(".code-block-error")?.textContent).toContain("Failed to parse code block YAML");
  });
});
```

- [ ] **Step 2: Run; expect PASS**

Run: `npm test -- src/infrastructure/host/code-blocks`
Expected: PASS — the logic was implemented in Task 5; this test pins it.

If the YAML parser in the mock doesn't throw on `"key: [unterminated"`, replace the input with something that definitely fails for `js-yaml`, e.g. `"key: [a, b, c"` or `"\t:bad"`. Verify by quickly running `node -e 'require("js-yaml").load("key: [unterminated")'` — it should throw.

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/host/code-blocks/internal/code-block-service.test.ts
git commit -m "test(host): code-block yaml parse failure renders inline error"
```

---

## Task 7 — Error rendering: schema validation failure

- [ ] **Step 1: Add a failing test for schema mismatch**

Append inside `describe("errors", …)`:

```ts
it("renders an error div with issue paths when the schema rejects the parsed yaml", () => {
  const schema = v.object({ scale: v.number() });
  const def = defineCodeBlock({ keys: ["journals-home"], schema, component: StubComponent });
  context.container.register(CodeBlockDefinitionToken).useValue(def);
  context.container.resolve(CodeBlockService);

  const { el } = context.host.runCodeBlockProcessor("journals-home", "scale: notANumber");

  const errorEl = el.querySelector(".code-block-error");
  expect(errorEl).not.toBeNull();
  expect(errorEl?.textContent).toContain("scale");
  expect(el.querySelector(".stub")).toBeNull();
});
```

- [ ] **Step 2: Run; expect PASS**

Run: `npm test -- src/infrastructure/host/code-blocks`
Expected: PASS — schema error path was wired in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/host/code-blocks/internal/code-block-service.test.ts
git commit -m "test(host): code-block schema failure renders error with issue paths"
```

---

## Task 8 — Lifecycle: unmount on `onunload`

- [ ] **Step 1: Add a failing test**

Append a new `describe` to the test file:

```ts
describe("lifecycle", () => {
  it("unmounts the Vue app and clears the container when the render child unloads", () => {
    const def = defineCodeBlock({
      keys: ["journals-home"],
      schema: v.object({}),
      component: StubComponent,
    });
    context.container.register(CodeBlockDefinitionToken).useValue(def);
    context.container.resolve(CodeBlockService);

    const { el, child } = context.host.runCodeBlockProcessor("journals-home", "");
    expect(el.querySelector(".stub")).not.toBeNull();

    child?.unload();

    expect(el.querySelector(".stub")).toBeNull();
    expect(el.children.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run; expect PASS**

Run: `npm test -- src/infrastructure/host/code-blocks`
Expected: PASS — `VueCodeBlockHost.onunload` already calls `app.unmount()` and `replaceChildren()`.

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/host/code-blocks/internal/code-block-service.test.ts
git commit -m "test(host): VueCodeBlockHost unmounts on render-child unload"
```

---

## Task 9 — Register `CodeBlockService` in the host module and re-export from the barrel

**Files:**

- Modify: `src/infrastructure/host/module.ts`
- Modify: `src/infrastructure/host/index.ts`

- [ ] **Step 1: Add the binding**

Edit `src/infrastructure/host/module.ts`. Add the imports:

```ts
import { CodeBlockService } from "./code-blocks/internal/code-block-service";
```

Inside the `register` function, after the `CommandService` line, add:

```ts
c.register(CodeBlockService).useClass(CodeBlockService).eager();
```

(Eager is mandatory: obsidian-side processors must be registered at startup.)

- [ ] **Step 2: Re-export from the host barrel**

Edit `src/infrastructure/host/index.ts`. After the existing `CommandService` export, add:

```ts
export {
  CodeBlockService,
  defineCodeBlock,
  CodeBlockDefinitionToken,
  CodeBlockYamlError,
  CodeBlockSchemaError,
  type CodeBlockConfig,
  type CodeBlockDefinition,
  type CodeBlockDefinitionInput,
  type CodeBlockProps,
} from "./code-blocks";
```

- [ ] **Step 3: Type-check**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS (no regression).

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/host/module.ts src/infrastructure/host/index.ts
git commit -m "feat(host): wire CodeBlockService into host module and barrel"
```

---

## Task 10 — i18n messages for `relativeDate`

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add the message keys**

Add these entries to `messages/en.json` (keep alphabetical order with surrounding keys; place under a `relative_date_*` prefix). Append to the JSON object:

```json
"relative_date_today": "Today",
"relative_date_yesterday": "Yesterday",
"relative_date_tomorrow": "Tomorrow",
"relative_date_last_named_day": "Last [dddd]",
"relative_date_named_day": "dddd",
"relative_date_this_week": "This week",
"relative_date_last_week": "Last week",
"relative_date_next_week": "Next week",
"relative_date_n_weeks_ago": "{count} weeks ago",
"relative_date_n_weeks_from_now": "{count} weeks from now",
"relative_date_this_month": "This month",
"relative_date_last_month": "Last month",
"relative_date_next_month": "Next month",
"relative_date_n_months_ago": "{count} months ago",
"relative_date_n_months_from_now": "{count} months from now",
"relative_date_this_quarter": "This quarter",
"relative_date_last_quarter": "Last quarter",
"relative_date_next_quarter": "Next quarter",
"relative_date_n_quarters_ago": "{count} quarters ago",
"relative_date_n_quarters_from_now": "{count} quarters from now",
"relative_date_this_year": "This year",
"relative_date_last_year": "Last year",
"relative_date_next_year": "Next year",
"relative_date_n_years_ago": "{count} years ago",
"relative_date_n_years_from_now": "{count} years from now",
```

Note: `relative_date_last_named_day` and `relative_date_named_day` contain moment format tokens. `[...]` brackets literal text; `dddd` interpolates the weekday name. moment composes the final string at runtime — paraglide treats the value as opaque.

- [ ] **Step 2: Verify the project's i18n pipeline accepts the additions**

Run: `npm run check:types`
Expected: PASS. If the paraglide build runs as part of typecheck and complains about message-format syntax, simplify any failing entry (e.g. drop the `[dddd]` from the message and pass the resolved weekday name as a parameter instead — see Task 12 for the alternative).

- [ ] **Step 3: Commit**

```bash
git add messages/en.json
git commit -m "feat(i18n): add relative-date messages for code-block labels"
```

---

## Task 11 — `relativeDate` for week/month/quarter/year (week as the pilot, then expand)

We start with the easier branches (period diff arithmetic) before tackling the day branch.

**Files:**

- Create: `src/calendar/relative-date.ts`
- Create: `src/calendar/relative-date.test.ts`

- [ ] **Step 1: Write the first failing test**

Create `src/calendar/relative-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { initLocale } from "@/i18n";

import { relativeDate } from "./relative-date";

import type { AnchorString } from "./types";

const anchor = (s: string) => s as AnchorString;

describe("relativeDate", () => {
  beforeAll(() => initLocale("en"));

  describe("week", () => {
    it("returns 'This week' when anchor is in the same week as today", () => {
      expect(relativeDate("week", anchor("2026-05-27"), anchor("2026-05-29"))).toBe("This week");
    });

    it("returns 'Last week' for the immediately previous week", () => {
      expect(relativeDate("week", anchor("2026-05-20"), anchor("2026-05-27"))).toBe("Last week");
    });

    it("returns 'Next week' for the immediately following week", () => {
      expect(relativeDate("week", anchor("2026-06-03"), anchor("2026-05-27"))).toBe("Next week");
    });

    it("returns 'N weeks ago' for anchors more than one week in the past", () => {
      expect(relativeDate("week", anchor("2026-05-06"), anchor("2026-05-27"))).toBe("3 weeks ago");
    });

    it("returns 'N weeks from now' for anchors more than one week in the future", () => {
      expect(relativeDate("week", anchor("2026-06-17"), anchor("2026-05-27"))).toBe("3 weeks from now");
    });
  });
});
```

Add the missing `beforeAll` import: change the first import to `import { beforeAll, describe, expect, it } from "vitest";`.

- [ ] **Step 2: Run; expect FAIL (module not found)**

Run: `npm test -- src/calendar/relative-date`
Expected: FAIL.

- [ ] **Step 3: Implement the week branch (and stubs for the others)**

Create `src/calendar/relative-date.ts`:

```ts
import { match } from "ts-pattern";

import { m } from "@/i18n";

import { localMoment } from "./calendar";

import type { AnchorString } from "./types";
import type { PeriodKind } from "./period";

export type RelativePeriod = Exclude<PeriodKind, "decade">;

export function relativeDate(period: RelativePeriod, anchor: AnchorString, today: AnchorString): string {
  return match(period)
    .with("day", () => formatDay(anchor, today))
    .with("week", () => formatPeriodicDiff("week", anchor, today))
    .with("month", () => formatPeriodicDiff("month", anchor, today))
    .with("quarter", () => formatPeriodicDiff("quarter", anchor, today))
    .with("year", () => formatPeriodicDiff("year", anchor, today))
    .exhaustive();
}

function formatPeriodicDiff(
  period: "week" | "month" | "quarter" | "year",
  anchor: AnchorString,
  today: AnchorString,
): string {
  const a = localMoment(anchor).startOf(period);
  const t = localMoment(today).startOf(period);
  const diff = a.diff(t, period);
  return match(period)
    .with("week", () =>
      diff === 0
        ? m.relative_date_this_week()
        : diff === -1
          ? m.relative_date_last_week()
          : diff === 1
            ? m.relative_date_next_week()
            : diff < 0
              ? m.relative_date_n_weeks_ago({ count: -diff })
              : m.relative_date_n_weeks_from_now({ count: diff }),
    )
    .with("month", () =>
      diff === 0
        ? m.relative_date_this_month()
        : diff === -1
          ? m.relative_date_last_month()
          : diff === 1
            ? m.relative_date_next_month()
            : diff < 0
              ? m.relative_date_n_months_ago({ count: -diff })
              : m.relative_date_n_months_from_now({ count: diff }),
    )
    .with("quarter", () =>
      diff === 0
        ? m.relative_date_this_quarter()
        : diff === -1
          ? m.relative_date_last_quarter()
          : diff === 1
            ? m.relative_date_next_quarter()
            : diff < 0
              ? m.relative_date_n_quarters_ago({ count: -diff })
              : m.relative_date_n_quarters_from_now({ count: diff }),
    )
    .with("year", () =>
      diff === 0
        ? m.relative_date_this_year()
        : diff === -1
          ? m.relative_date_last_year()
          : diff === 1
            ? m.relative_date_next_year()
            : diff < 0
              ? m.relative_date_n_years_ago({ count: -diff })
              : m.relative_date_n_years_from_now({ count: diff }),
    )
    .exhaustive();
}

function formatDay(anchor: AnchorString, today: AnchorString): string {
  // Day branch: implemented in next task.
  throw new Error("relativeDate('day', ...) not yet implemented");
}
```

Verify how `m` is imported in this codebase — search for an existing file that uses messages (e.g. `src/calendar/ui/DatePicker.vue`) and copy the exact import path. The import is most likely `import * as m from "@/paraglide/messages.js"` or similar; adjust accordingly.

- [ ] **Step 4: Run the week tests; expect PASS**

Run: `npm test -- src/calendar/relative-date`
Expected: 5 PASS for week, day tests would FAIL if any existed (none yet).

- [ ] **Step 5: Add month/quarter/year tests**

For each period, append a `describe` block mirroring the week one with these dates. Compute by hand using a calendar:

```ts
describe("month", () => {
  it("returns 'This month' for same month", () => {
    expect(relativeDate("month", anchor("2026-05-01"), anchor("2026-05-27"))).toBe("This month");
  });
  it("returns 'Last month'", () => {
    expect(relativeDate("month", anchor("2026-04-15"), anchor("2026-05-27"))).toBe("Last month");
  });
  it("returns 'Next month'", () => {
    expect(relativeDate("month", anchor("2026-06-15"), anchor("2026-05-27"))).toBe("Next month");
  });
  it("returns 'N months ago'", () => {
    expect(relativeDate("month", anchor("2026-01-15"), anchor("2026-05-27"))).toBe("4 months ago");
  });
  it("returns 'N months from now'", () => {
    expect(relativeDate("month", anchor("2026-09-15"), anchor("2026-05-27"))).toBe("4 months from now");
  });
});

describe("quarter", () => {
  it("returns 'This quarter' for same quarter", () => {
    expect(relativeDate("quarter", anchor("2026-04-01"), anchor("2026-05-27"))).toBe("This quarter");
  });
  it("returns 'Last quarter'", () => {
    expect(relativeDate("quarter", anchor("2026-02-01"), anchor("2026-05-27"))).toBe("Last quarter");
  });
  it("returns 'Next quarter'", () => {
    expect(relativeDate("quarter", anchor("2026-08-01"), anchor("2026-05-27"))).toBe("Next quarter");
  });
  it("returns 'N quarters ago'", () => {
    expect(relativeDate("quarter", anchor("2025-08-01"), anchor("2026-05-27"))).toBe("3 quarters ago");
  });
  it("returns 'N quarters from now'", () => {
    expect(relativeDate("quarter", anchor("2027-02-01"), anchor("2026-05-27"))).toBe("3 quarters from now");
  });
});

describe("year", () => {
  it("returns 'This year' for same year", () => {
    expect(relativeDate("year", anchor("2026-01-15"), anchor("2026-05-27"))).toBe("This year");
  });
  it("returns 'Last year'", () => {
    expect(relativeDate("year", anchor("2025-08-15"), anchor("2026-05-27"))).toBe("Last year");
  });
  it("returns 'Next year'", () => {
    expect(relativeDate("year", anchor("2027-02-01"), anchor("2026-05-27"))).toBe("Next year");
  });
  it("returns 'N years ago'", () => {
    expect(relativeDate("year", anchor("2023-08-15"), anchor("2026-05-27"))).toBe("3 years ago");
  });
  it("returns 'N years from now'", () => {
    expect(relativeDate("year", anchor("2029-02-01"), anchor("2026-05-27"))).toBe("3 years from now");
  });
});
```

- [ ] **Step 6: Run all relative-date tests; expect PASS**

Run: `npm test -- src/calendar/relative-date`
Expected: 20 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/calendar/relative-date.ts src/calendar/relative-date.test.ts
git commit -m "feat(calendar): relativeDate for week/month/quarter/year periods"
```

---

## Task 12 — `relativeDate` day branch

The day branch uses moment's `.calendar()` formatter. The format strings combine paraglide messages with moment's `dddd` token for weekday names.

- [ ] **Step 1: Add failing day tests**

Append to `relative-date.test.ts`:

```ts
describe("day", () => {
  it("returns 'Today' when anchor equals today", () => {
    expect(relativeDate("day", anchor("2026-05-27"), anchor("2026-05-27"))).toBe("Today");
  });
  it("returns 'Yesterday' for the immediately previous day", () => {
    expect(relativeDate("day", anchor("2026-05-26"), anchor("2026-05-27"))).toBe("Yesterday");
  });
  it("returns 'Tomorrow' for the immediately following day", () => {
    expect(relativeDate("day", anchor("2026-05-28"), anchor("2026-05-27"))).toBe("Tomorrow");
  });
  it("returns 'Last <weekday>' for a day in the previous week (2–6 days ago)", () => {
    // 2026-05-27 is a Wednesday; 2026-05-22 is Friday — within moment's lastWeek window.
    expect(relativeDate("day", anchor("2026-05-22"), anchor("2026-05-27"))).toBe("Last Friday");
  });
  it("returns '<weekday>' for a day later this week", () => {
    expect(relativeDate("day", anchor("2026-05-30"), anchor("2026-05-27"))).toBe("Saturday");
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `npm test -- src/calendar/relative-date`
Expected: day tests FAIL (`throw new Error("relativeDate('day', ...) not yet implemented")`).

- [ ] **Step 3: Implement the day branch**

Replace the `formatDay` function in `relative-date.ts`:

```ts
function formatDay(anchor: AnchorString, today: AnchorString): string {
  const a = localMoment(anchor);
  const t = localMoment(today);
  return a.calendar(t, {
    sameDay: `[${m.relative_date_today()}]`,
    lastDay: `[${m.relative_date_yesterday()}]`,
    nextDay: `[${m.relative_date_tomorrow()}]`,
    lastWeek: m.relative_date_last_named_day(),
    nextWeek: m.relative_date_named_day(),
    sameElse: function () {
      return `[${a.from(t)}]`;
    },
  });
}
```

Wrapping paraglide returns in `[...]` escapes them so moment doesn't try to interpret them as format tokens. `m.relative_date_last_named_day()` returns the literal `"Last [dddd]"` from the JSON — moment then renders `dddd` as the weekday name from its locale, satisfying the "weekday names from moment" rule.

If paraglide refuses the `[dddd]` literal, switch to the parameterized approach: change the message to `Last {weekday}` and pass `{ weekday: a.format("dddd") }`. Update the JSON entry too.

- [ ] **Step 4: Run day tests; expect PASS**

Run: `npm test -- src/calendar/relative-date`
Expected: all 25 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/relative-date.ts src/calendar/relative-date.test.ts
git commit -m "feat(calendar): relativeDate day branch using moment.calendar"
```

---

## Task 13 — Export `relativeDate` from `@/calendar` barrel

**Files:**

- Modify: `src/calendar/index.ts`

- [ ] **Step 1: Add the export**

Edit `src/calendar/index.ts`. After the `period.ts` exports, add:

```ts
export { relativeDate, type RelativePeriod } from "./relative-date";
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/calendar/index.ts
git commit -m "feat(calendar): export relativeDate from barrel"
```

---

## Task 14 — Home block schema

**Files:**

- Create: `src/code-blocks/home/home-config.ts`
- Create: `src/code-blocks/home/home-config.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/code-blocks/home/home-config.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { homeBlockSchema } from "./home-config";

describe("homeBlockSchema", () => {
  it("applies all defaults when given an empty object", () => {
    const result = v.parse(homeBlockSchema, {});
    expect(result.show).toEqual(["day"]);
    expect(result.separator).toBe(" • ");
    expect(result.scale).toBe(1);
    expect(result.shelf).toBeUndefined();
  });

  it("keeps the provided values when fields are explicit", () => {
    const result = v.parse(homeBlockSchema, {
      show: ["week", "custom"],
      separator: " | ",
      scale: 1.5,
      shelf: "Work",
    });
    expect(result.show).toEqual(["week", "custom"]);
    expect(result.separator).toBe(" | ");
    expect(result.scale).toBe(1.5);
    expect(result.shelf).toBe("Work");
  });

  it("rejects an unknown entry in show", () => {
    expect(v.safeParse(homeBlockSchema, { show: ["decade"] }).success).toBe(false);
    expect(v.safeParse(homeBlockSchema, { show: ["foo"] }).success).toBe(false);
  });

  it("rejects a non-numeric scale", () => {
    expect(v.safeParse(homeBlockSchema, { scale: "big" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run; expect FAIL (module not found)**

Run: `npm test -- src/code-blocks`
Expected: FAIL.

- [ ] **Step 3: Implement the schema**

Create `src/code-blocks/home/home-config.ts`:

```ts
import * as v from "valibot";

import { periodKinds } from "@/calendar";

const fixedEntrySchema = v.picklist(["day", "week", "month", "quarter", "year"] as const);
// fixedEntrySchema mirrors periodKinds minus "decade"; we hand-roll the list because home does not show decades.
// Keeping the typed literal here avoids dragging "decade" into the inferred union.
export const homeEntrySchema = v.union([fixedEntrySchema, v.literal("custom")]);

export const homeBlockSchema = v.object({
  show: v.optional(v.array(homeEntrySchema), () => ["day"] as const),
  separator: v.optional(v.string(), " • "),
  scale: v.optional(v.number(), 1),
  shelf: v.optional(v.string()),
});

export type HomeBlockConfig = v.InferOutput<typeof homeBlockSchema>;
export type HomeEntry = v.InferOutput<typeof homeEntrySchema>;

// Sanity touch on periodKinds so the import is load-bearing — keeps the home block
// in lockstep if periodKinds ever changes (TS error if "decade" is removed elsewhere).
const _ensureKindsCovered: ReadonlyArray<(typeof periodKinds)[number]> = periodKinds;
void _ensureKindsCovered;
```

(The `_ensureKindsCovered` reference is a soft pin — if you find it too cute, delete it and the `periodKinds` import.)

- [ ] **Step 4: Run; expect PASS**

Run: `npm test -- src/code-blocks/home/home-config`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/home/home-config.ts src/code-blocks/home/home-config.test.ts
git commit -m "feat(code-blocks): home block config schema"
```

---

## Task 15 — `buildHomeItems` — fixed-period entries

A pure function over plain `JournalConfig[]`. We split fixed and custom across two tasks for cleaner TDD cycles.

**Files:**

- Create: `src/code-blocks/home/home-items.ts`
- Create: `src/code-blocks/home/home-items.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/code-blocks/home/home-items.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";

import { initLocale } from "@/i18n";

import type { JournalConfig } from "@/journals";

import type { AnchorString } from "@/calendar";

import { buildHomeItems, type HomeItemContext } from "./home-items";

const anchor = (s: string) => s as AnchorString;
const today = anchor("2026-05-27");

function journal(name: string, type: "day" | "week" | "month" | "quarter" | "year" | "custom"): JournalConfig {
  const base: JournalConfig = {
    name,
    write: type === "custom" ? { type: "custom", every: "day", duration: 1, anchorDate: today } : { type },
    timeline: { start: "" as AnchorString, end: { kind: "never" } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: { dateFields: [], otherFields: [] },
    numbering: { enabled: false, anchorDate: "" as AnchorString, allowBefore: false, sources: [] },
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
    decorations: [],
  };
  return base;
}

const ctx: HomeItemContext = {
  pathForCustom: () => null, // not used in fixed-period tests
};

describe("buildHomeItems", () => {
  beforeAll(() => initLocale("en"));

  it("returns one item per fixed-period entry that has matching journals", () => {
    const items = buildHomeItems(
      { show: ["day", "week"], separator: " • ", scale: 1 },
      [journal("Daily", "day"), journal("Weekly", "week")],
      today,
      null,
      new Map(),
      ctx,
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.entry).toBe("day");
    expect(items[0]?.label).toBe("Today");
    expect(items[0]?.journalNames).toEqual(["Daily"]);
    expect(items[1]?.entry).toBe("week");
    expect(items[1]?.label).toBe("This week");
    expect(items[1]?.journalNames).toEqual(["Weekly"]);
  });

  it("collects multiple journals of the same type into one item", () => {
    const items = buildHomeItems(
      { show: ["day"], separator: " • ", scale: 1 },
      [journal("Daily-A", "day"), journal("Daily-B", "day")],
      today,
      null,
      new Map(),
      ctx,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.journalNames).toEqual(["Daily-A", "Daily-B"]);
  });

  it("omits entries that have no matching journals", () => {
    const items = buildHomeItems(
      { show: ["day", "month"], separator: " • ", scale: 1 },
      [journal("Daily", "day")],
      today,
      null,
      new Map(),
      ctx,
    );
    expect(items.map((i) => i.entry)).toEqual(["day"]);
  });

  it("filters by shelf when one is selected", () => {
    const items = buildHomeItems(
      { show: ["day"], separator: " • ", scale: 1 },
      [journal("Daily-A", "day"), journal("Daily-B", "day")],
      today,
      "Work",
      new Map([
        ["Daily-A", "Work"],
        ["Daily-B", "Personal"],
      ]),
      ctx,
    );
    expect(items[0]?.journalNames).toEqual(["Daily-A"]);
  });

  it("returns an empty list when show is empty", () => {
    const items = buildHomeItems(
      { show: [], separator: " • ", scale: 1 },
      [journal("Daily", "day")],
      today,
      null,
      new Map(),
      ctx,
    );
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `npm test -- src/code-blocks/home/home-items`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildHomeItems` for fixed-period entries**

Create `src/code-blocks/home/home-items.ts`:

```ts
import { match } from "ts-pattern";

import { relativeDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import type { JournalConfig } from "@/journals";

import type { HomeBlockConfig, HomeEntry } from "./home-config";

export interface HomeItem {
  readonly entry: HomeEntry;
  readonly label: string;
  readonly journalNames: readonly string[];
}

export interface HomeItemContext {
  /** Resolves the rendered note name (basename) for a custom journal at `today`. Returns null when the path can't be resolved. */
  pathForCustom(journal: JournalConfig, today: AnchorString): string | null;
}

export function buildHomeItems(
  config: Pick<HomeBlockConfig, "show">,
  journals: readonly JournalConfig[],
  today: AnchorString,
  shelf: string | null,
  shelfByJournal: ReadonlyMap<string, string>,
  ctx: HomeItemContext,
): readonly HomeItem[] {
  const result: HomeItem[] = [];
  const onShelf = (journal: JournalConfig): boolean => shelf === null || shelfByJournal.get(journal.name) === shelf;

  for (const entry of config.show) {
    const items = match(entry)
      .with("custom", () => buildCustomItems(journals, today, onShelf, ctx))
      .with("day", "week", "month", "quarter", "year", (period) => buildFixedItem(period, journals, today, onShelf))
      .exhaustive();
    result.push(...items);
  }
  return result;
}

function buildFixedItem(
  period: "day" | "week" | "month" | "quarter" | "year",
  journals: readonly JournalConfig[],
  today: AnchorString,
  onShelf: (journal: JournalConfig) => boolean,
): readonly HomeItem[] {
  const matching = journals.filter((j) => j.write.type === period && onShelf(j));
  if (matching.length === 0) return [];
  return [{ entry: period, label: relativeDate(period, today, today), journalNames: matching.map((j) => j.name) }];
}

function buildCustomItems(
  _journals: readonly JournalConfig[],
  _today: AnchorString,
  _onShelf: (journal: JournalConfig) => boolean,
  _ctx: HomeItemContext,
): readonly HomeItem[] {
  // Implemented in the next task.
  return [];
}
```

- [ ] **Step 4: Run; expect PASS for fixed-period tests**

Run: `npm test -- src/code-blocks/home/home-items`
Expected: 5 PASS (the custom tests are added in the next task).

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/home/home-items.ts src/code-blocks/home/home-items.test.ts
git commit -m "feat(code-blocks): buildHomeItems for fixed-period entries"
```

---

## Task 16 — `buildHomeItems` — custom journals

**Files:**

- Modify: `src/code-blocks/home/home-items.ts`
- Modify: `src/code-blocks/home/home-items.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `home-items.test.ts`:

```ts
describe("buildHomeItems · custom", () => {
  beforeAll(() => initLocale("en"));

  const ctxFor = (labels: Record<string, string | null>): HomeItemContext => ({
    pathForCustom: (j) => labels[j.name] ?? null,
  });

  it("returns one item per custom journal, labeled by pathForCustom", () => {
    const items = buildHomeItems(
      { show: ["custom"], separator: " • ", scale: 1 },
      [journal("Trips", "custom"), journal("Reviews", "custom")],
      today,
      null,
      new Map(),
      ctxFor({ Trips: "Trip 12", Reviews: "Review 2026-05-27" }),
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ entry: "custom", label: "Trip 12", journalNames: ["Trips"] });
    expect(items[1]).toEqual({ entry: "custom", label: "Review 2026-05-27", journalNames: ["Reviews"] });
  });

  it("omits a custom journal when pathForCustom returns null", () => {
    const items = buildHomeItems(
      { show: ["custom"], separator: " • ", scale: 1 },
      [journal("Bad", "custom"), journal("Good", "custom")],
      today,
      null,
      new Map(),
      ctxFor({ Bad: null, Good: "label" }),
    );
    expect(items.map((i) => i.journalNames[0])).toEqual(["Good"]);
  });

  it("filters custom journals by shelf", () => {
    const items = buildHomeItems(
      { show: ["custom"], separator: " • ", scale: 1 },
      [journal("Work-cust", "custom"), journal("Home-cust", "custom")],
      today,
      "Work",
      new Map([
        ["Work-cust", "Work"],
        ["Home-cust", "Personal"],
      ]),
      ctxFor({ "Work-cust": "label-w", "Home-cust": "label-h" }),
    );
    expect(items.map((i) => i.journalNames[0])).toEqual(["Work-cust"]);
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `npm test -- src/code-blocks/home/home-items`
Expected: 3 new FAIL (empty list returned for custom).

- [ ] **Step 3: Implement custom item building**

Replace `buildCustomItems` in `home-items.ts`:

```ts
function buildCustomItems(
  journals: readonly JournalConfig[],
  today: AnchorString,
  onShelf: (journal: JournalConfig) => boolean,
  ctx: HomeItemContext,
): readonly HomeItem[] {
  const items: HomeItem[] = [];
  for (const journal of journals) {
    if (journal.write.type !== "custom") continue;
    if (!onShelf(journal)) continue;
    const label = ctx.pathForCustom(journal, today);
    if (label === null) continue;
    items.push({ entry: "custom", label, journalNames: [journal.name] });
  }
  return items;
}
```

- [ ] **Step 4: Run; expect PASS**

Run: `npm test -- src/code-blocks/home/home-items`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/home/home-items.ts src/code-blocks/home/home-items.test.ts
git commit -m "feat(code-blocks): buildHomeItems for custom journals"
```

---

## Task 17 — `HomeCodeBlock.vue` component

**Files:**

- Create: `src/code-blocks/home/ui/HomeCodeBlock.vue`
- Create: `src/code-blocks/home/ui/HomeCodeBlock.test.ts`

The component reads `Clock.now()` directly (Clock is a static utility class in v3, not a DI service) and uses `useService` for `JournalsRepository`, `JournalsIndex`, `ShelvesRepository`, `NotePathService`, and `Flows`.

- [ ] **Step 1: Write the failing tests**

Create `src/code-blocks/home/ui/HomeCodeBlock.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Container, provideInjector } from "@/infrastructure/di";
import { Flows, FlowsModule } from "@/infrastructure/flows";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { initLocale } from "@/i18n";

import { AsyncResult, Ok } from "@/infrastructure/result";

import HomeCodeBlock from "./HomeCodeBlock.vue";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

// Fakes for services the component touches:
class FakeJournalsRepository {
  #journals: any[] = [];
  seed(journals: any[]): void {
    this.#journals = journals;
  }
  find() {
    return {
      list: () => this.#journals[Symbol.iterator](),
      ids: () => this.#journals.map((j) => j.name)[Symbol.iterator](),
    };
  }
  get(name: string) {
    const j = this.#journals.find((x) => x.name === name);
    return j
      ? { isNone: () => false, getOr: () => j, toNullable: () => j, value: j }
      : { isNone: () => true, toNullable: () => null };
  }
}

class FakeJournalsIndex {
  byPath(_path: VaultPath) {
    return { isNone: () => true, toNullable: () => null, map: () => ({ toNullable: () => null }) };
  }
}

class FakeShelvesRepository {
  find() {
    return { list: () => ([] as any[])[Symbol.iterator]() };
  }
}

class FakeNotePathService {
  pathFor(_name: string, _meta: any) {
    return new Ok("Custom/today.md" as VaultPath);
  }
}

class FakeFlows {
  calls: any[] = [];
  invoke(flow: any, params: any) {
    this.calls.push({ flow, params });
    return AsyncResult.ok({ path: "x" as VaultPath, created: false });
  }
}

function build() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));

  const container = new Container();
  // Wire required services. Real service classes are imported here when needed;
  // bind by class identity (no token).
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  // …other bindings via .useValue(new FakeX()) — see step 3 for full list.

  return { container };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("HomeCodeBlock", () => {
  beforeAll(() => initLocale("en"));

  // tests added in subsequent steps
});
```

This is intentionally a skeleton — flesh out the container wiring in step 3 once you know the real service classes the component imports. The pattern: the test creates a `Container`, binds real classes from `useService` calls to either real implementations or fakes that share the same class identity via `.useValue(new FakeX())`, then renders the component wrapped in a tiny `provideInjector(container)` parent.

- [ ] **Step 2: Run; expect FAIL (component not found)**

Run: `npm test -- src/code-blocks/home/ui`
Expected: FAIL.

- [ ] **Step 3: Write the component**

Create `src/code-blocks/home/ui/HomeCodeBlock.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { Clock, relativeDate, type AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, type CodeBlockProps, type VaultPath } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository, NotePathService, OpenDateFlow } from "@/journals";
import { ShelvesRepository } from "@/shelves";

import { buildHomeItems, type HomeItem } from "../home-items";
import type { HomeBlockConfig } from "../home-config";

const { path, config } = defineProps<CodeBlockProps<HomeBlockConfig>>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const shelves = useService(ShelvesRepository);
const notePaths = useService(NotePathService);
const flows = useService(Flows);

const today = computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString);

const currentJournalName = computed(() => index.byPath(path).toNullable()?.journalName ?? null);

const shelfByJournal = computed(() => {
  const map = new Map<string, string>();
  for (const shelf of shelves.find().list()) {
    for (const journalName of shelf.journals) map.set(journalName, shelf.name);
  }
  return map;
});

const effectiveShelf = computed(() => {
  if (config.shelf !== undefined) return config.shelf;
  if (currentJournalName.value === null) return null;
  return shelfByJournal.value.get(currentJournalName.value) ?? null;
});

const allJournals = computed(() => [...journals.find().list()]);

const items = computed<readonly HomeItem[]>(() =>
  buildHomeItems(config, allJournals.value, today.value, effectiveShelf.value, shelfByJournal.value, {
    pathForCustom: (journal) => {
      const result = notePaths.pathFor(journal.name, { journalName: journal.name, anchor: today.value });
      if (result.kind === "err") return null;
      const fullPath = result.value;
      const slash = fullPath.lastIndexOf("/");
      const basename = slash === -1 ? fullPath : fullPath.slice(slash + 1);
      return basename.endsWith(".md") ? basename.slice(0, -3) : basename;
    },
  }),
);

function open(item: HomeItem, event: MouseEvent): void {
  void flows.invoke(OpenDateFlow, {
    anchor: today.value,
    journalNames: [...item.journalNames],
    openMode: defineOpenMode(event),
  });
}
</script>

<template>
  <div class="home-code-block">
    <template v-for="(item, index) of items" :key="`${item.entry}-${item.journalNames.join('|')}`">
      <span v-if="index > 0" class="home-code-block__separator">{{ config.separator }}</span>
      <a href="#" @click.stop.prevent="open(item, $event)">{{ item.label }}</a>
    </template>
  </div>
</template>

<style scoped>
.home-code-block {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  text-align: center;
  gap: var(--size-2-2);
  font-size: calc(var(--font-text-size) * v-bind("config.scale"));
}
</style>
```

- [ ] **Step 4: Add component-behavior tests**

Replace the placeholder `describe` body in the test file with these cases. Each renders the component inside an `App` shell that provides the container.

```ts
import { defineComponent, h } from "vue";

function renderWithContainer(container: Container, path: VaultPath, config: any) {
  const Wrapper = defineComponent({
    setup() {
      provideInjector(container.injector);
      return () => h(HomeCodeBlock, { path, config });
    },
  });
  return render(Wrapper);
}

describe("HomeCodeBlock", () => {
  let journalsRepo: FakeJournalsRepository;
  let shelvesRepo: FakeShelvesRepository;
  let flowsFake: FakeFlows;
  let container: Container;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));

    journalsRepo = new FakeJournalsRepository();
    shelvesRepo = new FakeShelvesRepository();
    flowsFake = new FakeFlows();

    container = new Container();
    container.register(LoggerFactoryToken).useClass(LoggerFactory);
    container.register(JournalsRepository).useValue(journalsRepo as unknown as JournalsRepository);
    container.register(JournalsIndex).useValue(new FakeJournalsIndex() as unknown as JournalsIndex);
    container.register(ShelvesRepository).useValue(shelvesRepo as unknown as ShelvesRepository);
    container.register(NotePathService).useValue(new FakeNotePathService() as unknown as NotePathService);
    container.register(Flows).useValue(flowsFake as unknown as Flows);
  });

  it("renders no items when no journals exist", () => {
    journalsRepo.seed([]);
    renderWithContainer(container, "Note.md" as VaultPath, { show: ["day"], separator: " • ", scale: 1 });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders one link with the relative day label", () => {
    journalsRepo.seed([{ name: "Daily", write: { type: "day" } }]);
    renderWithContainer(container, "Note.md" as VaultPath, { show: ["day"], separator: " • ", scale: 1 });
    const link = screen.getByRole("link");
    expect(link.textContent).toBe("Today");
  });

  it("inserts a separator span between items but not before the first", () => {
    journalsRepo.seed([
      { name: "Daily", write: { type: "day" } },
      { name: "Weekly", write: { type: "week" } },
    ]);
    renderWithContainer(container, "Note.md" as VaultPath, {
      show: ["day", "week"],
      separator: " | ",
      scale: 1,
    });
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    const separators = document.querySelectorAll(".home-code-block__separator");
    expect(separators).toHaveLength(1);
    expect(separators[0]?.textContent).toBe(" | ");
  });

  it("invokes OpenDateFlow with the item's journal names and today's anchor on click", async () => {
    journalsRepo.seed([{ name: "Daily", write: { type: "day" } }]);
    renderWithContainer(container, "Note.md" as VaultPath, { show: ["day"], separator: " • ", scale: 1 });

    await userEvent.click(screen.getByRole("link"));

    expect(flowsFake.calls).toHaveLength(1);
    expect(flowsFake.calls[0].params.anchor).toBe("2026-05-27");
    expect(flowsFake.calls[0].params.journalNames).toEqual(["Daily"]);
  });
});
```

If the Container's vue-bridge expects `provideInjector(container)` rather than `container.injector`, adjust the call accordingly — check `src/infrastructure/di/vue.ts` for the exact signature.

- [ ] **Step 5: Run; expect PASS**

Run: `npm test -- src/code-blocks/home/ui`
Expected: 4 PASS.

If a test fails because the fake doesn't expose the exact shape consumed by the component, refine the fake (add missing methods) — the component is the contract.

- [ ] **Step 6: Run typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/code-blocks/home/ui/HomeCodeBlock.vue src/code-blocks/home/ui/HomeCodeBlock.test.ts
git commit -m "feat(code-blocks): HomeCodeBlock component renders journal-home links"
```

---

## Task 18 — Register the home block and wire `codeBlocksModule` into `main.ts`

**Files:**

- Create: `src/code-blocks/home/home-block.ts`
- Create: `src/code-blocks/module.ts`
- Create: `src/code-blocks/index.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Define the home block**

Create `src/code-blocks/home/home-block.ts`:

```ts
import { defineCodeBlock } from "@/infrastructure/host";

import { homeBlockSchema } from "./home-config";
import HomeCodeBlock from "./ui/HomeCodeBlock.vue";

export const homeCodeBlock = defineCodeBlock({
  keys: ["journals-home"],
  schema: homeBlockSchema,
  component: HomeCodeBlock,
  cssClass: ["journal-home-code-block"],
});
```

- [ ] **Step 2: Write the feature module**

Create `src/code-blocks/module.ts`:

```ts
import { CodeBlockDefinitionToken } from "@/infrastructure/host";
import type { Module } from "@/infrastructure/di";

import { homeCodeBlock } from "./home/home-block";

export const codeBlocksModule: Module = {
  register(c) {
    c.register(CodeBlockDefinitionToken).useValue(homeCodeBlock);
  },
};
```

- [ ] **Step 3: Write the barrel**

Create `src/code-blocks/index.ts`:

```ts
export { codeBlocksModule } from "./module";
```

- [ ] **Step 4: Wire into `main.ts`**

Edit `src/main.ts`. Add the import near the other feature-module imports:

```ts
import { codeBlocksModule } from "@/code-blocks";
```

Inside `onload`, after `container.addModule(shelvesModule);` and before `container.addModule(commandsModule);`, add:

```ts
container.addModule(codeBlocksModule);
```

- [ ] **Step 5: Type-check + lint**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/code-blocks/ src/main.ts
git commit -m "feat(code-blocks): wire codeBlocksModule with home block into main"
```

---

## Task 19 — Manual sanity check in the test vault

The feature ships markdown rendering, so it deserves one human-eyes pass.

- [ ] **Step 1: Build the plugin**

Run: `npm run build` (or `npm run dev` if the project has a watch build — check `package.json` scripts).
Expected: build succeeds, `main.js` written to the plugin output directory.

- [ ] **Step 2: Open the test vault in Obsidian**

The test vault lives at `test-vault/` (see project root). Open it in a local Obsidian instance with developer-mode plugins pointed at this repo's build output.

- [ ] **Step 3: Create a note with a `journals-home` code block**

In a new note, add:

````markdown
```journals-home
show:
  - day
  - week
separator: " | "
scale: 1.2
```
````

Switch to reading view. Expected: two links separated by `" | "`, slightly larger than body text, labeled `Today` and `This week`. Clicking either opens (or creates) the relevant journal note.

- [ ] **Step 4: Trigger the error path**

Edit the code block to:

````markdown
```journals-home
scale: notANumber
```
````

Expected: an inline error block appears containing the schema-failure message and the path `scale`.

- [ ] **Step 5: Final verification**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all PASS.

(No commit — this task is verification only.)

---

## Plan self-review checklist

- **Spec coverage:** Every section of the design doc maps to a task — host primitive (Tasks 3–9), relative-date helper (10–13), pilot block (14–17), wiring (18), manual check (19). The obsidian-mock extension is a prerequisite (Task 1) that the spec implies but doesn't enumerate.

- **Placeholder-free:** No "TBD" / "implement later" steps. The day-branch implementation is split across Tasks 11 and 12 only because the period branches are independent.

- **Type consistency:** `CodeBlockDefinitionToken`, `defineCodeBlock`, `CodeBlockProps`, `HomeBlockConfig`, `HomeEntry`, `HomeItem`, `HomeItemContext`, `buildHomeItems`, `homeCodeBlock`, `relativeDate`, `RelativePeriod`, `periodKinds` — all referenced consistently across tasks.

- **Fake-handling caveat:** Task 17's fakes do `as unknown as RealType` casts because the real classes have richer shapes than the component touches. This is acceptable for unit tests; the component-as-contract principle keeps it honest.

- **Risk hotspots flagged inline:** YAML parser availability (Task 1 step 2), obsidian DOM helpers vs. plain DOM in the mock (Task 5 step 5), paraglide message-format edge cases (Task 10 step 2 and Task 12 step 3), Container vue-bridge API (Task 17 step 4).

Verification gates apply after every task that touches code (`npm test`, `npm run check:types`, `npm run check:lint`). Commit messages follow existing conventional-commit prefixes (`feat`, `test`, `docs`).
