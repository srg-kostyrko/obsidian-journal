# Code-block Reference Help Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore v2's "Supported code blocks" reference as a hint link in the journal Templates settings section that opens a modal documenting the three code blocks with live-rendered previews for the current journal (regression #11).

**Architecture:** Mirror v3's existing `VariableReferenceHint → VariableReferenceModal` pattern. A new `CodeBlockReferenceHint.vue` opens `codeBlockReferenceModal` via `ModalService`. The modal (`CodeBlockReferenceModal.vue`) renders click-to-copy snippets (`CodeBlockSnippet.vue`), prose docs, the timeline-mode and home-option lists, and live `NavigationCodeBlock`/`TimelineCodeBlock`/`HomeCodeBlock` components. The live blocks resolve their data from `JournalsIndex` by path; a composable (`use-code-block-preview-path.ts`) registers a synthetic index entry for the current journal at today's anchor **synchronously during setup** (the index Map is not reactive, so registering later would not re-trigger the blocks' computeds) and unregisters it on unmount.

**Tech Stack:** Vue 3 `<script setup>`, valibot, paraglide i18n (`messages/en.json` → `npm run compile:i18n`), Vitest + `@testing-library/vue` + `@testing-library/user-event`, repo DI (`Container`/`provideInjectorOnApp`/`useService`).

---

## File Structure

- **Create** `src/journals/settings/ui/CodeBlockSnippet.vue` — presentational click-to-copy fenced-snippet (v3 equivalent of v2's `DisplayCodeBlock`).
- **Create** `src/journals/settings/ui/CodeBlockSnippet.test.ts`
- **Create** `src/journals/settings/ui/use-code-block-preview-path.ts` — registers/unregisters the synthetic preview entry; returns its `VaultPath`.
- **Create** `src/journals/settings/ui/use-code-block-preview-path.test.ts`
- **Create** `src/journals/settings/ui/CodeBlockReferenceModal.vue` — the modal body.
- **Create** `src/journals/settings/ui/CodeBlockReferenceModal.test.ts`
- **Create** `src/journals/settings/ui/CodeBlockReferenceHint.vue` — the link.
- **Create** `src/journals/settings/ui/CodeBlockReferenceHint.test.ts`
- **Modify** `messages/en.json` — add 20 `journal_edit_code_block_*` messages.
- **Modify** `src/code-blocks/timeline/timeline-config.ts` — export `timelineModes` as the single source for the mode picklist + the modal's list.
- **Modify** `src/journals/settings/ui/modals.ts` — register `codeBlockReferenceModal`.
- **Modify** `src/journals/settings/ui/JournalEditSubpage.vue` — render the hint between `VariableReferenceHint` and `TemplaterSupportHint`.
- **Modify** `docs/2026-06-01-v2-v3-feature-gaps.md` — close item #11.

---

## Task 1: i18n messages

**Files:**

- Modify: `messages/en.json`
- Generated: `src/i18n/paraglide/**` (via compile)

- [ ] **Step 1: Add the message keys**

In `messages/en.json`, add these 20 entries to the top-level object (key order is irrelevant; inserting them immediately after the line `"journal_edit_section_templates": "Templates",` keeps them grouped):

```json
  "journal_edit_code_block_reference_link": "Supported code blocks.",
  "journal_edit_code_block_reference_modal_title": "Supported code blocks",
  "journal_edit_code_block_copy_hint": "Click a code block to copy it to your clipboard.",
  "journal_edit_code_block_copied": "Copied to clipboard.",
  "journal_edit_code_block_nav_description": "The navigation block helps you move between notes adjacent to the current one.",
  "journal_edit_code_block_nav_current": "Its configuration for the {name} journal looks like this:",
  "journal_edit_code_block_nav_aliases_lead": "These older block names are aliases that behave identically:",
  "journal_edit_code_block_timeline_description": "The timeline block helps you navigate within larger time periods.",
  "journal_edit_code_block_timeline_default": "The default timeline for the {name} journal looks like this:",
  "journal_edit_code_block_timeline_mode_lead": "Change the timeline mode by adding a mode option to the block.",
  "journal_edit_code_block_timeline_modes_lead": "Supported modes:",
  "journal_edit_code_block_timeline_weeks": "controls the week-number column (left, right, or none).",
  "journal_edit_code_block_home_description": "The home block displays links to the current notes in your journals.",
  "journal_edit_code_block_home_default": "By default it looks like this:",
  "journal_edit_code_block_home_options_lead": "Supported options:",
  "journal_edit_code_block_home_option_show": "controls which journals are displayed (only the day link by default). Supported values: day, week, month, quarter, year, custom.",
  "journal_edit_code_block_home_option_separator": "the text used to separate multiple links.",
  "journal_edit_code_block_home_option_scale": "increases link size as a multiplier of the text size (for example, scale: 2 doubles it).",
  "journal_edit_code_block_home_option_shelf": "limits the displayed journals to a specific shelf.",
  "journal_edit_code_block_home_custom_lead": "With custom options it can look like this:",
```

- [ ] **Step 2: Compile the messages**

Run: `npm run compile:i18n`
Expected: completes without error; new files appear under `src/i18n/paraglide/messages/` (e.g. `journal_edit_code_block_reference_link.js`).

- [ ] **Step 3: Verify a message is callable**

Run: `node -e "import('./src/i18n/paraglide/messages/journal_edit_code_block_copy_hint.js').then(m=>console.log(typeof m[Object.keys(m)[0]]))" 2>/dev/null || echo "check via grep"`
Run: `grep -rl "journal_edit_code_block_copy_hint" src/i18n/paraglide`
Expected: at least one match (the compiled message exists).

- [ ] **Step 4: Commit**

```bash
git add messages/en.json src/i18n/paraglide
git commit -m "feat(i18n): add code-block reference modal messages"
```

---

## Task 2: Export `timelineModes` as a single source of truth

**Files:**

- Modify: `src/code-blocks/timeline/timeline-config.ts`

No new test: this is a constant reused by the existing schema (covered by `timeline-config.test.ts`) and asserted indirectly by Task 5's modal test.

- [ ] **Step 1: Refactor to export the modes array**

Replace the top of `src/code-blocks/timeline/timeline-config.ts`:

```ts
import * as v from "valibot";

const timelineModeSchema = v.picklist(["week", "month", "quarter", "calendar"] as const);
```

with:

```ts
import * as v from "valibot";

export const timelineModes = ["week", "month", "quarter", "calendar"] as const;

const timelineModeSchema = v.picklist(timelineModes);
```

(Leave `timelineBlockSchema`, `TimelineBlockConfig`, and `TimelineMode` unchanged.)

- [ ] **Step 2: Verify types still compile**

Run: `npm run check:types`
Expected: PASS (no errors).

- [ ] **Step 3: Verify existing timeline tests still pass**

Run: `npx vitest run src/code-blocks/timeline/timeline-config.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/code-blocks/timeline/timeline-config.ts
git commit -m "refactor(code-blocks): export timelineModes from timeline-config"
```

---

## Task 3: `CodeBlockSnippet.vue` (click-to-copy fenced snippet)

**Files:**

- Create: `src/journals/settings/ui/CodeBlockSnippet.vue`
- Test: `src/journals/settings/ui/CodeBlockSnippet.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/CodeBlockSnippet.test.ts`:

````ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { initLocale } from "@/i18n";

import CodeBlockSnippet from "./CodeBlockSnippet.vue";

const writeText = vi.fn().mockResolvedValue(undefined);

vi.stubGlobal("navigator", {
  clipboard: { writeText },
});

beforeAll(() => initLocale("en"));

afterEach(() => {
  cleanup();
  writeText.mockClear();
});

describe("CodeBlockSnippet", () => {
  it("renders the fenced block name", () => {
    render(CodeBlockSnippet, { props: { name: "journal-nav" } });
    expect(screen.getByText(/journal-nav/)).toBeTruthy();
  });

  it("copies the bare fence for a name-only snippet", async () => {
    render(CodeBlockSnippet, { props: { name: "journal-nav" } });
    await userEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("```journal-nav\n```");
  });

  it("includes the body inside the copied fence", async () => {
    render(CodeBlockSnippet, { props: { name: "calendar-timeline", body: "mode: month" } });
    await userEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("```calendar-timeline\nmode: month\n```");
  });
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/journals/settings/ui/CodeBlockSnippet.test.ts`
Expected: FAIL — cannot resolve `./CodeBlockSnippet.vue`.

- [ ] **Step 3: Write the implementation**

Create `src/journals/settings/ui/CodeBlockSnippet.vue`:

```vue
<script setup lang="ts">
import { Notice } from "obsidian";
import { computed } from "vue";

import { m } from "@/i18n";

const props = defineProps<{ name: string; body?: string }>();

const text = computed(() =>
  props.body ? `\`\`\`${props.name}\n${props.body}\n\`\`\`` : `\`\`\`${props.name}\n\`\`\``,
);

function copy(): void {
  void navigator.clipboard.writeText(text.value).then(() => {
    new Notice(m.journal_edit_code_block_copied());
  });
}
</script>

<template>
  <pre class="code-block-snippet" role="button" tabindex="0" @click="copy()" @keydown.enter="copy()">{{ text }}</pre>
</template>

<style scoped>
.code-block-snippet {
  border: var(--modal-border-width) solid var(--modal-border-color);
  border-radius: var(--radius-s);
  cursor: pointer;
  padding: var(--size-2-2);
  font-family: var(--font-monospace);
  white-space: pre;
}
.code-block-snippet:hover {
  border-color: var(--interactive-accent);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/journals/settings/ui/CodeBlockSnippet.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/CodeBlockSnippet.vue src/journals/settings/ui/CodeBlockSnippet.test.ts
git commit -m "feat(code-blocks): add CodeBlockSnippet click-to-copy component"
```

---

## Task 4: `use-code-block-preview-path` composable

**Files:**

- Create: `src/journals/settings/ui/use-code-block-preview-path.ts`
- Test: `src/journals/settings/ui/use-code-block-preview-path.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/use-code-block-preview-path.test.ts`:

```ts
import { cleanup, render } from "@testing-library/vue";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex } from "@/journals";

import { useCodeBlockPreviewPath } from "./use-code-block-preview-path";

class FakeCycleService {
  anchorOf(): Option<AnchorString> {
    return Option.some("2026-05-27" as AnchorString);
  }
}

function setup() {
  const index = new JournalsIndex();
  const container = new Container();
  container.register(JournalsIndex).useValue(index);
  container.register(CycleService).useValue(new FakeCycleService() as unknown as CycleService);

  let captured: VaultPath | null = null;
  const Host = defineComponent({
    setup() {
      captured = useCodeBlockPreviewPath("Daily");
      return () => h("div");
    },
  });

  const utils = render(Host, {
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

  return { index, path: captured as VaultPath, unmount: utils.unmount };
}

afterEach(() => cleanup());

describe("useCodeBlockPreviewPath", () => {
  it("registers a synthetic entry resolvable by the returned path", () => {
    const { index, path } = setup();
    const entry = index.entryByPath(path);
    expect(entry.isSome()).toBe(true);
    if (entry.isSome()) {
      expect(entry.value).toMatchObject({ journalName: "Daily", anchor: "2026-05-27", path });
    }
  });

  it("unregisters the synthetic entry on unmount", () => {
    const { index, path, unmount } = setup();
    unmount();
    expect(index.entryByPath(path).isSome()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/journals/settings/ui/use-code-block-preview-path.test.ts`
Expected: FAIL — cannot resolve `./use-code-block-preview-path`.

- [ ] **Step 3: Write the implementation**

Create `src/journals/settings/ui/use-code-block-preview-path.ts`:

```ts
import { onUnmounted } from "vue";

import { CalendarDate, type AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { CycleService, JournalsIndex } from "@/journals";

let counter = 0;

export function useCodeBlockPreviewPath(journalName: string): VaultPath {
  const index = useService(JournalsIndex);
  const cycle = useService(CycleService);

  counter += 1;
  const path = `@journal-code-block-preview@${counter}` as VaultPath;
  const today = CalendarDate.today();
  const anchor: AnchorString = cycle.anchorOf(journalName, today).getOr(today.toAnchor());

  // Registered synchronously (not in onMounted): the blocks read the index from a
  // computed, and the index Map is not reactive, so the entry must already exist
  // before the child block components run their own setup.
  index.register({ journalName, anchor, path });

  onUnmounted(() => {
    index.unregister(path);
  });

  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/journals/settings/ui/use-code-block-preview-path.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/use-code-block-preview-path.ts src/journals/settings/ui/use-code-block-preview-path.test.ts
git commit -m "feat(code-blocks): add preview-path composable for reference modal"
```

---

## Task 5: `CodeBlockReferenceModal.vue` + modal registration

**Files:**

- Create: `src/journals/settings/ui/CodeBlockReferenceModal.vue`
- Modify: `src/journals/settings/ui/modals.ts`
- Test: `src/journals/settings/ui/CodeBlockReferenceModal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/CodeBlockReferenceModal.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { timelineModes } from "@/code-blocks/timeline/timeline-config";
import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex } from "@/journals";

import CodeBlockReferenceModal from "./CodeBlockReferenceModal.vue";

class FakeCycleService {
  anchorOf(): Option<AnchorString> {
    return Option.some("2026-05-27" as AnchorString);
  }
}

function mount() {
  const container = new Container();
  container.register(JournalsIndex).useValue(new JournalsIndex());
  container.register(CycleService).useValue(new FakeCycleService() as unknown as CycleService);
  return render(CodeBlockReferenceModal, {
    props: { journalName: "Daily" },
    global: {
      stubs: { NavigationCodeBlock: true, TimelineCodeBlock: true, HomeCodeBlock: true },
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

beforeAll(() => initLocale("en"));
afterEach(() => cleanup());

describe("CodeBlockReferenceModal", () => {
  it("documents all three code-block names", () => {
    mount();
    expect(screen.getByText(/journal-nav/)).toBeTruthy();
    expect(screen.getByText(/calendar-timeline/)).toBeTruthy();
    expect(screen.getByText(/journals-home/)).toBeTruthy();
  });

  it("lists every supported timeline mode", () => {
    mount();
    for (const mode of timelineModes) {
      expect(screen.getAllByText(mode).length).toBeGreaterThan(0);
    }
  });

  it("lists every home block option", () => {
    mount();
    for (const option of ["show", "separator", "scale", "shelf"]) {
      expect(screen.getAllByText(option).length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/journals/settings/ui/CodeBlockReferenceModal.test.ts`
Expected: FAIL — cannot resolve `./CodeBlockReferenceModal.vue`.

- [ ] **Step 3: Create the modal component**

Create `src/journals/settings/ui/CodeBlockReferenceModal.vue`:

```vue
<script setup lang="ts">
import type { HomeBlockConfig } from "@/code-blocks/home/home-config";
import HomeCodeBlock from "@/code-blocks/home/ui/HomeCodeBlock.vue";
import NavigationCodeBlock from "@/code-blocks/nav/ui/NavigationCodeBlock.vue";
import { timelineModes, type TimelineBlockConfig } from "@/code-blocks/timeline/timeline-config";
import TimelineCodeBlock from "@/code-blocks/timeline/ui/TimelineCodeBlock.vue";
import { m } from "@/i18n";

import CodeBlockSnippet from "./CodeBlockSnippet.vue";
import { useCodeBlockPreviewPath } from "./use-code-block-preview-path";

const props = defineProps<{ journalName: string }>();

const previewPath = useCodeBlockPreviewPath(props.journalName);

const navConfig: Record<string, never> = {};
const timelineConfig: TimelineBlockConfig = {};
const defaultHomeConfig: HomeBlockConfig = { show: ["day"], separator: " • ", scale: 1 };
const customHomeConfig: HomeBlockConfig = { show: ["day", "month"], separator: " | ", scale: 2 };
const customHomeBody = `show:\n  - day\n  - month\nscale: 2\nseparator: " | "`;
</script>

<template>
  <div class="code-block-reference">
    <p class="code-block-reference__hint">{{ m.journal_edit_code_block_copy_hint() }}</p>

    <section class="code-block-reference__section">
      <CodeBlockSnippet name="journal-nav" />
      <p>{{ m.journal_edit_code_block_nav_description() }}</p>
      <p>{{ m.journal_edit_code_block_nav_current({ name: journalName }) }}</p>
      <NavigationCodeBlock :path="previewPath" :config="navConfig" />
      <p>
        {{ m.journal_edit_code_block_nav_aliases_lead() }}
        <code>calendar-nav</code>, <code>interval-nav</code>
      </p>
    </section>

    <section class="code-block-reference__section">
      <CodeBlockSnippet name="calendar-timeline" />
      <p>{{ m.journal_edit_code_block_timeline_description() }}</p>
      <p>{{ m.journal_edit_code_block_timeline_default({ name: journalName }) }}</p>
      <TimelineCodeBlock :path="previewPath" :config="timelineConfig" />
      <p>{{ m.journal_edit_code_block_timeline_mode_lead() }}</p>
      <CodeBlockSnippet name="calendar-timeline" body="mode: month" />
      <p>{{ m.journal_edit_code_block_timeline_modes_lead() }}</p>
      <ul>
        <li v-for="mode in timelineModes" :key="mode">
          <code>{{ mode }}</code>
        </li>
      </ul>
      <p><code>weeks</code> — {{ m.journal_edit_code_block_timeline_weeks() }}</p>
    </section>

    <section class="code-block-reference__section">
      <CodeBlockSnippet name="journals-home" />
      <p>{{ m.journal_edit_code_block_home_description() }}</p>
      <p>{{ m.journal_edit_code_block_home_default() }}</p>
      <HomeCodeBlock :path="previewPath" :config="defaultHomeConfig" />
      <p>{{ m.journal_edit_code_block_home_options_lead() }}</p>
      <ul>
        <li><code>show</code> — {{ m.journal_edit_code_block_home_option_show() }}</li>
        <li><code>separator</code> — {{ m.journal_edit_code_block_home_option_separator() }}</li>
        <li><code>scale</code> — {{ m.journal_edit_code_block_home_option_scale() }}</li>
        <li><code>shelf</code> — {{ m.journal_edit_code_block_home_option_shelf() }}</li>
      </ul>
      <p>{{ m.journal_edit_code_block_home_custom_lead() }}</p>
      <CodeBlockSnippet name="journals-home" :body="customHomeBody" />
      <HomeCodeBlock :path="previewPath" :config="customHomeConfig" />
    </section>
  </div>
</template>

<style scoped>
.code-block-reference__hint {
  color: var(--text-accent);
}
.code-block-reference__section {
  padding-bottom: var(--size-4-2);
  margin-bottom: var(--size-4-2);
  border-bottom: var(--modal-border-width) solid var(--modal-border-color);
}
.code-block-reference__section:last-child {
  border-bottom: none;
}
</style>
```

- [ ] **Step 4: Register the modal**

In `src/journals/settings/ui/modals.ts`:

Add the import alongside the other modal-component imports (alphabetical):

```ts
import CodeBlockReferenceModal from "./CodeBlockReferenceModal.vue";
```

Add the modal definition (near `variableReferenceModal` at the end of the file):

```ts
export const codeBlockReferenceModal = defineModal()({
  component: CodeBlockReferenceModal,
  title: (_: { journalName: string }) => m.journal_edit_code_block_reference_modal_title(),
  width: 780,
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/journals/settings/ui/CodeBlockReferenceModal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify types compile (template type-checking)**

Run: `npm run check:types`
Expected: PASS. If `:config` bindings error on literal narrowing, confirm `defaultHomeConfig`/`customHomeConfig`/`timelineConfig` are the typed `const`s above (they are) — the template binds those consts, not inline literals.

- [ ] **Step 7: Commit**

```bash
git add src/journals/settings/ui/CodeBlockReferenceModal.vue src/journals/settings/ui/CodeBlockReferenceModal.test.ts src/journals/settings/ui/modals.ts
git commit -m "feat(code-blocks): add code-block reference modal with live previews"
```

---

## Task 6: `CodeBlockReferenceHint.vue` + wire into the subpage

**Files:**

- Create: `src/journals/settings/ui/CodeBlockReferenceHint.vue`
- Test: `src/journals/settings/ui/CodeBlockReferenceHint.test.ts`
- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`

- [ ] **Step 1: Write the failing test**

Create `src/journals/settings/ui/CodeBlockReferenceHint.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";

import CodeBlockReferenceHint from "./CodeBlockReferenceHint.vue";
import { codeBlockReferenceModal } from "./modals";

beforeAll(() => initLocale("en"));
afterEach(() => cleanup());

function build() {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  return { modals, container };
}

describe("CodeBlockReferenceHint", () => {
  it("opens the code-block reference modal with the journal name", async () => {
    const { modals, container } = build();
    render(CodeBlockReferenceHint, {
      props: { journalName: "Daily" },
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
    expect(lastOpen.definition).toBe(codeBlockReferenceModal);
    expect(lastOpen.props).toMatchObject({ journalName: "Daily" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/journals/settings/ui/CodeBlockReferenceHint.test.ts`
Expected: FAIL — cannot resolve `./CodeBlockReferenceHint.vue`.

- [ ] **Step 3: Create the hint component**

Create `src/journals/settings/ui/CodeBlockReferenceHint.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";

import { codeBlockReferenceModal } from "./modals";

const props = defineProps<{ journalName: string }>();

const modals = useService(ModalService);

function show(event: Event): void {
  event.preventDefault();
  void modals.open(codeBlockReferenceModal, { journalName: props.journalName });
}
</script>

<template>
  <a href="#" @click="show">{{ m.journal_edit_code_block_reference_link() }}</a>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/journals/settings/ui/CodeBlockReferenceHint.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Wire the hint into the Templates section**

In `src/journals/settings/ui/JournalEditSubpage.vue`:

Add the import next to the other hint imports (the file imports `TemplaterSupportHint` ~line 35 and `VariableReferenceHint` ~line 39 — add this alphabetically among them):

```ts
import CodeBlockReferenceHint from "./CodeBlockReferenceHint.vue";
```

In the Templates section's `#description` slot, insert the hint between `VariableReferenceHint` and `TemplaterSupportHint`. Change:

```vue
<VariableReferenceHint
  context="template-path"
  :journal-name="journalName"
  :date-format="config.dateFormat"
  :has-cycle="hasCycle"
  :numbering-variable-names="numberingVariableNames"
/>
<TemplaterSupportHint />
```

to:

```vue
<VariableReferenceHint
  context="template-path"
  :journal-name="journalName"
  :date-format="config.dateFormat"
  :has-cycle="hasCycle"
  :numbering-variable-names="numberingVariableNames"
/>
<CodeBlockReferenceHint :journal-name="journalName" />
<TemplaterSupportHint />
```

- [ ] **Step 6: Verify the subpage still renders and types compile**

Run: `npx vitest run src/journals/settings/ui/JournalEditSubpage.test.ts`
Expected: PASS (the hint only calls `ModalService.open` on click — already provided in that test's container; no new service needed at render time).

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/journals/settings/ui/CodeBlockReferenceHint.vue src/journals/settings/ui/CodeBlockReferenceHint.test.ts src/journals/settings/ui/JournalEditSubpage.vue
git commit -m "feat(code-blocks): surface code-block reference link in journal templates settings"
```

---

## Task 7: Full quality gates + close the gap-audit item

**Files:**

- Modify: `docs/2026-06-01-v2-v3-feature-gaps.md`

- [ ] **Step 1: Run the full gates**

Run: `npm run test`
Expected: PASS (all suites, including the 4 new test files).

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS (no errors; no eslint-disable added).

- [ ] **Step 2: Close item #11 in the gap audit**

In `docs/2026-06-01-v2-v3-feature-gaps.md`, change the item #11 checkbox from `[ ]` to `[x]` and append a resolution note. Replace:

```markdown
- [ ] **11. Code-block reference help modal** — gone.
  - v2: `CodeBlockReference.modal.vue` (+ `CodeBlockReferenceHint.vue`) — in-settings syntax docs, timeline mode list, home-block options, alias notes, click-to-copy snippets, live previews.
  - v3: no reference/help surface. Only modal under v3 code-blocks is `editNavBlockRowModal`.
```

with:

```markdown
- [x] **11. Code-block reference help modal** — ported.
  - v2: `CodeBlockReference.modal.vue` (+ `CodeBlockReferenceHint.vue`) — in-settings syntax docs, timeline mode list, home-block options, alias notes, click-to-copy snippets, live previews.
  - v3: `src/journals/settings/ui/` — `CodeBlockReferenceHint` (in the Templates section, between the variable-reference and Templater-support hints, matching v2 placement) opens `codeBlockReferenceModal` → `CodeBlockReferenceModal`. Documents `journal-nav` (+ `calendar-nav`/`interval-nav` aliases), `calendar-timeline` (modes from the shared `timelineModes` + the v3 `weeks` option), and `journals-home` (show/separator/scale/shelf), with click-to-copy `CodeBlockSnippet`s and live previews rendered via `use-code-block-preview-path` (registers a synthetic `JournalsIndex` entry at today's anchor for the open journal, unregistered on close — v2-literal). Delta: registering the synthetic entry at today's anchor temporarily repoints that anchor's index mapping while the modal is open (v2's latent behavior, explicitly chosen).
```

- [ ] **Step 3: Commit**

```bash
git add docs/2026-06-01-v2-v3-feature-gaps.md
git commit -m "docs: close v2->v3 gap #11 (code-block reference modal)"
```

---

## Self-Review Notes

- **Spec coverage:** hint placement (Task 6), live previews via synthetic index entry (Task 4), all three blocks + alias note + mode list + home options + customized example (Task 5), click-to-copy snippets (Task 3), i18n (Task 1), `timelineModes` single source (Task 2), gap-audit closure + gates (Task 7). All spec sections map to a task.
- **Type consistency:** `useCodeBlockPreviewPath(journalName: string): VaultPath`, `codeBlockReferenceModal` props `{ journalName: string }`, `CodeBlockSnippet` props `{ name: string; body?: string }`, `timelineModes` exported readonly tuple — names match across all tasks.
- **No placeholders:** every code/test step shows complete content.
