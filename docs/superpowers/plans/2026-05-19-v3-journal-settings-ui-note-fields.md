# v3 Journal Settings UI — Note Creation Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the five new `JournalConfig` note-creation fields
(`nameTemplate`, `folder`, `templates`, `confirmCreation`, `autoCreate`)
in `JournalEditSubpage.vue` with v2 fidelity (autocomplete inputs, live
previews, recommendation banners), and stand up the inline-suggest host
primitive the autocomplete inputs depend on.

**Architecture:** Three phases. Phase 1 adds a new `host/input-suggests/`
module (mirroring `host/suggests/`) wrapping Obsidian's
`AbstractInputSuggest`, plus a `NotesService.listFolders()` extension.
Phase 2 adds shared Vue primitives (`UiInputSuggestInput`, typed
`FolderInput`/`FileInput`, variable-reference modal, three previews,
three composables, one tiny render helper). Phase 3 extends
`JournalEditSubpage.vue` with two new collapsibles, two
move-to-folder recommendation banners, an invertibility warning, and
the i18n keys those need.

**Tech Stack:** TypeScript, Vue 3 (composition API, SFC), Obsidian
(`AbstractInputSuggest`, `TFolder`, `TFile`), vitest,
`@testing-library/vue`, `@testing-library/user-event`, paraglide-js.

**Reference spec:** `docs/superpowers/specs/2026-05-19-v3-journal-settings-ui-note-fields-design.md`.

---

## Phase 1 — Inline-suggest host primitive and `NotesService.listFolders()`

### Task 1: Add `AbstractInputSuggest` to the Obsidian mock

**Files:**

- Modify: `__mocks__/obsidian.ts`

- [ ] **Step 1: Write the failing test**

Add the following to `src/infrastructure/host/input-suggests/internal/input-suggest-service.test.ts` (file does not exist yet — create it). Skip Step 2 here; the real failure comes when we import `AbstractInputSuggest` from `obsidian` in Step 3. Instead: create a tiny scratch test file `__mocks__/obsidian.smoke.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { AbstractInputSuggest } from "obsidian";

describe("obsidian mock", () => {
  it("exports AbstractInputSuggest", () => {
    expect(typeof AbstractInputSuggest).toBe("function");
  });
});
```

- [ ] **Step 2: Run the smoke test to verify failure**

Run: `npm run test -- __mocks__/obsidian.smoke.test.ts`
Expected: FAIL — `AbstractInputSuggest is not exported`.

- [ ] **Step 3: Extend the mock**

In `__mocks__/obsidian.ts`, add immediately above the `openModals` declaration near line 135:

```ts
export class AbstractInputSuggest<T> {
  readonly app: App;
  readonly inputEl: HTMLInputElement;
  #attached = false;

  constructor(app: App, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;
    this.#attached = true;
    attachedInputSuggests.push(this as unknown as AbstractInputSuggest<unknown>);
  }

  getSuggestions(_query: string): T[] | Promise<T[]> {
    return [];
  }

  renderSuggestion(_item: T, _element: HTMLElement): void {}

  selectSuggestion(_item: T, _event: MouseEvent | KeyboardEvent): void {}

  close(): void {
    if (!this.#attached) return;
    this.#attached = false;
    const index = attachedInputSuggests.indexOf(this as unknown as AbstractInputSuggest<unknown>);
    if (index >= 0) attachedInputSuggests.splice(index, 1);
  }

  get isAttached(): boolean {
    return this.#attached;
  }
}

const attachedInputSuggests: AbstractInputSuggest<unknown>[] = [];
```

Then extend the `__testing` export object — add these two getters/methods alongside the others (before the `reset()` member):

```ts
  get attachedInputSuggests(): readonly AbstractInputSuggest<unknown>[] {
    return attachedInputSuggests;
  },
  lastAttachedInputSuggest(): AbstractInputSuggest<unknown> {
    const last = attachedInputSuggests.at(-1);
    if (!last) throw new Error("__testing.lastAttachedInputSuggest() called before any input-suggest attached");
    return last;
  },
```

And inside `reset()`, add:

```ts
for (const s of [...attachedInputSuggests]) s.close();
attachedInputSuggests.length = 0;
```

- [ ] **Step 4: Re-run the smoke test**

Run: `npm run test -- __mocks__/obsidian.smoke.test.ts`
Expected: PASS.

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm __mocks__/obsidian.smoke.test.ts
git add __mocks__/obsidian.ts
git commit -m "test(mocks): add AbstractInputSuggest stub to obsidian mock"
```

---

### Task 2: Create the `input-suggests` module types and factory

**Files:**

- Create: `src/infrastructure/host/input-suggests/types.ts`
- Create: `src/infrastructure/host/input-suggests/define-input-suggest.ts`
- Test: `src/infrastructure/host/input-suggests/define-input-suggest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/infrastructure/host/input-suggests/define-input-suggest.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { defineInputSuggest } from "./define-input-suggest";

describe("defineInputSuggest", () => {
  it("returns the input fields verbatim plus a __result witness", () => {
    const def = defineInputSuggest<string>({
      fetch: () => ["a", "b"],
      render: (item, el) => {
        el.setText(item);
      },
      toValue: (item) => item,
    });
    expect(def.fetch("")).toEqual(["a", "b"]);
    expect(def.toValue("x")).toBe("x");
    expect(typeof def.render).toBe("function");
    expect(typeof def.__result).toBe("function");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/infrastructure/host/input-suggests/define-input-suggest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types and factory**

Create `src/infrastructure/host/input-suggests/types.ts`:

```ts
export interface InputSuggestDefinitionInput<TResult> {
  fetch: (query: string) => TResult[];
  render: (item: TResult, element: HTMLElement) => string | undefined;
  toValue: (item: TResult) => string;
}

export interface InputSuggestDefinition<TResult> {
  readonly fetch: (query: string) => TResult[];
  readonly render: (item: TResult, element: HTMLElement) => string | undefined;
  readonly toValue: (item: TResult) => string;
  readonly __result: (witness: never) => TResult;
}
```

Create `src/infrastructure/host/input-suggests/define-input-suggest.ts`:

```ts
import type { InputSuggestDefinition, InputSuggestDefinitionInput } from "./types";

export function defineInputSuggest<TResult>(
  input: InputSuggestDefinitionInput<TResult>,
): InputSuggestDefinition<TResult> {
  return {
    fetch: input.fetch,
    render: input.render,
    toValue: input.toValue,
    __result: (witness: never): TResult => witness,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/infrastructure/host/input-suggests/define-input-suggest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/host/input-suggests/
git commit -m "feat(host/input-suggests): defineInputSuggest factory and types"
```

---

### Task 3: Implement and test `InputSuggestService`

**Files:**

- Create: `src/infrastructure/host/input-suggests/internal/input-suggest-service.ts`
- Test: `src/infrastructure/host/input-suggests/internal/input-suggest-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/infrastructure/host/input-suggests/internal/input-suggest-service.test.ts`:

```ts
import { __testing as obsidianTesting } from "obsidian";
import { afterEach, describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { createFakeHost, type FakeHost } from "../../internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";
import { defineInputSuggest } from "../define-input-suggest";

import { InputSuggestService } from "./input-suggest-service";

function build(): { service: InputSuggestService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(InputSuggestService).useClass(InputSuggestService);
  return { service: c.resolve(InputSuggestService), host };
}

const stringSuggest = defineInputSuggest<string>({
  fetch: (q) => ["alpha", "beta"].filter((s) => s.includes(q)),
  render: (item, el) => {
    el.setText(item);
  },
  toValue: (item) => item,
});

describe("InputSuggestService", () => {
  afterEach(() => obsidianTesting.reset());

  it("attaches an input suggest to the element", () => {
    const { service } = build();
    const input = document.createElement("input");
    service.attach(input, stringSuggest);
    expect(obsidianTesting.attachedInputSuggests.length).toBe(1);
  });

  it("dispose detaches the suggester", () => {
    const { service } = build();
    const input = document.createElement("input");
    const dispose = service.attach(input, stringSuggest);
    dispose();
    expect(obsidianTesting.attachedInputSuggests.length).toBe(0);
  });

  it("selection writes toValue into the element and dispatches an input event", () => {
    const { service } = build();
    const input = document.createElement("input");
    service.attach(input, stringSuggest);
    let dispatched = "";
    input.addEventListener("input", () => {
      dispatched = input.value;
    });
    const attached = obsidianTesting.lastAttachedInputSuggest() as unknown as {
      selectSuggestion: (item: string, e: MouseEvent) => void;
    };
    attached.selectSuggestion("alpha", new MouseEvent("click"));
    expect(input.value).toBe("alpha");
    expect(dispatched).toBe("alpha");
  });

  it("plugin unload disposes outstanding attachments", () => {
    const { service, host } = build();
    const input = document.createElement("input");
    service.attach(input, stringSuggest);
    host.triggerUnload();
    expect(obsidianTesting.attachedInputSuggests.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm run test -- src/infrastructure/host/input-suggests/internal/input-suggest-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/infrastructure/host/input-suggests/internal/input-suggest-service.ts`:

```ts
import { AbstractInputSuggest } from "obsidian";

import { inject } from "@/infrastructure/di";

import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";

import type { InputSuggestDefinition } from "../types";

export type Disposer = () => void;

export class InputSuggestService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #attached = new Set<AbstractInputSuggest<unknown>>();

  constructor() {
    this.#plugin.register(() => {
      for (const suggest of this.#attached) suggest.close();
      this.#attached.clear();
    });
  }

  attach<TResult>(element: HTMLInputElement, definition: InputSuggestDefinition<TResult>): Disposer {
    const attached = this.#attached;
    const suggester = new (class extends AbstractInputSuggest<TResult> {
      getSuggestions(query: string): TResult[] {
        return definition.fetch(query);
      }
      renderSuggestion(item: TResult, el: HTMLElement): void {
        const rendered = definition.render(item, el);
        if (typeof rendered === "string") el.setText(rendered);
      }
      selectSuggestion(item: TResult): void {
        element.value = definition.toValue(item);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        this.close();
      }
    })(this.#app, element);
    attached.add(suggester as unknown as AbstractInputSuggest<unknown>);
    return () => {
      suggester.close();
      attached.delete(suggester as unknown as AbstractInputSuggest<unknown>);
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/infrastructure/host/input-suggests/internal/input-suggest-service.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/host/input-suggests/internal/
git commit -m "feat(host/input-suggests): InputSuggestService wraps AbstractInputSuggest"
```

---

### Task 4: Add `FakeInputSuggestService` and module barrel

**Files:**

- Create: `src/infrastructure/host/input-suggests/testing.ts`
- Create: `src/infrastructure/host/input-suggests/index.ts`

- [ ] **Step 1: Write the fake**

Create `src/infrastructure/host/input-suggests/testing.ts`:

```ts
import { InvariantError } from "@/infrastructure/result";

import type { InputSuggestDefinition } from "./types";

export interface FakeInputSuggestHandle<TResult> {
  readonly element: HTMLInputElement;
  readonly definition: InputSuggestDefinition<TResult>;
  query(q: string): TResult[];
  select(item: TResult): void;
  readonly isAttached: boolean;
}

export class FakeInputSuggestService {
  readonly #handles: FakeInputSuggestHandle<unknown>[] = [];

  get attachments(): readonly FakeInputSuggestHandle<unknown>[] {
    return this.#handles;
  }

  attach<TResult>(element: HTMLInputElement, definition: InputSuggestDefinition<TResult>): () => void {
    let attached = true;
    const handle: FakeInputSuggestHandle<TResult> = {
      element,
      definition,
      query: (q) => definition.fetch(q),
      select: (item) => {
        if (!attached) return;
        element.value = definition.toValue(item);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      },
      get isAttached() {
        return attached;
      },
    };
    this.#handles.push(handle as unknown as FakeInputSuggestHandle<unknown>);
    return () => {
      attached = false;
    };
  }

  handleFor<TResult = unknown>(element: HTMLInputElement): FakeInputSuggestHandle<TResult> {
    const handle = this.#handles.find((h) => h.element === element);
    if (!handle) {
      throw new InvariantError("FakeInputSuggestService.handleFor() called for an unattached element");
    }
    return handle as unknown as FakeInputSuggestHandle<TResult>;
  }
}
```

- [ ] **Step 2: Write the public barrel**

Create `src/infrastructure/host/input-suggests/index.ts`:

```ts
export { defineInputSuggest } from "./define-input-suggest";
export { InputSuggestService, type Disposer } from "./internal/input-suggest-service";
export type { InputSuggestDefinition, InputSuggestDefinitionInput } from "./types";
```

- [ ] **Step 3: Verify the module compiles**

Run: `npm run check:types`
Expected: PASS.

Per [[feedback_no_mock_fake_tests]], the fake itself is not tested directly — Task 8 exercises it through `UiInputSuggestInput.vue`.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/host/input-suggests/testing.ts src/infrastructure/host/input-suggests/index.ts
git commit -m "feat(host/input-suggests): public barrel and FakeInputSuggestService"
```

---

### Task 5: Wire `InputSuggestService` into the host module and re-export it

**Files:**

- Modify: `src/infrastructure/host/module.ts`
- Modify: `src/infrastructure/host/index.ts`

- [ ] **Step 1: Add DI registration**

Modify `src/infrastructure/host/module.ts` — add the import alongside `SuggestService`:

```ts
import { InputSuggestService } from "./input-suggests/internal/input-suggest-service";
```

Inside `createHostModule.register`, after the line registering `SuggestService`, add:

```ts
c.register(InputSuggestService).useClass(InputSuggestService);
```

- [ ] **Step 2: Re-export from the host barrel**

Modify `src/infrastructure/host/index.ts` — after the existing `suggests` re-exports (the `defineSuggest / SuggestCancelled / SuggestService / SuggestDefinition / SuggestDefinitionInput` block), append:

```ts
export {
  defineInputSuggest,
  InputSuggestService,
  type Disposer,
  type InputSuggestDefinition,
  type InputSuggestDefinitionInput,
} from "./input-suggests";
```

- [ ] **Step 3: Verify the typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/host/module.ts src/infrastructure/host/index.ts
git commit -m "feat(host): register InputSuggestService and re-export the input-suggests barrel"
```

---

### Task 6: Add `NotesService.listFolders()` (real + fake + test)

**Files:**

- Modify: `src/infrastructure/host/internal/notes-service.ts`
- Modify: `src/infrastructure/host/internal/notes-service.test.ts`
- Modify: `src/infrastructure/host/testing.ts` (the `FakeNotesService`)

- [ ] **Step 1: Write the failing tests**

In `src/infrastructure/host/internal/notes-service.test.ts`, immediately after the `describe("allMarkdownNotes", ...)` block (around line 82), insert:

```ts
describe("listFolders", () => {
  it("returns every loaded folder path including the root as empty string", () => {
    const { service, host } = build();
    host.putFolder("Daily");
    host.putFolder("Daily/Archives");
    host.putFolder("Other");
    expect(service.listFolders().toSorted()).toEqual(["", "Daily", "Daily/Archives", "Other"]);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm run test -- src/infrastructure/host/internal/notes-service.test.ts`
Expected: FAIL — `service.listFolders is not a function`.

- [ ] **Step 3: Implement `listFolders` on the real service**

In `src/infrastructure/host/internal/notes-service.ts`, find the existing `import` for obsidian (top of file) and ensure `TFolder` is in the imports. The current file imports `TFile` — extend to `import { TFile, TFolder } from "obsidian";` (preserve any other named imports).

Immediately after the `allMarkdownNotes()` method (around line 82), add:

```ts
  listFolders(): VaultPath[] {
    return this.#app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .map((folder) => folder.path as VaultPath);
  }
```

If `#app.vault.getAllLoadedFiles` is not yet defined on the `vaultApi` object in the fake host (`src/infrastructure/host/internal/testing.ts`), extend `vaultApi` to add it. Insert after the `getMarkdownFiles` method (around line 137):

```ts
    getAllLoadedFiles(): (TFile | TFolder)[] {
      return [...folderObjects.values(), ...fileObjects.values()];
    },
```

- [ ] **Step 4: Re-run the test**

Run: `npm run test -- src/infrastructure/host/internal/notes-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `FakeNotesService` for downstream consumers**

In `src/infrastructure/host/testing.ts`, add `listFolders` to the
`Pick<NotesService, ...>` union (line ~43) and implement the method.
Change the `Pick` line to:

```ts
export class FakeNotesService implements Pick<
  NotesService,
  | "find"
  | "listInFolder"
  | "listFolders"
  | "allMarkdownNotes"
  | "create"
  | "read"
  | "write"
  | "append"
  | "rename"
  | "delete"
  | "updateFrontmatter"
  | "events"
> {
```

And immediately after the existing `allMarkdownNotes()` method (around line 89), add:

```ts
  listFolders(): VaultPath[] {
    return [...this.#folders];
  }
```

- [ ] **Step 6: Verify everything still passes**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/host/internal/notes-service.ts \
        src/infrastructure/host/internal/notes-service.test.ts \
        src/infrastructure/host/internal/testing.ts \
        src/infrastructure/host/testing.ts
git commit -m "feat(host/notes): listFolders() on real and fake NotesService"
```

---

## Phase 2 — Shared UI primitives and composables

### Task 7: `UiInputSuggestInput.vue` — generic wrapper

**Files:**

- Create: `src/ui/UiInputSuggestInput.vue`
- Test: `src/ui/UiInputSuggestInput.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ui/UiInputSuggestInput.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { defineInputSuggest, InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import UiInputSuggestInput from "./UiInputSuggestInput.vue";

afterEach(() => cleanup());

function build() {
  const fake = new FakeInputSuggestService();
  const container = new Container();
  container.register(InputSuggestService).useValue(fake as unknown as InputSuggestService);
  return { fake, container };
}

const fruitSuggest = defineInputSuggest<string>({
  fetch: (q) => ["apple", "apricot", "banana"].filter((f) => f.includes(q)),
  render: (item, el) => {
    el.setText(item);
  },
  toValue: (item) => item,
});

describe("UiInputSuggestInput", () => {
  it("attaches the suggester on mount", () => {
    const { fake, container } = build();
    const model = ref("");
    render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
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
    expect(fake.attachments).toHaveLength(1);
  });

  it("writes the selected value back through v-model", async () => {
    const { fake, container } = build();
    const model = ref("");
    const { getByRole } = render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
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
    const input = getByRole("textbox") as HTMLInputElement;
    fake.handleFor<string>(input).select("apricot");
    // The input event dispatched by the fake propagates through Vue's v-model
    expect(input.value).toBe("apricot");
  });

  it("dispatches the dispose function on unmount", () => {
    const { fake, container } = build();
    const model = ref("");
    const { unmount } = render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
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
    const handle = fake.attachments[0];
    expect(handle?.isAttached).toBe(true);
    unmount();
    expect(handle?.isAttached).toBe(false);
  });

  it("propagates user typing through v-model", async () => {
    const { container } = build();
    const model = ref("");
    const { getByRole } = render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
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
    await userEvent.type(getByRole("textbox"), "ap");
    expect(model.value).toBe("ap");
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm run test -- src/ui/UiInputSuggestInput.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `src/ui/UiInputSuggestInput.vue`:

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { useService } from "@/infrastructure/di";
import { InputSuggestService, type Disposer, type InputSuggestDefinition } from "@/infrastructure/host";

const props = defineProps<{
  modelValue: string;
  definition: InputSuggestDefinition<unknown>;
  placeholder?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const suggests = useService(InputSuggestService);
const element = ref<HTMLInputElement | null>(null);
let dispose: Disposer | undefined;

onMounted(() => {
  if (element.value) {
    dispose = suggests.attach(element.value, props.definition);
  }
});

onBeforeUnmount(() => {
  dispose?.();
});

function onInput(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    ref="element"
    type="text"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    spellcheck="false"
    @input="onInput"
  />
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/ui/UiInputSuggestInput.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add src/ui/UiInputSuggestInput.vue src/ui/UiInputSuggestInput.test.ts
git commit -m "feat(ui): UiInputSuggestInput generic v-model wrapper"
```

---

### Task 8: `FolderInput.vue` and `FileInput.vue`

**Files:**

- Create: `src/journals/settings/ui/FolderInput.vue`
- Create: `src/journals/settings/ui/FileInput.vue`
- Test: `src/journals/settings/ui/FolderInput.test.ts`
- Test: `src/journals/settings/ui/FileInput.test.ts`

- [ ] **Step 1: Write the failing FolderInput test**

Create `src/journals/settings/ui/FolderInput.test.ts`:

```ts
import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, NotesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";

import FolderInput from "./FolderInput.vue";

afterEach(() => cleanup());

function build() {
  const notes = new FakeNotesService();
  notes.seed("Daily/today.md" as never);
  notes.seed("Other/note.md" as never);
  const inputSuggest = new FakeInputSuggestService();
  const container = new Container();
  container.register(NotesService).useValue(notes as unknown as NotesService);
  container.register(InputSuggestService).useValue(inputSuggest as unknown as InputSuggestService);
  return { notes, inputSuggest, container };
}

describe("FolderInput", () => {
  it("offers folder candidates from NotesService.listFolders, filtered by query", () => {
    const { inputSuggest, container } = build();
    render(FolderInput, {
      props: { modelValue: "", "onUpdate:modelValue": () => {} },
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
    const handle = inputSuggest.attachments[0]!;
    expect(handle.query("").toSorted()).toEqual(["", "Daily", "Other"]);
    expect(handle.query("ai")).toEqual(["Daily"]);
  });
});
```

- [ ] **Step 2: Write the failing FileInput test**

Create `src/journals/settings/ui/FileInput.test.ts`:

```ts
import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, NotesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";

import FileInput from "./FileInput.vue";

afterEach(() => cleanup());

function build() {
  const notes = new FakeNotesService();
  notes.seed("templates/daily.md" as never);
  notes.seed("templates/weekly.md" as never);
  const inputSuggest = new FakeInputSuggestService();
  const container = new Container();
  container.register(NotesService).useValue(notes as unknown as NotesService);
  container.register(InputSuggestService).useValue(inputSuggest as unknown as InputSuggestService);
  return { inputSuggest, container };
}

describe("FileInput", () => {
  it("offers markdown notes from NotesService.allMarkdownNotes, filtered by query", () => {
    const { inputSuggest, container } = build();
    render(FileInput, {
      props: { modelValue: "", "onUpdate:modelValue": () => {} },
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
    const handle = inputSuggest.attachments[0]!;
    expect(handle.query("").toSorted()).toEqual(["templates/daily.md", "templates/weekly.md"]);
    expect(handle.query("weekly")).toEqual(["templates/weekly.md"]);
  });
});
```

- [ ] **Step 3: Run both tests to verify failure**

Run: `npm run test -- src/journals/settings/ui/FolderInput.test.ts src/journals/settings/ui/FileInput.test.ts`
Expected: FAIL — components not found.

- [ ] **Step 4: Implement FolderInput**

Create `src/journals/settings/ui/FolderInput.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";
import { defineInputSuggest, NotesService } from "@/infrastructure/host";
import UiInputSuggestInput from "@/ui/UiInputSuggestInput.vue";

defineProps<{ modelValue: string; placeholder?: string; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: string] }>();

const notes = useService(NotesService);

const definition = computed(() =>
  defineInputSuggest<string>({
    fetch: (query) => {
      const q = query.toLowerCase();
      return notes
        .listFolders()
        .filter((folder) => folder.toLowerCase().includes(q))
        .toSorted();
    },
    render: (folder, el) => {
      el.setText(folder || "/");
    },
    toValue: (folder) => folder,
  }),
);
</script>

<template>
  <UiInputSuggestInput
    :model-value="modelValue"
    :definition="definition"
    :placeholder="placeholder"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
```

- [ ] **Step 5: Implement FileInput**

Create `src/journals/settings/ui/FileInput.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";
import { defineInputSuggest, NotesService } from "@/infrastructure/host";
import UiInputSuggestInput from "@/ui/UiInputSuggestInput.vue";

defineProps<{ modelValue: string; placeholder?: string; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: string] }>();

const notes = useService(NotesService);

const definition = computed(() =>
  defineInputSuggest<string>({
    fetch: (query) => {
      const q = query.toLowerCase();
      return notes
        .allMarkdownNotes()
        .filter((path) => path.toLowerCase().includes(q))
        .toSorted();
    },
    render: (path, el) => {
      el.setText(path);
    },
    toValue: (path) => path,
  }),
);
</script>

<template>
  <UiInputSuggestInput
    :model-value="modelValue"
    :definition="definition"
    :placeholder="placeholder"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
```

- [ ] **Step 6: Re-run tests to verify they pass**

Run: `npm run test -- src/journals/settings/ui/FolderInput.test.ts src/journals/settings/ui/FileInput.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/journals/settings/ui/FolderInput.vue \
        src/journals/settings/ui/FolderInput.test.ts \
        src/journals/settings/ui/FileInput.vue \
        src/journals/settings/ui/FileInput.test.ts
git commit -m "feat(journals/settings/ui): FolderInput and FileInput typed autocomplete inputs"
```

---

### Task 9: `render-for-preview.ts` helper

**Files:**

- Create: `src/journals/settings/ui/render-for-preview.ts`
- Test: `src/journals/settings/ui/render-for-preview.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/render-for-preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { installTestEngine } from "@/templates/testing";
import { TemplateContext } from "@/templates";

import { renderForPreview } from "./render-for-preview";

describe("renderForPreview", () => {
  const engine = installTestEngine();
  const context = TemplateContext.empty()
    .string("journal_name", "daily")
    .date("date", CalendarDate.fromAnchor("2026-05-19"), "YYYY-MM-DD");

  it("renders the template with the given context", () => {
    expect(renderForPreview(engine, "{{journal_name}}-{{date}}", context)).toBe("daily-2026-05-19");
  });

  it("returns an empty string when the template cannot render", () => {
    expect(renderForPreview(engine, "{{unknown_var}}", context)).toBe("");
  });

  it("returns an empty string for an empty template", () => {
    expect(renderForPreview(engine, "", context)).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- src/journals/settings/ui/render-for-preview.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/journals/settings/ui/render-for-preview.ts`:

```ts
import type { TemplateContext, TemplateEngine } from "@/templates";

export function renderForPreview(engine: TemplateEngine, template: string, context: TemplateContext): string {
  if (!template) return "";
  try {
    return engine.renderString(template, context);
  } catch {
    return "";
  }
}
```

If `renderString` already returns a Result (check the engine signature in `src/templates/engine.ts` — it currently returns `string`), the `try`/`catch` is the right shape because tokens may throw for unknown variables during rendering. If `renderString` returns `Result<string, TemplateRenderError>` instead, replace the body with:

```ts
const result = engine.renderString(template, context);
return result.isOk() ? result.value : "";
```

- [ ] **Step 4: Re-run and confirm pass**

Run: `npm run test -- src/journals/settings/ui/render-for-preview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/render-for-preview.ts src/journals/settings/ui/render-for-preview.test.ts
git commit -m "feat(journals/settings/ui): renderForPreview helper"
```

---

### Task 10: `use-today-metadata.ts` composable

**Files:**

- Create: `src/journals/settings/ui/use-today-metadata.ts`
- Test: `src/journals/settings/ui/use-today-metadata.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/use-today-metadata.test.ts`:

```ts
import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, type ComputedRef } from "vue";

import { date, installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { CycleService, FrontmatterService, JournalsIndex, NumberingService } from "@/journals";
import { fakeSettings, fixedJournal } from "@/journals/testing";
import { SettingsService } from "@/settings";

import { useTodayMetadata } from "./use-today-metadata";

import type { JournalMetadata } from "@/journals";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
  date.set("2026-05-19");
});
afterEach(() => {
  teardown();
  cleanup();
});

function buildContainer(): Container {
  const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  return c;
}

function probe(journalName: string): ComputedRef<JournalMetadata | undefined> {
  const container = buildContainer();
  let captured: ComputedRef<JournalMetadata | undefined> | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useTodayMetadata(journalName);
      return () => h("div");
    },
  });
  render(Probe, {
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
  return captured!;
}

describe("useTodayMetadata", () => {
  it("returns today's metadata for an existing journal", () => {
    expect(probe("daily").value).toMatchObject({ journalName: "daily", anchor: "2026-05-19" });
  });

  it("returns undefined for a missing journal", () => {
    expect(probe("nope").value).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/use-today-metadata.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the composable**

Create `src/journals/settings/ui/use-today-metadata.ts`:

```ts
import { computed, type ComputedRef } from "vue";

import { CalendarDate } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { FrontmatterService } from "@/journals";

import type { JournalMetadata } from "@/journals";

export function useTodayMetadata(journalName: string): ComputedRef<JournalMetadata | undefined> {
  const frontmatter = useService(FrontmatterService);
  return computed(() => {
    const anchor = CalendarDate.today().toAnchor();
    const result = frontmatter.buildMetadata(journalName, anchor);
    return result.isOk() ? result.value : undefined;
  });
}
```

- [ ] **Step 4: Re-run and confirm pass**

Run: `npm run test -- src/journals/settings/ui/use-today-metadata.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/use-today-metadata.ts src/journals/settings/ui/use-today-metadata.test.ts
git commit -m "feat(journals/settings/ui): useTodayMetadata composable"
```

---

### Task 11: `use-invertibility-check.ts` composable

**Files:**

- Create: `src/journals/settings/ui/use-invertibility-check.ts`
- Test: `src/journals/settings/ui/use-invertibility-check.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/use-invertibility-check.test.ts`:

```ts
import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, ref, type Ref } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { installTestEngine } from "@/templates/testing";
import { TemplateEngine } from "@/templates";

import { useInvertibilityCheck } from "./use-invertibility-check";

afterEach(() => cleanup());

function buildContainer() {
  const engine = installTestEngine();
  const container = new Container();
  container.register(TemplateEngine).useValue(engine);
  return container;
}

function probe(template: Ref<string>): { warning: Ref<unknown> } {
  const container = buildContainer();
  let captured: Ref<unknown> | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useInvertibilityCheck(template);
      return () => h("div");
    },
  });
  render(Probe, {
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
  return { warning: captured! };
}

describe("useInvertibilityCheck", () => {
  it("returns null for an invertible template with only known variables", () => {
    const { warning } = probe(ref("{{date}}-{{journal_name}}"));
    expect(warning.value).toBeNull();
  });

  it("returns null for a static template", () => {
    const { warning } = probe(ref("static-note"));
    expect(warning.value).toBeNull();
  });

  it("flags a template containing a function token", () => {
    const { warning } = probe(ref("{{date}}-{{time}}"));
    expect(warning.value).toMatchObject({ reason: "function-token" });
  });

  it("flags a template containing an unknown variable", () => {
    const { warning } = probe(ref("{{date}}-{{mystery}}"));
    expect(warning.value).toMatchObject({ reason: "unknown-variable", offending: "mystery" });
  });
});
```

(`time` may be a valid wildcard in v3's engine — if Step 3 reveals it is, swap the function-token test to use a real function token such as `{{format:YYYY}}` or whatever the engine handlers list registers. Check `src/templates/handlers.ts` to confirm a function-token name to use.)

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/use-invertibility-check.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the composable**

Create `src/journals/settings/ui/use-invertibility-check.ts`:

```ts
import { computed, type ComputedRef, type Ref } from "vue";

import { CalendarDate } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { TemplateContext, TemplateEngine, tokenize } from "@/templates";

export interface InvertibilityWarning {
  reason: "function-token" | "unknown-variable";
  offending: string;
}

export function useInvertibilityCheck(template: Ref<string>): ComputedRef<InvertibilityWarning | null> {
  const engine = useService(TemplateEngine);
  return computed(() => {
    const value = template.value;
    if (!value) return null;
    const today = CalendarDate.today();
    const context = TemplateContext.empty()
      .string("journal_name", "preview")
      .date("date", today, "YYYY-MM-DD")
      .date("start_date", today, "YYYY-MM-DD")
      .date("end_date", today, "YYYY-MM-DD");
    const stream = tokenize(value);
    const parsed = engine.parse(stream, "preview", context);
    if (parsed.isOk()) return null;
    const detail = parsed.error.detail;
    if (detail.kind === "not-invertible") {
      return { reason: detail.reason, offending: detail.offending };
    }
    return null;
  });
}
```

`start_date` and `end_date` are in the preview context because the spec's variable table marks them available for any cycle-bearing journal — including them in the check prevents false positives when those variables appear in the template.

- [ ] **Step 4: Re-run and confirm pass**

Run: `npm run test -- src/journals/settings/ui/use-invertibility-check.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/use-invertibility-check.ts src/journals/settings/ui/use-invertibility-check.test.ts
git commit -m "feat(journals/settings/ui): useInvertibilityCheck composable"
```

---

### Task 12: `use-folder-extractor.ts` composable

**Files:**

- Create: `src/journals/settings/ui/use-folder-extractor.ts`
- Test: `src/journals/settings/ui/use-folder-extractor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/use-folder-extractor.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { extractFromNameTemplate, extractFromDateFormat } from "./use-folder-extractor";

import type { JournalConfig } from "@/journals";

function baseConfig(overrides: Partial<JournalConfig>): JournalConfig {
  return {
    name: "daily",
    write: { type: "day" },
    timeline: { start: "2026-01-01" as never, end: { kind: "never" } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "2026-01-01" as never, allowBefore: false, sources: [] },
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
    ...overrides,
  };
}

describe("extractFromNameTemplate", () => {
  it("moves the path prefix into folder and leaves the last segment as nameTemplate", () => {
    const config = baseConfig({ nameTemplate: "year/month/{{date}}", folder: "" });
    extractFromNameTemplate(config);
    expect(config.folder).toBe("year/month");
    expect(config.nameTemplate).toBe("{{date}}");
  });

  it("appends to an existing folder", () => {
    const config = baseConfig({ nameTemplate: "extra/{{date}}", folder: "Daily" });
    extractFromNameTemplate(config);
    expect(config.folder).toBe("Daily/extra");
    expect(config.nameTemplate).toBe("{{date}}");
  });

  it("is a no-op when nameTemplate has no slash", () => {
    const config = baseConfig({ nameTemplate: "{{date}}", folder: "Daily" });
    extractFromNameTemplate(config);
    expect(config.folder).toBe("Daily");
    expect(config.nameTemplate).toBe("{{date}}");
  });
});

describe("extractFromDateFormat", () => {
  it("converts path segments into {{date:format}} tokens prefixed onto folder", () => {
    const config = baseConfig({ dateFormat: "YYYY/MM/DD", folder: "" });
    extractFromDateFormat(config);
    expect(config.folder).toBe("{{date:YYYY}}/{{date:MM}}");
    expect(config.dateFormat).toBe("DD");
  });

  it("appends to an existing folder", () => {
    const config = baseConfig({ dateFormat: "YYYY/MM", folder: "Daily" });
    extractFromDateFormat(config);
    expect(config.folder).toBe("Daily/{{date:YYYY}}");
    expect(config.dateFormat).toBe("MM");
  });

  it("is a no-op when dateFormat has no slash", () => {
    const config = baseConfig({ dateFormat: "YYYY-MM-DD", folder: "" });
    extractFromDateFormat(config);
    expect(config.folder).toBe("");
    expect(config.dateFormat).toBe("YYYY-MM-DD");
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/use-folder-extractor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/journals/settings/ui/use-folder-extractor.ts`:

```ts
import type { JournalConfig } from "@/journals";

function prependFolder(existing: string, prefix: string): string {
  if (!prefix) return existing;
  if (!existing) return prefix;
  return `${existing}/${prefix}`;
}

export function extractFromNameTemplate(config: JournalConfig): void {
  if (!config.nameTemplate.includes("/")) return;
  const parts = config.nameTemplate.split("/");
  const last = parts.pop() ?? "";
  const prefix = parts.join("/");
  config.folder = prependFolder(config.folder, prefix);
  config.nameTemplate = last;
}

export function extractFromDateFormat(config: JournalConfig): void {
  if (!config.dateFormat.includes("/")) return;
  const parts = config.dateFormat.split("/");
  const last = parts.pop() ?? "";
  const prefix = parts.map((format) => `{{date:${format}}}`).join("/");
  config.folder = prependFolder(config.folder, prefix);
  config.dateFormat = last;
}
```

- [ ] **Step 4: Re-run and confirm pass**

Run: `npm run test -- src/journals/settings/ui/use-folder-extractor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/use-folder-extractor.ts src/journals/settings/ui/use-folder-extractor.test.ts
git commit -m "feat(journals/settings/ui): useFolderExtractor — name-template and date-format transforms"
```

---

### Task 13: Variable-reference modal and hint

**Files:**

- Create: `src/journals/settings/ui/VariableReferenceModal.vue`
- Create: `src/journals/settings/ui/variable-reference-modal.ts`
- Create: `src/journals/settings/ui/VariableReferenceHint.vue`
- Test: `src/journals/settings/ui/VariableReferenceHint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/VariableReferenceHint.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";

import VariableReferenceHint from "./VariableReferenceHint.vue";
import { variableReferenceModal } from "./variable-reference-modal";

afterEach(() => cleanup());

function build() {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  return { modals, container };
}

describe("VariableReferenceHint", () => {
  it("opens the variable reference modal when clicked", async () => {
    const { modals, container } = build();
    render(VariableReferenceHint, {
      props: { journalName: "daily", dateFormat: "YYYY-MM-DD", hasNumbering: false },
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
    await userEvent.click(screen.getByRole("link"));
    expect(modals.opens.length).toBe(1);
    const lastOpen = modals.lastOpen();
    expect(lastOpen.definition).toBe(variableReferenceModal);
    expect(lastOpen.props).toEqual({ journalName: "daily", dateFormat: "YYYY-MM-DD", hasNumbering: false });
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/VariableReferenceHint.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the modal content**

Create `src/journals/settings/ui/VariableReferenceModal.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";

defineProps<{ journalName: string; dateFormat: string; hasNumbering: boolean }>();
</script>

<template>
  <div class="variable-reference">
    <p>{{ m.journal_edit_variable_reference_intro({ dateFormat }) }}</p>
    <ul>
      <li><code>{{ "{{date}}" }}</code> — {{ m.journal_edit_variable_date_description() }}</li>
      <li><code>{{ "{{date:format}}" }}</code> — {{ m.journal_edit_variable_date_format_description() }}</li>
      <li><code>{{ "{{journal_name}}" }}</code> — {{ m.journal_edit_variable_journal_name_description({ name: journalName }) }}</li>
      <li><code>{{ "{{start_date}}" }}</code> — {{ m.journal_edit_variable_start_date_description() }}</li>
      <li><code>{{ "{{end_date}}" }}</code> — {{ m.journal_edit_variable_end_date_description() }}</li>
      <li v-if="hasNumbering"><code>{{ "{{<index-variable>}}" }}</code> — {{ m.journal_edit_variable_numbering_description() }}</li>
    </ul>
  </div>
</template>
```

- [ ] **Step 4: Implement the modal definition**

Create `src/journals/settings/ui/variable-reference-modal.ts`:

```ts
import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import VariableReferenceModal from "./VariableReferenceModal.vue";

import type { Component } from "vue";

export const variableReferenceModal: ModalDefinition<
  { journalName: string; dateFormat: string; hasNumbering: boolean },
  void
> = defineModal({
  component: VariableReferenceModal as Component,
  title: () => m.journal_edit_variable_reference_modal_title(),
});
```

- [ ] **Step 5: Implement the hint**

Create `src/journals/settings/ui/VariableReferenceHint.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";

import { variableReferenceModal } from "./variable-reference-modal";

const props = defineProps<{ journalName: string; dateFormat: string; hasNumbering: boolean }>();

const modals = useService(ModalService);

function show(event: Event): void {
  event.preventDefault();
  void modals.open(variableReferenceModal, {
    journalName: props.journalName,
    dateFormat: props.dateFormat,
    hasNumbering: props.hasNumbering,
  });
}
</script>

<template>
  <a href="#" @click="show">{{ m.journal_edit_variable_reference_link() }}</a>
</template>
```

- [ ] **Step 6: Re-run and confirm pass**

Run: `npm run test -- src/journals/settings/ui/VariableReferenceHint.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/journals/settings/ui/VariableReferenceHint.vue \
        src/journals/settings/ui/VariableReferenceHint.test.ts \
        src/journals/settings/ui/VariableReferenceModal.vue \
        src/journals/settings/ui/variable-reference-modal.ts
git commit -m "feat(journals/settings/ui): VariableReferenceHint + modal"
```

---

### Task 14: `NoteNamePreview.vue`

**Files:**

- Create: `src/journals/settings/ui/NoteNamePreview.vue`
- Test: `src/journals/settings/ui/NoteNamePreview.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/NoteNamePreview.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { date, installTestCalendar } from "@/calendar/testing";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import NoteNamePreview from "./NoteNamePreview.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
  date.set("2026-05-19");
});
afterEach(() => {
  teardown();
  cleanup();
});

async function setupDaily(nameTemplate = "{{date}}") {
  const { service, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: {
      version: 3,
      journals: {
        daily: {
          name: "daily",
          write: { type: "day" },
          timeline: { start: "2026-01-01", end: { kind: "never" } },
          dateFormat: "YYYY-MM-DD",
          frontmatter: {
            dateField: "journal-date",
            startDateField: "journal-start-date",
            endDateField: "journal-end-date",
            addStartDate: false,
            addEndDate: false,
          },
          numbering: { enabled: false, anchorDate: "2026-01-01", allowBefore: false, sources: [] },
          nameTemplate,
          folder: "",
          templates: [],
          confirmCreation: false,
          autoCreate: false,
        },
      },
    },
  });
  await service.initialize();
  return container;
}

describe("NoteNamePreview", () => {
  it("renders today's resolved note basename", async () => {
    const container = await setupDaily();
    render(NoteNamePreview, {
      props: { journalName: "daily" },
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
    expect(screen.getByText("2026-05-19")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/NoteNamePreview.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/journals/settings/ui/NoteNamePreview.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NotePathService } from "@/journals";

import { useTodayMetadata } from "./use-today-metadata";

const { journalName } = defineProps<{ journalName: string }>();

const path = useService(NotePathService);
const metadata = useTodayMetadata(journalName);

const basename = computed(() => {
  const md = metadata.value;
  if (!md) return "";
  const result = path.pathFor(journalName, md);
  if (!result.isOk()) return "";
  const filename = result.value.split("/").pop() ?? result.value;
  return filename.replace(/\.md$/, "");
});
</script>

<template>
  <div v-if="basename">
    {{ m.journal_edit_note_name_preview_label() }}
    <b class="u-pop">{{ basename }}</b>
  </div>
</template>
```

- [ ] **Step 4: Re-run and confirm pass**

Run: `npm run test -- src/journals/settings/ui/NoteNamePreview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/NoteNamePreview.vue src/journals/settings/ui/NoteNamePreview.test.ts
git commit -m "feat(journals/settings/ui): NoteNamePreview"
```

---

### Task 15: `FolderPathPreview.vue`

**Files:**

- Create: `src/journals/settings/ui/FolderPathPreview.vue`
- Test: `src/journals/settings/ui/FolderPathPreview.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/FolderPathPreview.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { date, installTestCalendar } from "@/calendar/testing";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import FolderPathPreview from "./FolderPathPreview.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
  date.set("2026-05-19");
});
afterEach(() => {
  teardown();
  cleanup();
});

async function setupDaily(folder: string) {
  const { service, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: {
      version: 3,
      journals: {
        daily: {
          name: "daily",
          write: { type: "day" },
          timeline: { start: "2026-01-01", end: { kind: "never" } },
          dateFormat: "YYYY-MM-DD",
          frontmatter: {
            dateField: "journal-date",
            startDateField: "journal-start-date",
            endDateField: "journal-end-date",
            addStartDate: false,
            addEndDate: false,
          },
          numbering: { enabled: false, anchorDate: "2026-01-01", allowBefore: false, sources: [] },
          nameTemplate: "{{date}}",
          folder,
          templates: [],
          confirmCreation: false,
          autoCreate: false,
        },
      },
    },
  });
  await service.initialize();
  return container;
}

describe("FolderPathPreview", () => {
  it("renders the resolved folder when it contains a variable", async () => {
    const container = await setupDaily("{{date:YYYY}}/journal");
    render(FolderPathPreview, {
      props: { journalName: "daily", folder: "{{date:YYYY}}/journal" },
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
    expect(screen.getByText("2026/journal")).toBeTruthy();
  });

  it("does not render when folder has no variables", async () => {
    const container = await setupDaily("static/folder");
    const { container: dom } = render(FolderPathPreview, {
      props: { journalName: "daily", folder: "static/folder" },
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
    expect(dom.textContent ?? "").toBe("");
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/FolderPathPreview.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/journals/settings/ui/FolderPathPreview.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NotePathService } from "@/journals";
import { TemplateEngine } from "@/templates";

import { renderForPreview } from "./render-for-preview";
import { useTodayMetadata } from "./use-today-metadata";

const props = defineProps<{ journalName: string; folder: string }>();

const path = useService(NotePathService);
const engine = useService(TemplateEngine);
const metadata = useTodayMetadata(props.journalName);

const resolved = computed(() => {
  if (!props.folder.includes("{")) return "";
  const md = metadata.value;
  if (!md) return "";
  const config = path.configFor(props.journalName);
  if (!config) return "";
  const context = path.contextFor(config, md);
  return renderForPreview(engine, props.folder, context);
});
</script>

<template>
  <div v-if="resolved">
    {{ m.journal_edit_folder_path_preview_label() }}
    <b class="u-pop">{{ resolved }}</b>
  </div>
</template>
```

- [ ] **Step 4: Re-run and confirm pass**

Run: `npm run test -- src/journals/settings/ui/FolderPathPreview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/FolderPathPreview.vue src/journals/settings/ui/FolderPathPreview.test.ts
git commit -m "feat(journals/settings/ui): FolderPathPreview"
```

---

### Task 16: `TemplatePathPreview.vue`

**Files:**

- Create: `src/journals/settings/ui/TemplatePathPreview.vue`
- Test: `src/journals/settings/ui/TemplatePathPreview.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/TemplatePathPreview.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { date, installTestCalendar } from "@/calendar/testing";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import TemplatePathPreview from "./TemplatePathPreview.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
  date.set("2026-05-19");
});
afterEach(() => {
  teardown();
  cleanup();
});

async function setupDaily() {
  const { service, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: {
      version: 3,
      journals: {
        daily: {
          name: "daily",
          write: { type: "day" },
          timeline: { start: "2026-01-01", end: { kind: "never" } },
          dateFormat: "YYYY-MM-DD",
          frontmatter: {
            dateField: "journal-date",
            startDateField: "journal-start-date",
            endDateField: "journal-end-date",
            addStartDate: false,
            addEndDate: false,
          },
          numbering: { enabled: false, anchorDate: "2026-01-01", allowBefore: false, sources: [] },
          nameTemplate: "{{date}}",
          folder: "",
          templates: ["templates/{{date:YYYY}}-daily.md"],
          confirmCreation: false,
          autoCreate: false,
        },
      },
    },
  });
  await service.initialize();
  return container;
}

describe("TemplatePathPreview", () => {
  it("renders the resolved template path when it contains a variable", async () => {
    const container = await setupDaily();
    render(TemplatePathPreview, {
      props: { journalName: "daily", path: "templates/{{date:YYYY}}-daily.md" },
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
    expect(screen.getByText("templates/2026-daily.md")).toBeTruthy();
  });

  it("does not render when path has no variables", async () => {
    const container = await setupDaily();
    const { container: dom } = render(TemplatePathPreview, {
      props: { journalName: "daily", path: "templates/daily.md" },
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
    expect(dom.textContent ?? "").toBe("");
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/TemplatePathPreview.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/journals/settings/ui/TemplatePathPreview.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NotePathService } from "@/journals";
import { TemplateEngine } from "@/templates";

import { renderForPreview } from "./render-for-preview";
import { useTodayMetadata } from "./use-today-metadata";

const props = defineProps<{ journalName: string; path: string }>();

const pathSvc = useService(NotePathService);
const engine = useService(TemplateEngine);
const metadata = useTodayMetadata(props.journalName);

const resolved = computed(() => {
  if (!props.path.includes("{")) return "";
  const md = metadata.value;
  if (!md) return "";
  const config = pathSvc.configFor(props.journalName);
  if (!config) return "";
  const context = pathSvc.contextFor(config, md);
  return renderForPreview(engine, props.path, context);
});
</script>

<template>
  <div v-if="resolved" class="template-path-preview">
    {{ m.journal_edit_template_path_preview_label() }}
    <b class="u-pop">{{ resolved }}</b>
  </div>
</template>

<style scoped>
.template-path-preview {
  padding: var(--size-2-2);
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}
</style>
```

- [ ] **Step 4: Re-run and confirm pass**

Run: `npm run test -- src/journals/settings/ui/TemplatePathPreview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/TemplatePathPreview.vue src/journals/settings/ui/TemplatePathPreview.test.ts
git commit -m "feat(journals/settings/ui): TemplatePathPreview"
```

---

## Phase 3 — `JournalEditSubpage` extension

### Task 17: Add the new i18n message keys

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add keys**

Open `messages/en.json` and add the following keys (preserving alphabetical order within the `journal_edit_*` block):

```json
"journal_edit_section_note_creation": "Note creation",
"journal_edit_section_templates": "Templates",
"journal_edit_name_template_label": "Note name template",
"journal_edit_name_template_description": "Template used to generate new note names.",
"journal_edit_name_template_invertibility_warning": "Template cannot be reverse-parsed ({reason}: \"{offending}\"). Auto-attach will silently skip externally created notes that match this pattern.",
"journal_edit_folder_label": "Folder",
"journal_edit_folder_description": "New notes will be created in this folder.",
"journal_edit_confirm_creation_label": "Confirm creating new note?",
"journal_edit_confirm_creation_description": "Show a confirmation dialog when navigating to a date that does not yet have a note.",
"journal_edit_auto_create_label": "Auto-create today's note",
"journal_edit_auto_create_description": "Automatically create today's note on plugin load and at every local midnight.",
"journal_edit_auto_create_confirmation_skip_note": "Confirmation dialog won't be shown for auto-created notes.",
"journal_edit_templates_description": "Path to a note that will be used as a template when creating new notes. When multiple are configured, the first existing wins.",
"journal_edit_template_path_placeholder": "templates/daily.md",
"journal_edit_template_add_button": "Add template",
"journal_edit_template_remove_tooltip": "Remove template",
"journal_edit_template_count": "{count}",
"journal_edit_note_name_preview_label": "Resolved note name:",
"journal_edit_folder_path_preview_label": "Resolved folder:",
"journal_edit_template_path_preview_label": "Resolved template path:",
"journal_edit_move_to_folder_recommendation_name_template": "Note name template contains a path separator. Move the path prefix into the Folder field?",
"journal_edit_move_to_folder_recommendation_date_format": "Date format contains a path separator. Move the date variables into the Folder field?",
"journal_edit_move_to_folder_apply_link": "Apply recommendation",
"journal_edit_variable_reference_link": "Supported variables.",
"journal_edit_variable_reference_modal_title": "Variable reference",
"journal_edit_variable_reference_intro": "Available variables. Date format defaults to {dateFormat} when no explicit format is given.",
"journal_edit_variable_date_description": "Today's date.",
"journal_edit_variable_date_format_description": "Today's date, formatted with the supplied moment.js format string.",
"journal_edit_variable_journal_name_description": "The journal name (here: {name}).",
"journal_edit_variable_start_date_description": "Start of the current period.",
"journal_edit_variable_end_date_description": "End of the current period.",
"journal_edit_variable_numbering_description": "The configured numbering variable (see the Sequence section).",
```

- [ ] **Step 2: Compile and typecheck**

Run: `npm run compile:i18n && npm run check:types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add messages/en.json src/i18n/paraglide/
git commit -m "i18n: add journal_edit keys for note-creation field UI"
```

---

### Task 18: Add the Note creation collapsible

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`
- Modify: `src/journals/settings/ui/JournalEditSubpage.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/journals/settings/ui/JournalEditSubpage.test.ts`, append (inside the existing `describe("JournalEditSubpage", ...)`):

```ts
describe("note creation collapsible", () => {
  it("renders the four fields", async () => {
    const { container } = await setup();
    mount(container, "daily");
    expect(screen.getByText(m.journal_edit_section_note_creation())).toBeTruthy();
    expect(screen.getByText(m.journal_edit_name_template_label())).toBeTruthy();
    expect(screen.getByText(m.journal_edit_folder_label())).toBeTruthy();
    expect(screen.getByText(m.journal_edit_confirm_creation_label())).toBeTruthy();
    expect(screen.getByText(m.journal_edit_auto_create_label())).toBeTruthy();
  });

  it("persists nameTemplate edits through the reactive collection", async () => {
    const { container, settings } = await setup();
    mount(container, "daily");
    const inputs = screen.getAllByRole("textbox");
    const nameTemplateInput = inputs.find((el) => (el as HTMLInputElement).value === "{{date}}");
    if (!nameTemplateInput) throw new Error("nameTemplate input not found");
    await userEvent.clear(nameTemplateInput);
    await userEvent.type(nameTemplateInput, "{{journal_name}}-{{date}}");
    expect(settings.getCollection(journalConfigCollection).get("daily")?.nameTemplate).toBe(
      "{{journal_name}}-{{date}}",
    );
  });

  it("auto-create description mentions confirmation skip only when confirmCreation is on", async () => {
    const { container, settings } = await setup();
    mount(container, "daily");
    expect(screen.queryByText(m.journal_edit_auto_create_confirmation_skip_note())).toBeNull();
    settings.getCollection(journalConfigCollection).update("daily", (c) => {
      c.confirmCreation = true;
    });
    await waitFor(() => {
      expect(screen.getByText(m.journal_edit_auto_create_confirmation_skip_note())).toBeTruthy();
    });
  });
});
```

Adjust the test's `setup` helper (the `makeJournal` function) to include the new fields with default values so existing tests still parse the journal config:

```ts
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
```

Also ensure the existing setup registers the new DI dependencies. Replace the existing `setup()` body with this expanded shape (note: `journalsModule` registers `FrontmatterService`, `NotePathService`, `JournalsIndex`, `CycleService`, `NumberingService`, etc. transitively):

```ts
async function setup(raw?: unknown) {
  const initial = raw ?? {
    version: 3,
    journals: { daily: makeJournal("daily") },
  };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: initial,
  });
  await settings.initialize();
  // Stand up journals services (FrontmatterService, NotePathService, etc.). We
  // re-register only the bits the subpage actually consumes rather than the
  // full journalsModule, because journalsModule.register() also wires
  // VaultSubscriptionService (eager, requires NotesService event emitter).
  container.addModule(LoggerModule);
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  container.register(NotesService).useValue(new FakeNotesService() as unknown as NotesService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, settings, flows };
}
```

Add the necessary imports at the top of the test file:

```ts
import { LoggerModule } from "@/infrastructure/logger";
import { InputSuggestService, NotesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { CycleService, FrontmatterService, JournalsIndex, NotePathService, NumberingService } from "@/journals";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";
```

If the test run reveals any additional missing dependency (e.g. when `JournalsIndex` resolves, it may need `NotesService.events` from the fake — confirm the `FakeNotesService` exposes the `events` Subscribable, which it already does per `src/infrastructure/host/testing.ts`), register it the same way.

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: FAIL — section heading not found, fields not present.

- [ ] **Step 3: Add the Note creation collapsible to `JournalEditSubpage.vue`**

In `src/journals/settings/ui/JournalEditSubpage.vue` script block, add imports:

```ts
import FolderInput from "./FolderInput.vue";
import NoteNamePreview from "./NoteNamePreview.vue";
import FolderPathPreview from "./FolderPathPreview.vue";
import VariableReferenceHint from "./VariableReferenceHint.vue";
```

Add reactive state for the new collapsible (next to `timelineOpen`):

```ts
const noteCreationOpen = ref(true);
```

In the template, immediately after the Header `UiSettingRow` and before the Timeline collapsible, insert:

```vue
<UiCollapsibleBlock v-model:expanded="noteCreationOpen">
      <template #trigger>
        <span class="journal-section-heading">
          <UiIcon name="file-plus" />
          <span>{{ m.journal_edit_section_note_creation() }}</span>
        </span>
      </template>

      <UiSettingRow :name="m.journal_edit_name_template_label()">
        <template #description>
          <div>{{ m.journal_edit_name_template_description() }}</div>
          <VariableReferenceHint
            :journal-name="journalName"
            :date-format="config.dateFormat"
            :has-numbering="config.numbering.enabled"
          />
          <NoteNamePreview :journal-name="journalName" />
        </template>
        <UiTextInput v-model="config.nameTemplate" />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_folder_label()">
        <template #description>
          <div>{{ m.journal_edit_folder_description() }}</div>
          <VariableReferenceHint
            :journal-name="journalName"
            :date-format="config.dateFormat"
            :has-numbering="config.numbering.enabled"
          />
          <FolderPathPreview :journal-name="journalName" :folder="config.folder" />
        </template>
        <FolderInput v-model="config.folder" />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_confirm_creation_label()">
        <template #description>{{ m.journal_edit_confirm_creation_description() }}</template>
        <UiToggle v-model="config.confirmCreation" />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_auto_create_label()">
        <template #description>
          <div>{{ m.journal_edit_auto_create_description() }}</div>
          <div v-if="config.confirmCreation">{{ m.journal_edit_auto_create_confirmation_skip_note() }}</div>
        </template>
        <UiToggle v-model="config.autoCreate" />
      </UiSettingRow>
    </UiCollapsibleBlock>
```

- [ ] **Step 4: Re-run tests and confirm pass**

Run: `npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: PASS for the new three tests.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue \
        src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "feat(journals/settings/ui): Note creation collapsible with four fields"
```

---

### Task 19: Add the invertibility warning and the nameTemplate move-to-folder banner

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`
- Modify: `src/journals/settings/ui/JournalEditSubpage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the `describe("note creation collapsible", ...)` block in the test file:

```ts
it("shows the invertibility warning for non-invertible name templates", async () => {
  const initial = {
    version: 3,
    journals: { daily: makeJournal("daily", { nameTemplate: "{{date}}-{{mystery}}" }) },
  };
  const { container } = await setup(initial);
  mount(container, "daily");
  expect(
    screen.getByText(
      m.journal_edit_name_template_invertibility_warning({ reason: "unknown-variable", offending: "mystery" }),
    ),
  ).toBeTruthy();
});

it("shows the move-to-folder recommendation when nameTemplate contains /", async () => {
  const initial = {
    version: 3,
    journals: { daily: makeJournal("daily", { nameTemplate: "year/{{date}}" }) },
  };
  const { container } = await setup(initial);
  mount(container, "daily");
  expect(screen.getByText(m.journal_edit_move_to_folder_recommendation_name_template())).toBeTruthy();
});

it("apply-recommendation moves the path prefix from nameTemplate to folder", async () => {
  const initial = {
    version: 3,
    journals: { daily: makeJournal("daily", { nameTemplate: "year/{{date}}", folder: "" }) },
  };
  const { container, settings } = await setup(initial);
  mount(container, "daily");
  const links = screen.getAllByRole("link", { name: m.journal_edit_move_to_folder_apply_link() });
  await userEvent.click(links[0]!);
  const config = settings.getCollection(journalConfigCollection).get("daily")!;
  expect(config.folder).toBe("year");
  expect(config.nameTemplate).toBe("{{date}}");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: FAIL — warning/banner not yet rendered.

- [ ] **Step 3: Implement**

In `src/journals/settings/ui/JournalEditSubpage.vue` script block, add imports:

```ts
import { computed, ref, watchEffect, toRef } from "vue";
import { extractFromNameTemplate, extractFromDateFormat } from "./use-folder-extractor";
import { useInvertibilityCheck } from "./use-invertibility-check";
```

(Merge `toRef` and `computed` into the existing `vue` import line rather than duplicating it.)

Add the computed warning ref after the existing `config` computed:

```ts
const nameTemplateRef = computed(() => config.value?.nameTemplate ?? "");
const invertibility = useInvertibilityCheck(nameTemplateRef);

function applyNameTemplateRecommendation(): void {
  if (config.value) extractFromNameTemplate(config.value);
}
```

In the nameTemplate `UiSettingRow` (added in Task 18), extend the `#description` slot — insert after the `NoteNamePreview` line:

```vue
<div v-if="invertibility" class="journal-hint">
            {{ m.journal_edit_name_template_invertibility_warning(invertibility) }}
          </div>
<div v-if="config.nameTemplate.includes('/')" class="journal-recommendation">
            {{ m.journal_edit_move_to_folder_recommendation_name_template() }}
            <a href="#" @click.prevent="applyNameTemplateRecommendation">
              {{ m.journal_edit_move_to_folder_apply_link() }}
            </a>
          </div>
```

Add the recommendation style at the bottom of the `<style scoped>` block:

```css
.journal-recommendation {
  color: var(--text-warning);
  padding: var(--size-2-2) 0;
}
```

- [ ] **Step 4: Re-run tests and confirm pass**

Run: `npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue \
        src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "feat(journals/settings/ui): invertibility warning + nameTemplate move-to-folder banner"
```

---

### Task 20: Add the date-format move-to-folder banner

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`
- Modify: `src/journals/settings/ui/JournalEditSubpage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe("JournalEditSubpage", ...)` block:

```ts
it("shows the move-to-folder recommendation when dateFormat contains /", async () => {
  const initial = {
    version: 3,
    journals: { daily: makeJournal("daily", { dateFormat: "YYYY/MM/DD" }) },
  };
  const { container } = await setup(initial);
  mount(container, "daily");
  expect(screen.getByText(m.journal_edit_move_to_folder_recommendation_date_format())).toBeTruthy();
});

it("apply-recommendation moves the path prefix from dateFormat to folder", async () => {
  const initial = {
    version: 3,
    journals: { daily: makeJournal("daily", { dateFormat: "YYYY/MM/DD", folder: "" }) },
  };
  const { container, settings } = await setup(initial);
  mount(container, "daily");
  const link = screen.getByRole("link", { name: m.journal_edit_move_to_folder_apply_link() });
  await userEvent.click(link);
  const config = settings.getCollection(journalConfigCollection).get("daily")!;
  expect(config.folder).toBe("{{date:YYYY}}/{{date:MM}}");
  expect(config.dateFormat).toBe("DD");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/journals/settings/ui/JournalEditSubpage.vue` script block, add:

```ts
function applyDateFormatRecommendation(): void {
  if (config.value) extractFromDateFormat(config.value);
}
```

In the existing Date format `UiSettingRow`, extend the `#description` slot — insert after the `DateFormatPreview` line:

```vue
<div v-if="config.dateFormat.includes('/')" class="journal-recommendation">
          {{ m.journal_edit_move_to_folder_recommendation_date_format() }}
          <a href="#" @click.prevent="applyDateFormatRecommendation">
            {{ m.journal_edit_move_to_folder_apply_link() }}
          </a>
        </div>
```

- [ ] **Step 4: Re-run tests and confirm pass**

Run: `npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue \
        src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "feat(journals/settings/ui): dateFormat move-to-folder recommendation banner"
```

---

### Task 21: Add the Templates collapsible

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`
- Modify: `src/journals/settings/ui/JournalEditSubpage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new nested describe in the test file:

```ts
describe("templates collapsible", () => {
  it("renders the section heading with count", async () => {
    const initial = {
      version: 3,
      journals: { daily: makeJournal("daily", { templates: ["a.md", "b.md"] }) },
    };
    const { container } = await setup(initial);
    mount(container, "daily");
    expect(screen.getByText(m.journal_edit_section_templates())).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("appends an empty entry when Add template is clicked", async () => {
    const { container, settings } = await setup();
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_templates()));
    await userEvent.click(screen.getByText(m.journal_edit_template_add_button()));
    expect(settings.getCollection(journalConfigCollection).get("daily")?.templates).toEqual([""]);
  });

  it("removes an entry when the trash button is clicked", async () => {
    const initial = {
      version: 3,
      journals: { daily: makeJournal("daily", { templates: ["templates/a.md"] }) },
    };
    const { container, settings } = await setup(initial);
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_templates()));
    await userEvent.click(screen.getByLabelText(m.journal_edit_template_remove_tooltip()));
    expect(settings.getCollection(journalConfigCollection).get("daily")?.templates).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/journals/settings/ui/JournalEditSubpage.vue` script block add:

```ts
import FileInput from "./FileInput.vue";
import TemplatePathPreview from "./TemplatePathPreview.vue";
import UiButton from "@/ui/UiButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";

const templatesOpen = ref(false);

function addTemplate(): void {
  if (!config.value) return;
  config.value.templates.push("");
  templatesOpen.value = true;
}

function removeTemplate(index: number): void {
  if (!config.value) return;
  config.value.templates.splice(index, 1);
}
```

In the template, insert immediately after the Date format `UiSettingRow` and before the Timeline collapsible:

```vue
<UiCollapsibleBlock v-model:expanded="templatesOpen">
      <template #trigger>
        <UiIconedRow icon="notepad-text-dashed">
          {{ m.journal_edit_section_templates() }}
          <span class="flair">{{ config.templates.length }}</span>
        </UiIconedRow>
      </template>
      <template #controls>
        <UiButton @click="addTemplate">{{ m.journal_edit_template_add_button() }}</UiButton>
      </template>

      <UiSettingRow>
        <template #description>
          <div>{{ m.journal_edit_templates_description() }}</div>
          <VariableReferenceHint
            :journal-name="journalName"
            :date-format="config.dateFormat"
            :has-numbering="config.numbering.enabled"
          />
        </template>
      </UiSettingRow>

      <template v-for="(_path, index) in config.templates" :key="index">
        <UiSettingRow>
          <FileInput
            v-model="config.templates[index]"
            :placeholder="m.journal_edit_template_path_placeholder()"
          />
          <UiIconButton
            icon="trash"
            :tooltip="m.journal_edit_template_remove_tooltip()"
            @click="removeTemplate(index)"
          />
        </UiSettingRow>
        <TemplatePathPreview :journal-name="journalName" :path="config.templates[index] ?? ''" />
      </template>
    </UiCollapsibleBlock>
```

`UiIconedRow` takes prop `icon: string` and renders its default slot, so the `<span class="flair">` count badge is fine as-is — the `.flair` style is a global Obsidian class.

- [ ] **Step 4: Re-run tests and confirm pass**

Run: `npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue \
        src/journals/settings/ui/JournalEditSubpage.test.ts
git commit -m "feat(journals/settings/ui): Templates collapsible with inline add/remove"
```

---

### Task 22: Reorder existing collapsibles and flip Timeline default

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`

This is a layout-only change; existing tests should pass unchanged.

- [ ] **Step 1: Reorder**

In `src/journals/settings/ui/JournalEditSubpage.vue`:

1. Change `const timelineOpen = ref(true);` to `const timelineOpen = ref(false);`.
2. Confirm the template order matches:
   - Header row
   - Note creation collapsible (`noteCreationOpen`)
   - Date format `UiSettingRow`
   - Templates collapsible (`templatesOpen`)
   - Timeline collapsible (`timelineOpen`)
   - Sequence collapsible (`sequenceOpen`)
   - Frontmatter collapsible (`frontmatterOpen`)

Move `<UiCollapsibleBlock v-model:expanded="timelineOpen">` and the surrounding block (lines that came from the original file, around lines 133–180) to be **after** the Templates collapsible inserted in Task 21.

- [ ] **Step 2: Run all tests**

Run: `npm run test -- src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: PASS (the layout reorder shouldn't break anything because tests target by role/text).

- [ ] **Step 3: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue
git commit -m "refactor(journals/settings/ui): reorder edit subpage; Note creation first, Timeline collapsed by default"
```

---

### Task 23: Per-spec verification gate

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: ALL PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 3: Run lint**

Run: `npm run check:lint`
Expected: PASS.

- [ ] **Step 4: Smoke e2e**

Run: `npm run test:e2e:smoke` (if the script exists; if not, skip and document)
Expected: PASS, or report the actual command name and whether it exists in `package.json`.

If lint or typecheck reports issues, fix at the source (never silence via `eslint-disable` per [[feedback_no_lint_silence]]; never use `@ts-expect-error` per [[feedback_test_hygiene]]).

- [ ] **Step 5: Verify nothing else regressed**

Run: `git diff --stat origin/main...HEAD`
Spot-check that only the files listed across these tasks were touched.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

If you had to make fixes during this verification step, commit them as a final cleanup:

```bash
git add -A
git commit -m "chore(journals/settings/ui): verification fixes"
```

If no fixes were needed, no commit is required.

---

## Summary

This plan delivers the spec in three phases:

- **Phase 1 (Tasks 1–6):** Inline-suggest host primitive
  (`defineInputSuggest`, `InputSuggestService`,
  `FakeInputSuggestService`, module wiring), plus
  `NotesService.listFolders()`.
- **Phase 2 (Tasks 7–16):** Shared UI primitives
  (`UiInputSuggestInput`, `FolderInput`, `FileInput`), the
  variable-reference modal and hint, three preview components, and
  three composables.
- **Phase 3 (Tasks 17–23):** `JournalEditSubpage` layout extension, two
  new collapsibles, recommendation banners, invertibility warning,
  layout reorder, and verification gate.

Each task is self-contained with a TDD cycle and its own commit. The
plan touches:

- 2 new directories (`input-suggests/`, expanded `journals/settings/ui/`)
- 1 modified mock (`__mocks__/obsidian.ts`)
- 1 new generic UI primitive (`UiInputSuggestInput.vue`)
- 2 typed inputs (`FolderInput`, `FileInput`)
- 3 preview components
- 1 modal + hint pair
- 3 composables + 1 helper
- 1 i18n keyset
- The existing `JournalEditSubpage.vue` and its test
