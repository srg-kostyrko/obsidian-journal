# v3 Decorations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port v2's per-journal calendar decorations into v3 — schema, evaluation engine, renderer, and reactive composable — without porting the management UI or notes-calendar consumer view.

**Architecture:** A new top-level `src/decorations/` feature. Decorations remain stored inside each `JournalConfig`. A pure-ish `DecorationEngine` (DI-resolved) evaluates conditions against per-period `NoteMetadata` and produces `Map<AnchorString, Style[]>`. A `useCellDecorations` composable owns event subscriptions and per-anchor `ShallowRef` slots that descendant `CellDecoration` components inject. Existing `CalendarXxxView` components gain a scoped `cell` slot so a future notes-calendar view can wrap each cell with `CellDecoration`.

**Tech Stack:** TypeScript, valibot, vitest, Vue 3 SFC, `@testing-library/vue`, the project's DI container, `ts-pattern`, `attempt`/`Result`/`Option` monads.

---

## Reference: existing patterns

- Valibot schemas: `src/journals/config.ts`, `src/calendar/types.ts`.
- Service shape (DI + `inject(...)` field initializers): `src/journals/frontmatter.ts`, `src/journals/numbering.ts`.
- Pure helper free functions tested standalone: `src/journals/numbering.ts` + `src/journals/numbering.test.ts`.
- Module factory vs constant: zero-arg uses a constant per `feedback_di_module_factories`. See `src/journals/module.ts` (`journalsModule`) for the pattern.
- Host service registration: `src/infrastructure/host/module.ts` (`createHostModule(plugin)`).
- Vue component tests with testing-library + minimal host pattern: `src/calendar/ui/CalendarMonthView.test.ts`.
- v2 source-of-truth being ported: `src/_old-code/composables/use-decorations.ts`, `src/_old-code/components/notes-calendar/decorations/CalendarDecoration.vue`, `src/_old-code/types/settings.types.ts`.

Domain shapes referenced often:

- `Period.anchor: CalendarDate` (per-period canonical position, accounts for ISO-week cross-year quirks).
- `JournalsIndex.entryByAnchor(name, anchor) → Option<JournalEntry>` and `entryByPath(path) → Option<JournalEntry>`.
- `JournalsIndex.events["entryChanged"]: ({ entry, kind: "added" | "removed" }) => void`.
- `NotesService.events["metadata-changed"]: (path: VaultPath) => void`.
- `CycleService.offsets(name, date) → Option<readonly [positive, negative]>` (v3 replacement for v2 `calculateOffset`).

---

## File Structure

**Create:**

- `src/infrastructure/host/internal/note-metadata-service.ts`
- `src/infrastructure/host/internal/note-metadata-service.test.ts`
- `src/decorations/config.ts`
- `src/decorations/defaults.ts`
- `src/decorations/engine-checks.ts`
- `src/decorations/engine-checks.test.ts`
- `src/decorations/engine.ts`
- `src/decorations/engine.test.ts`
- `src/decorations/derive-styles.ts`
- `src/decorations/derive-styles.test.ts`
- `src/decorations/use-cell-decorations.ts`
- `src/decorations/use-cell-decorations.test.ts`
- `src/decorations/module.ts`
- `src/decorations/testing.ts`
- `src/decorations/index.ts`
- `src/decorations/errors.ts`
- `src/decorations/ui/color.ts`
- `src/decorations/ui/color.test.ts`
- `src/decorations/ui/DecorationCorner.vue`
- `src/decorations/ui/DecorationShape.vue`
- `src/decorations/ui/DecorationIcon.vue`
- `src/decorations/ui/CellDecoration.vue`
- `src/decorations/ui/CellDecoration.test.ts`
- `src/decorations/ui/modals.ts` (empty placeholder)

**Modify:**

- `src/infrastructure/host/index.ts` — export `NoteMetadataService`, `NoteMetadata`, `NoteTask`.
- `src/infrastructure/host/types.ts` — define `NoteMetadata`, `NoteTask`.
- `src/infrastructure/host/module.ts` — register `NoteMetadataService`.
- `src/infrastructure/host/internal/testing.ts` — add `getFileCache` to the fake `metadataCache`.
- `src/infrastructure/host/testing.ts` — `FakeNoteMetadataService`.
- `src/journals/config.ts` — `journalConfigSchema` gains `decorations: v.optional(v.array(decorationSchema), [])`.
- `src/calendar/ui/CalendarMonthView.vue`, `CalendarWeekView.vue`, `CalendarQuarterView.vue`, `CalendarYearView.vue`, `CalendarDecadeView.vue` — scoped `cell` slot.
- `src/main.ts` — register `decorationsModule`.

---

## Task 1: `NoteMetadata` types and `NoteMetadataService`

**Files:**

- Modify: `src/infrastructure/host/types.ts`
- Create: `src/infrastructure/host/internal/note-metadata-service.ts`
- Modify: `src/infrastructure/host/internal/testing.ts` (extend `metadataCacheApi`)
- Test: `src/infrastructure/host/internal/note-metadata-service.test.ts`

- [ ] **Step 1: Add `NoteMetadata` and `NoteTask` to `src/infrastructure/host/types.ts`**

Append to the file (after existing types):

```ts
export interface NoteTask {
  readonly completed: boolean;
}

export interface NoteMetadata {
  readonly title: string;
  readonly tags: ReadonlyArray<string>;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly tasks: ReadonlyArray<NoteTask>;
}
```

- [ ] **Step 2: Extend the fake `metadataCache` with `getFileCache`**

In `src/infrastructure/host/internal/testing.ts`, locate `metadataCacheApi` (around line 215) and add a `getFileCache` method alongside `getCache`:

```ts
const metadataCacheApi = {
  on: (event: string, callback: AnyHandler): EventRef => metadata.on(event, callback),
  offref: (ref: EventRef): void => metadata.detach(ref),
  getCache(path: string): CachedMetadata | null {
    return files.get(path)?.metadata ?? null;
  },
  getFileCache(file: TFile): CachedMetadata | null {
    return files.get(file.path)?.metadata ?? null;
  },
};
```

- [ ] **Step 3: Write failing test — `src/infrastructure/host/internal/note-metadata-service.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { createInjector } from "@/infrastructure/di";

import { setupHostTestingHarness } from "./testing";
import { NoteMetadataService } from "./note-metadata-service";

import type { VaultPath } from "../types";

describe("NoteMetadataService", () => {
  describe("get", () => {
    it("returns None when the path does not exist", () => {
      const { injector } = setupHostTestingHarness();
      const service = injector.resolve(NoteMetadataService);

      const result = service.get("nope.md" as VaultPath);

      expect(result.isNone()).toBe(true);
    });

    it("extracts title from file basename", async () => {
      const { injector, fakeNotes } = setupHostTestingHarness();
      const service = injector.resolve(NoteMetadataService);
      await fakeNotes.create("folder/hello.md" as VaultPath, "");

      const result = service.get("folder/hello.md" as VaultPath);

      expect(result.unwrap().title).toBe("hello");
    });

    it("returns inline tags with leading hash", async () => {
      const { injector, seedMetadata } = setupHostTestingHarness();
      const service = injector.resolve(NoteMetadataService);
      await seedMetadata("a.md" as VaultPath, { tags: [{ tag: "#daily", position: anyPos() }] });

      expect(service.get("a.md" as VaultPath).unwrap().tags).toEqual(["#daily"]);
    });

    it("returns frontmatter as properties", async () => {
      const { injector, seedMetadata } = setupHostTestingHarness();
      const service = injector.resolve(NoteMetadataService);
      await seedMetadata("a.md" as VaultPath, { frontmatter: { mood: 5, label: "ok" } });

      expect(service.get("a.md" as VaultPath).unwrap().properties).toEqual({ mood: 5, label: "ok" });
    });

    it("derives completed=false for open tasks", async () => {
      const { injector, seedMetadata } = setupHostTestingHarness();
      const service = injector.resolve(NoteMetadataService);
      await seedMetadata("a.md" as VaultPath, {
        listItems: [{ task: " ", position: anyPos() }],
      });

      expect(service.get("a.md" as VaultPath).unwrap().tasks).toEqual([{ completed: false }]);
    });

    it("derives completed=true for any non-blank task marker", async () => {
      const { injector, seedMetadata } = setupHostTestingHarness();
      const service = injector.resolve(NoteMetadataService);
      await seedMetadata("a.md" as VaultPath, {
        listItems: [
          { task: "x", position: anyPos() },
          { task: "/", position: anyPos() },
        ],
      });

      const tasks = service.get("a.md" as VaultPath).unwrap().tasks;
      expect(tasks).toEqual([{ completed: true }, { completed: true }]);
    });

    it("ignores list items without a task marker", async () => {
      const { injector, seedMetadata } = setupHostTestingHarness();
      const service = injector.resolve(NoteMetadataService);
      await seedMetadata("a.md" as VaultPath, {
        listItems: [{ position: anyPos() }],
      });

      expect(service.get("a.md" as VaultPath).unwrap().tasks).toEqual([]);
    });
  });
});

function anyPos() {
  return { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } };
}
```

If `setupHostTestingHarness` and `seedMetadata` helpers aren't yet exposed in the existing testing harness in the exact form above, add a `seedMetadata(path, partial)` helper in `src/infrastructure/host/internal/testing.ts` that creates the file if needed and writes `partial` into the fake's metadata storage. Mirror the existing harness style.

Run: `npx vitest run src/infrastructure/host/internal/note-metadata-service.test.ts`
Expected: FAIL — `NoteMetadataService` not found.

- [ ] **Step 4: Implement `NoteMetadataService` — `src/infrastructure/host/internal/note-metadata-service.ts`**

```ts
import { TFile } from "obsidian";

import { inject } from "@/infrastructure/di";
import { None, Option, Some } from "@/infrastructure/result";

import { InternalObsidianAppToken } from "./tokens";

import type { NoteMetadata, VaultPath } from "../types";

export class NoteMetadataService {
  readonly #app = inject(InternalObsidianAppToken);

  get(path: VaultPath): Option<NoteMetadata> {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return new None<NoteMetadata>();
    const cache = this.#app.metadataCache.getFileCache(file);
    if (!cache) return new None<NoteMetadata>();
    return new Some<NoteMetadata>({
      title: file.basename,
      tags: cache.tags?.map((entry) => entry.tag) ?? [],
      properties: cache.frontmatter ?? {},
      tasks:
        cache.listItems?.filter((item) => item.task !== undefined).map((item) => ({ completed: item.task !== " " })) ??
        [],
    });
  }
}
```

Run: `npx vitest run src/infrastructure/host/internal/note-metadata-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Register `NoteMetadataService` in the host module**

Edit `src/infrastructure/host/module.ts`. Add the import and the binding (default lifetime — no `.eager()`):

```ts
import { NoteMetadataService } from "./internal/note-metadata-service";

// inside register(c):
c.register(NoteMetadataService).useClass(NoteMetadataService);
```

- [ ] **Step 6: Re-export from `infrastructure/host/index.ts`**

Add:

```ts
export { NoteMetadataService } from "./internal/note-metadata-service";
export type { NoteMetadata, NoteTask } from "./types";
```

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/host
git commit -m "feat(host): add NoteMetadataService"
```

---

## Task 2: `FakeNoteMetadataService` for downstream tests

**Files:**

- Modify: `src/infrastructure/host/testing.ts`

- [ ] **Step 1: Add `FakeNoteMetadataService` to the host testing barrel**

Append to `src/infrastructure/host/testing.ts`:

```ts
import type { NoteMetadata } from "./types";
import type { NoteMetadataService } from "./internal/note-metadata-service";

export class FakeNoteMetadataService implements Pick<NoteMetadataService, "get"> {
  readonly #entries = new Map<VaultPath, NoteMetadata>();

  setMetadata(path: VaultPath, metadata: NoteMetadata): void {
    this.#entries.set(path, metadata);
  }

  clear(): void {
    this.#entries.clear();
  }

  get(path: VaultPath): Option<NoteMetadata> {
    const hit = this.#entries.get(path);
    return hit ? new Some(hit) : new None<NoteMetadata>();
  }
}
```

(Use the existing `Option`/`Some`/`None` import at the top of the file; add if missing.)

- [ ] **Step 2: Commit**

```bash
git add src/infrastructure/host/testing.ts
git commit -m "test(host): add FakeNoteMetadataService"
```

---

## Task 3: Decoration leaf schemas (`color`, `borderSide`)

**Files:**

- Create: `src/decorations/config.ts`

- [ ] **Step 1: Create `src/decorations/config.ts` with the leaf schemas**

```ts
import * as v from "valibot";

export const colorSchema = v.union([
  v.object({ type: v.literal("transparent") }),
  v.object({ type: v.literal("theme"), name: v.string() }),
  v.object({ type: v.literal("custom"), color: v.string() }),
]);
export type ColorSettings = v.InferOutput<typeof colorSchema>;

export const borderSideSchema = v.object({
  show: v.boolean(),
  width: v.pipe(v.number(), v.minValue(0)),
  color: colorSchema,
  style: v.string(),
});
export type BorderSide = v.InferOutput<typeof borderSideSchema>;
```

- [ ] **Step 2: Commit (postpone — combine with subsequent schema tasks)**

This file will grow in Tasks 4 and 5. Commit at the end of Task 5.

---

## Task 4: Decoration style discriminated union

**Files:**

- Modify: `src/decorations/config.ts`

- [ ] **Step 1: Append the style schemas to `src/decorations/config.ts`**

```ts
const backgroundStyle = v.object({ type: v.literal("background"), color: colorSchema });
const colorStyle = v.object({ type: v.literal("color"), color: colorSchema });

const borderStyle = v.object({
  type: v.literal("border"),
  border: v.union([v.literal("uniform"), v.literal("different")]),
  left: borderSideSchema,
  right: borderSideSchema,
  top: borderSideSchema,
  bottom: borderSideSchema,
});

const placementX = v.union([v.literal("left"), v.literal("center"), v.literal("right")]);
const placementY = v.union([v.literal("top"), v.literal("middle"), v.literal("bottom")]);

const shapeStyle = v.object({
  type: v.literal("shape"),
  size: v.pipe(v.number(), v.minValue(0)),
  shape: v.union([
    v.literal("square"),
    v.literal("circle"),
    v.literal("triangle-up"),
    v.literal("triangle-down"),
    v.literal("triangle-left"),
    v.literal("triangle-right"),
  ]),
  color: colorSchema,
  placement_x: placementX,
  placement_y: placementY,
});

const cornerStyle = v.object({
  type: v.literal("corner"),
  placement: v.union([
    v.literal("top-left"),
    v.literal("top-right"),
    v.literal("bottom-left"),
    v.literal("bottom-right"),
  ]),
  color: colorSchema,
});

const iconStyle = v.object({
  type: v.literal("icon"),
  icon: v.string(),
  placement_x: placementX,
  placement_y: placementY,
  color: colorSchema,
  size: v.pipe(v.number(), v.minValue(0)),
});

export const decorationStyleSchema = v.union([
  backgroundStyle,
  colorStyle,
  borderStyle,
  shapeStyle,
  cornerStyle,
  iconStyle,
]);
export type JournalDecorationStyle = v.InferOutput<typeof decorationStyleSchema>;

export type JournalDecorationBackground = v.InferOutput<typeof backgroundStyle>;
export type JournalDecorationColor = v.InferOutput<typeof colorStyle>;
export type JournalDecorationBorder = v.InferOutput<typeof borderStyle>;
export type JournalDecorationShape = v.InferOutput<typeof shapeStyle>;
export type JournalDecorationCorner = v.InferOutput<typeof cornerStyle>;
export type JournalDecorationIcon = v.InferOutput<typeof iconStyle>;
```

Per-arm type exports support template authoring in `CellDecoration.vue` and its subcomponents.

---

## Task 5: Decoration condition discriminated union (with typed `property`)

**Files:**

- Modify: `src/decorations/config.ts`

- [ ] **Step 1: Append condition schemas to `src/decorations/config.ts`**

```ts
const stringOps = v.union([v.literal("contains"), v.literal("starts-with"), v.literal("ends-with")]);

const titleCondition = v.object({
  type: v.literal("title"),
  condition: stringOps,
  value: v.string(),
});

const tagCondition = v.object({
  type: v.literal("tag"),
  condition: stringOps,
  value: v.string(),
});

const stringPropertyCondition = v.object({
  type: v.literal("property"),
  name: v.pipe(v.string(), v.minLength(1)),
  valueType: v.literal("text"),
  condition: v.union([
    v.literal("exists"),
    v.literal("does-not-exist"),
    v.literal("eq"),
    v.literal("neq"),
    v.literal("contains"),
    v.literal("does-not-contain"),
    v.literal("starts-with"),
    v.literal("ends-with"),
  ]),
  value: v.string(),
});

const numberPropertyCondition = v.object({
  type: v.literal("property"),
  name: v.pipe(v.string(), v.minLength(1)),
  valueType: v.literal("number"),
  condition: v.union([
    v.literal("exists"),
    v.literal("does-not-exist"),
    v.literal("eq"),
    v.literal("neq"),
    v.literal("lt"),
    v.literal("lte"),
    v.literal("gt"),
    v.literal("gte"),
  ]),
  value: v.number(),
});

const booleanPropertyCondition = v.object({
  type: v.literal("property"),
  name: v.pipe(v.string(), v.minLength(1)),
  valueType: v.literal("checkbox"),
  condition: v.union([v.literal("exists"), v.literal("does-not-exist"), v.literal("is-true"), v.literal("is-false")]),
});

const propertyCondition = v.union([stringPropertyCondition, numberPropertyCondition, booleanPropertyCondition]);

const dateCondition = v.object({
  type: v.literal("date"),
  day: v.number(),
  month: v.number(),
  year: v.nullable(v.number()),
});

const weekdayCondition = v.object({
  type: v.literal("weekday"),
  weekdays: v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))),
});

const offsetCondition = v.object({
  type: v.literal("offset"),
  offset: v.pipe(v.number(), v.integer()),
});

const hasNoteCondition = v.object({ type: v.literal("has-note") });
const hasOpenTaskCondition = v.object({ type: v.literal("has-open-task") });
const allTasksCompletedCondition = v.object({ type: v.literal("all-tasks-completed") });

export const decorationConditionSchema = v.union([
  titleCondition,
  tagCondition,
  propertyCondition,
  dateCondition,
  weekdayCondition,
  offsetCondition,
  hasNoteCondition,
  hasOpenTaskCondition,
  allTasksCompletedCondition,
]);
export type JournalDecorationCondition = v.InferOutput<typeof decorationConditionSchema>;

export type JournalDecorationTitleCondition = v.InferOutput<typeof titleCondition>;
export type JournalDecorationTagCondition = v.InferOutput<typeof tagCondition>;
export type JournalDecorationStringPropertyCondition = v.InferOutput<typeof stringPropertyCondition>;
export type JournalDecorationNumberPropertyCondition = v.InferOutput<typeof numberPropertyCondition>;
export type JournalDecorationBooleanPropertyCondition = v.InferOutput<typeof booleanPropertyCondition>;
export type JournalDecorationPropertyCondition = v.InferOutput<typeof propertyCondition>;
export type JournalDecorationDateCondition = v.InferOutput<typeof dateCondition>;
export type JournalDecorationWeekdayCondition = v.InferOutput<typeof weekdayCondition>;
export type JournalDecorationOffsetCondition = v.InferOutput<typeof offsetCondition>;
```

---

## Task 6: Top-level `decorationSchema` and `journalConfigSchema` integration

**Files:**

- Modify: `src/decorations/config.ts`
- Modify: `src/journals/config.ts`

- [ ] **Step 1: Append the top-level schema and type to `src/decorations/config.ts`**

```ts
export const decorationSchema = v.object({
  mode: v.union([v.literal("and"), v.literal("or")]),
  conditions: v.array(decorationConditionSchema),
  styles: v.array(decorationStyleSchema),
});
export type JournalDecoration = v.InferOutput<typeof decorationSchema>;
```

- [ ] **Step 2: Wire decorations into `journalConfigSchema`**

In `src/journals/config.ts`, add the import and field:

```ts
import { decorationSchema } from "@/decorations/config";

// inside journalConfigSchema's v.object({...}):
  decorations: v.optional(v.array(decorationSchema), []),
```

Verify type inference still types the field as `JournalDecoration[]` on `JournalConfig`.

- [ ] **Step 3: Verify types**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit Tasks 3-6 together**

```bash
git add src/decorations/config.ts src/journals/config.ts
git commit -m "feat(decorations): add valibot schemas and integrate into JournalConfig"
```

---

## Task 7: `defaults.ts` factory functions

**Files:**

- Create: `src/decorations/defaults.ts`

- [ ] **Step 1: Write `src/decorations/defaults.ts`**

```ts
import type { AnchorString } from "@/calendar";

import type {
  BorderSide,
  ColorSettings,
  JournalDecoration,
  JournalDecorationCondition,
  JournalDecorationStyle,
} from "./config";

const transparentColor: ColorSettings = { type: "transparent" };
const defaultBorderSide: BorderSide = {
  show: false,
  width: 1,
  color: transparentColor,
  style: "solid",
};

export function defaultDecoration(): JournalDecoration {
  return { mode: "and", conditions: [], styles: [] };
}

export function defaultStyle(type: JournalDecorationStyle["type"]): JournalDecorationStyle {
  switch (type) {
    case "background":
      return { type: "background", color: transparentColor };
    case "color":
      return { type: "color", color: transparentColor };
    case "border":
      return {
        type: "border",
        border: "uniform",
        left: { ...defaultBorderSide },
        right: { ...defaultBorderSide },
        top: { ...defaultBorderSide },
        bottom: { ...defaultBorderSide },
      };
    case "shape":
      return {
        type: "shape",
        size: 0.4,
        shape: "square",
        color: transparentColor,
        placement_x: "center",
        placement_y: "middle",
      };
    case "corner":
      return { type: "corner", placement: "top-left", color: transparentColor };
    case "icon":
      return {
        type: "icon",
        icon: "",
        placement_x: "center",
        placement_y: "middle",
        color: transparentColor,
        size: 0.5,
      };
  }
}

export function defaultCondition(type: JournalDecorationCondition["type"]): JournalDecorationCondition {
  switch (type) {
    case "title":
      return { type: "title", condition: "contains", value: "" };
    case "tag":
      return { type: "tag", condition: "contains", value: "" };
    case "property":
      return { type: "property", name: "", valueType: "text", condition: "exists", value: "" };
    case "date":
      return { type: "date", day: -1, month: -1, year: null };
    case "weekday":
      return { type: "weekday", weekdays: [] };
    case "offset":
      return { type: "offset", offset: 0 };
    case "has-note":
      return { type: "has-note" };
    case "has-open-task":
      return { type: "has-open-task" };
    case "all-tasks-completed":
      return { type: "all-tasks-completed" };
  }
  // satisfies-exhaustiveness via never:
  const _exhaustive: never = type;
  return _exhaustive;
}

// Unused, but used to silence the no-anchor reference; remove once UI consumes defaults.
export const _unusedAnchorPin: AnchorString | undefined = undefined;
```

Strip the `_unusedAnchorPin` line if `AnchorString` is unused. The exhaustiveness pattern is `switch` here (one shot defaults), not `match` — defaults are setup data, not domain dispatch.

- [ ] **Step 2: Commit**

```bash
git add src/decorations/defaults.ts
git commit -m "feat(decorations): add default factories for decorations/conditions/styles"
```

---

## Task 8: `decorations/testing.ts` builders

**Files:**

- Create: `src/decorations/testing.ts`

- [ ] **Step 1: Write `src/decorations/testing.ts`**

```ts
import type { JournalDecoration, JournalDecorationCondition, JournalDecorationStyle } from "./config";

import { defaultCondition, defaultDecoration, defaultStyle } from "./defaults";

export function buildDecoration(overrides: Partial<JournalDecoration> = {}): JournalDecoration {
  return { ...defaultDecoration(), ...overrides };
}

export function buildCondition<T extends JournalDecorationCondition["type"]>(
  type: T,
  overrides: Partial<Extract<JournalDecorationCondition, { type: T }>> = {},
): Extract<JournalDecorationCondition, { type: T }> {
  return { ...(defaultCondition(type) as Extract<JournalDecorationCondition, { type: T }>), ...overrides };
}

export function buildStyle<T extends JournalDecorationStyle["type"]>(
  type: T,
  overrides: Partial<Extract<JournalDecorationStyle, { type: T }>> = {},
): Extract<JournalDecorationStyle, { type: T }> {
  return { ...(defaultStyle(type) as Extract<JournalDecorationStyle, { type: T }>), ...overrides };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/decorations/testing.ts
git commit -m "test(decorations): add builders for decorations/conditions/styles"
```

---

## Task 9: `engine-checks.ts` — title, tag, property predicates

**Files:**

- Create: `src/decorations/engine-checks.ts`
- Test: `src/decorations/engine-checks.test.ts`

- [ ] **Step 1: Write failing tests for title/tag in `src/decorations/engine-checks.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import type { NoteMetadata } from "@/infrastructure/host";

import { buildCondition } from "./testing";
import { checkProperty, checkTag, checkTitle } from "./engine-checks";

function meta(partial: Partial<NoteMetadata>): NoteMetadata {
  return {
    title: "",
    tags: [],
    properties: {},
    tasks: [],
    ...partial,
  };
}

describe("checkTitle", () => {
  it("is false when metadata is None", () => {
    const condition = buildCondition("title", { condition: "contains", value: "foo" });
    expect(checkTitle(condition, null)).toBe(false);
  });

  it("matches contains case-insensitively", () => {
    const condition = buildCondition("title", { condition: "contains", value: "FOO" });
    expect(checkTitle(condition, meta({ title: "my-foo-note" }))).toBe(true);
  });

  it("matches starts-with case-insensitively", () => {
    const condition = buildCondition("title", { condition: "starts-with", value: "Hello" });
    expect(checkTitle(condition, meta({ title: "hello world" }))).toBe(true);
  });

  it("matches ends-with case-insensitively", () => {
    const condition = buildCondition("title", { condition: "ends-with", value: "BAR" });
    expect(checkTitle(condition, meta({ title: "fooBAR" }))).toBe(true);
  });
});

describe("checkTag", () => {
  it("is false when metadata is None", () => {
    const condition = buildCondition("tag", { condition: "contains", value: "x" });
    expect(checkTag(condition, null)).toBe(false);
  });

  it("matches any tag that contains the value", () => {
    const condition = buildCondition("tag", { condition: "contains", value: "work" });
    expect(checkTag(condition, meta({ tags: ["#personal", "#workout"] }))).toBe(true);
  });

  it("is false when no tag matches", () => {
    const condition = buildCondition("tag", { condition: "starts-with", value: "#x" });
    expect(checkTag(condition, meta({ tags: ["#yoga"] }))).toBe(false);
  });
});

describe("checkProperty", () => {
  describe("text", () => {
    it("matches exists when the property is present", () => {
      const condition = buildCondition("property", { name: "mood", valueType: "text", condition: "exists", value: "" });
      expect(checkProperty(condition, meta({ properties: { mood: "ok" } }))).toBe(true);
    });

    it("matches does-not-exist when the property is missing", () => {
      const condition = buildCondition("property", {
        name: "mood",
        valueType: "text",
        condition: "does-not-exist",
        value: "",
      });
      expect(checkProperty(condition, meta({ properties: {} }))).toBe(true);
    });

    it("matches eq case-insensitively for strings", () => {
      const condition = buildCondition("property", { name: "label", valueType: "text", condition: "eq", value: "Ok" });
      expect(checkProperty(condition, meta({ properties: { label: "OK" } }))).toBe(false);
      // v2 semantics: text eq is case-insensitive substring? Confirm v2 — implement strict-eq case-sensitive in v3 to match v2 `properties[name] == condition.value`.
    });

    it("matches contains over array property", () => {
      const condition = buildCondition("property", {
        name: "tags",
        valueType: "text",
        condition: "contains",
        value: "Yoga",
      });
      expect(checkProperty(condition, meta({ properties: { tags: ["yoga-class", "running"] } }))).toBe(true);
    });

    it("returns false when valueType is text but property is a number", () => {
      const condition = buildCondition("property", { name: "x", valueType: "text", condition: "eq", value: "5" });
      expect(checkProperty(condition, meta({ properties: { x: 5 } }))).toBe(false);
    });
  });

  describe("number", () => {
    it("matches eq", () => {
      const condition = buildCondition("property", { name: "x", valueType: "number", condition: "eq", value: 5 });
      expect(checkProperty(condition, meta({ properties: { x: 5 } }))).toBe(true);
    });

    it("matches gt", () => {
      const condition = buildCondition("property", { name: "x", valueType: "number", condition: "gt", value: 5 });
      expect(checkProperty(condition, meta({ properties: { x: 6 } }))).toBe(true);
      expect(checkProperty(condition, meta({ properties: { x: 5 } }))).toBe(false);
    });

    it("returns false when valueType is number but property is a string", () => {
      const condition = buildCondition("property", { name: "x", valueType: "number", condition: "eq", value: 5 });
      expect(checkProperty(condition, meta({ properties: { x: "5" } }))).toBe(false);
    });
  });

  describe("checkbox", () => {
    it("matches is-true when value is exactly true", () => {
      const condition = buildCondition("property", { name: "done", valueType: "checkbox", condition: "is-true" });
      expect(checkProperty(condition, meta({ properties: { done: true } }))).toBe(true);
      expect(checkProperty(condition, meta({ properties: { done: false } }))).toBe(false);
    });

    it("matches is-false when value is exactly false", () => {
      const condition = buildCondition("property", { name: "done", valueType: "checkbox", condition: "is-false" });
      expect(checkProperty(condition, meta({ properties: { done: false } }))).toBe(true);
    });
  });
});
```

Note: the `text/eq case-insensitivity` test pins the v3 semantic. **v2 parity rule:** v2 uses loose `==`, which is case-sensitive for strings — we should match v2 exactly. So the test asserts `false` for `"Ok"` vs `"OK"`. Adjust the test if v2 actually did case-insensitive `eq` (it did not — only `contains`/`starts-with`/`ends-with` lowercased both sides).

Run: `npx vitest run src/decorations/engine-checks.test.ts`
Expected: FAIL — `checkTitle`/`checkTag`/`checkProperty` not exported.

- [ ] **Step 2: Implement `src/decorations/engine-checks.ts` (partial — these three)**

```ts
import { match, P } from "ts-pattern";

import type { NoteMetadata } from "@/infrastructure/host";

import type {
  JournalDecorationPropertyCondition,
  JournalDecorationTagCondition,
  JournalDecorationTitleCondition,
} from "./config";

export function checkTitle(condition: JournalDecorationTitleCondition, metadata: NoteMetadata | null): boolean {
  if (!metadata) return false;
  const title = metadata.title.toLowerCase();
  const value = condition.value.toLowerCase();
  return match(condition.condition)
    .with("contains", () => title.includes(value))
    .with("starts-with", () => title.startsWith(value))
    .with("ends-with", () => title.endsWith(value))
    .exhaustive();
}

export function checkTag(condition: JournalDecorationTagCondition, metadata: NoteMetadata | null): boolean {
  if (!metadata) return false;
  const value = condition.value.toLowerCase();
  return match(condition.condition)
    .with("contains", () => metadata.tags.some((tag) => tag.toLowerCase().includes(value)))
    .with("starts-with", () => metadata.tags.some((tag) => tag.toLowerCase().startsWith(value)))
    .with("ends-with", () => metadata.tags.some((tag) => tag.toLowerCase().endsWith(value)))
    .exhaustive();
}

export function checkProperty(condition: JournalDecorationPropertyCondition, metadata: NoteMetadata | null): boolean {
  if (!metadata) return false;
  const present = condition.name in metadata.properties;
  if (condition.condition === "exists") return present;
  if (condition.condition === "does-not-exist") return !present;
  if (!present) return false;
  const raw = metadata.properties[condition.name];

  return match(condition)
    .with({ valueType: "text" }, (c) => checkTextProperty(c, raw))
    .with({ valueType: "number" }, (c) => checkNumberProperty(c, raw))
    .with({ valueType: "checkbox" }, (c) => checkBooleanProperty(c, raw))
    .exhaustive();
}

function checkTextProperty(
  c: Extract<JournalDecorationPropertyCondition, { valueType: "text" }>,
  raw: unknown,
): boolean {
  const matchOne = (value: string) =>
    match(c.condition)
      .with("eq", () => value === c.value)
      .with("neq", () => value !== c.value)
      .with("contains", () => value.toLowerCase().includes(c.value.toLowerCase()))
      .with("does-not-contain", () => !value.toLowerCase().includes(c.value.toLowerCase()))
      .with("starts-with", () => value.toLowerCase().startsWith(c.value.toLowerCase()))
      .with("ends-with", () => value.toLowerCase().endsWith(c.value.toLowerCase()))
      .with(P.union("exists", "does-not-exist"), () => false /* handled above */)
      .exhaustive();
  if (typeof raw === "string") return matchOne(raw);
  if (Array.isArray(raw)) return raw.some((item) => typeof item === "string" && matchOne(item));
  return false;
}

function checkNumberProperty(
  c: Extract<JournalDecorationPropertyCondition, { valueType: "number" }>,
  raw: unknown,
): boolean {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
  return match(c.condition)
    .with("eq", () => raw === c.value)
    .with("neq", () => raw !== c.value)
    .with("lt", () => raw < c.value)
    .with("lte", () => raw <= c.value)
    .with("gt", () => raw > c.value)
    .with("gte", () => raw >= c.value)
    .with(P.union("exists", "does-not-exist"), () => false)
    .exhaustive();
}

function checkBooleanProperty(
  c: Extract<JournalDecorationPropertyCondition, { valueType: "checkbox" }>,
  raw: unknown,
): boolean {
  if (typeof raw !== "boolean") return false;
  return match(c.condition)
    .with("is-true", () => raw === true)
    .with("is-false", () => raw === false)
    .with(P.union("exists", "does-not-exist"), () => false)
    .exhaustive();
}
```

Run: `npx vitest run src/decorations/engine-checks.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/decorations/engine-checks.ts src/decorations/engine-checks.test.ts
git commit -m "feat(decorations): add title/tag/property condition predicates"
```

---

## Task 10: `engine-checks.ts` — date, weekday, offset, marker predicates

**Files:**

- Modify: `src/decorations/engine-checks.ts`
- Modify: `src/decorations/engine-checks.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
// add at top of file:
import type { JournalConfig } from "@/journals/config";

import { CalendarDate, DayPeriod, MonthPeriod, WeekPeriod, YearPeriod } from "@/calendar";

import { allTasksCompleted, checkDate, checkOffset, checkWeekday, hasOpenTask } from "./engine-checks";

describe("checkDate", () => {
  it("matches when day, month, year all equal the period's anchor", () => {
    const period = DayPeriod.of(CalendarDate.parse("2026-05-25").unwrap());
    const condition = buildCondition("date", { day: 25, month: 4, year: 2026 }); // moment months are 0-indexed
    expect(checkDate(condition, period)).toBe(true);
  });

  it("treats day === -1 as a wildcard", () => {
    const period = DayPeriod.of(CalendarDate.parse("2026-05-25").unwrap());
    const condition = buildCondition("date", { day: -1, month: 4, year: 2026 });
    expect(checkDate(condition, period)).toBe(true);
  });

  it("treats year === null as any year", () => {
    const period = DayPeriod.of(CalendarDate.parse("2026-05-25").unwrap());
    const condition = buildCondition("date", { day: 25, month: 4, year: null });
    expect(checkDate(condition, period)).toBe(true);
  });

  it("is false when the day mismatches a non-wildcard value", () => {
    const period = DayPeriod.of(CalendarDate.parse("2026-05-25").unwrap());
    const condition = buildCondition("date", { day: 26, month: 4, year: null });
    expect(checkDate(condition, period)).toBe(false);
  });
});

describe("checkWeekday", () => {
  it("matches when the anchor's weekday is in the list", () => {
    // 2026-05-25 is a Monday → moment.day() === 1
    const period = DayPeriod.of(CalendarDate.parse("2026-05-25").unwrap());
    const condition = buildCondition("weekday", { weekdays: [1, 3] });
    expect(checkWeekday(condition, period)).toBe(true);
  });

  it("is false on empty weekday list", () => {
    const period = DayPeriod.of(CalendarDate.parse("2026-05-25").unwrap());
    const condition = buildCondition("weekday", { weekdays: [] });
    expect(checkWeekday(condition, period)).toBe(false);
  });
});

describe("checkOffset", () => {
  it("delegates to the cycle-offsets pair (positive)", () => {
    const condition = buildCondition("offset", { offset: 3 });
    const period = DayPeriod.of(CalendarDate.parse("2026-05-25").unwrap());
    const journal = {} as JournalConfig;
    const cycle = { offsets: () => ({ isNone: () => false, value: [3, -1] }) } as any;
    expect(checkOffset(condition, period, journal, cycle)).toBe(true);
  });

  it("returns false when cycle.offsets is None (v2 parity: pair defaults to [0,0])", () => {
    const condition = buildCondition("offset", { offset: 3 });
    const period = DayPeriod.of(CalendarDate.parse("2026-05-25").unwrap());
    const cycle = { offsets: () => ({ isNone: () => true }) } as any;
    expect(checkOffset(condition, period, {} as JournalConfig, cycle)).toBe(false);
  });
});

describe("hasOpenTask", () => {
  it("is true when at least one task is open", () => {
    expect(hasOpenTask(meta({ tasks: [{ completed: true }, { completed: false }] }))).toBe(true);
  });

  it("is false when all tasks are completed", () => {
    expect(hasOpenTask(meta({ tasks: [{ completed: true }] }))).toBe(false);
  });

  it("is false on empty task list (v2 parity)", () => {
    expect(hasOpenTask(meta({ tasks: [] }))).toBe(false);
  });
});

describe("allTasksCompleted", () => {
  it("is true when every task is completed", () => {
    expect(allTasksCompleted(meta({ tasks: [{ completed: true }, { completed: true }] }))).toBe(true);
  });

  it("is false when any task is open", () => {
    expect(allTasksCompleted(meta({ tasks: [{ completed: true }, { completed: false }] }))).toBe(false);
  });

  it("is false on empty task list (v2 parity)", () => {
    expect(allTasksCompleted(meta({ tasks: [] }))).toBe(false);
  });
});
```

(`CalendarDate.parse` returns `Result<CalendarDate>`; `.unwrap()` is the standard test escape hatch — confirm presence in `@/infrastructure/result` or use the existing pattern from other tests in the repo.)

Run: `npx vitest run src/decorations/engine-checks.test.ts`
Expected: FAIL — `checkDate`/`checkWeekday`/`checkOffset`/`hasOpenTask`/`allTasksCompleted` not exported.

- [ ] **Step 2: Implement the predicates in `src/decorations/engine-checks.ts`**

```ts
// (append to engine-checks.ts)
import type { JournalConfig } from "@/journals/config";
import type { Period } from "@/calendar";
import type { CycleService } from "@/journals";
import type {
  JournalDecorationDateCondition,
  JournalDecorationOffsetCondition,
  JournalDecorationWeekdayCondition,
} from "./config";

export function checkDate(condition: JournalDecorationDateCondition, period: Period): boolean {
  const anchor = period.anchor;
  // CalendarDate.format("M") returns 1-12; condition.month uses moment's 0-indexed value (v2 parity).
  const dayOk = condition.day === -1 || Number(anchor.format("D")) === condition.day;
  const monthOk = condition.month === -1 || Number(anchor.format("M")) - 1 === condition.month;
  const yearOk = condition.year === null || Number(anchor.format("YYYY")) === condition.year;
  return dayOk && monthOk && yearOk;
}

export function checkWeekday(condition: JournalDecorationWeekdayCondition, period: Period): boolean {
  if (condition.weekdays.length === 0) return false;
  // moment's day() returns 0 (Sun) through 6 (Sat)
  const weekday = Number(period.anchor.format("d"));
  return condition.weekdays.includes(weekday);
}

export function checkOffset(
  condition: JournalDecorationOffsetCondition,
  period: Period,
  journal: JournalConfig,
  cycle: Pick<CycleService, "offsets">,
): boolean {
  const result = cycle.offsets(journal.name, period.anchor);
  const [positive, negative] = result.isNone() ? ([0, 0] as const) : result.value;
  if (condition.offset < 0) return negative === condition.offset;
  return positive === condition.offset;
}

export function hasOpenTask(metadata: NoteMetadata): boolean {
  if (metadata.tasks.length === 0) return false;
  return metadata.tasks.some((task) => !task.completed);
}

export function allTasksCompleted(metadata: NoteMetadata): boolean {
  if (metadata.tasks.length === 0) return false;
  return metadata.tasks.every((task) => task.completed);
}
```

Verify that `CalendarDate.format("M")` / `format("D")` / `format("d")` produce the expected numeric strings on the repo's existing CalendarDate implementation. If the API differs, adapt to use existing day-of-week / day-of-month accessors. Look at `src/calendar/calendar-date.ts` for the canonical accessor pattern.

Run: `npx vitest run src/decorations/engine-checks.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/decorations/engine-checks.ts src/decorations/engine-checks.test.ts
git commit -m "feat(decorations): add date/weekday/offset/task condition predicates"
```

---

## Task 11: `DecorationEngine.evaluateRange` + `evaluateAnchor`

**Files:**

- Create: `src/decorations/engine.ts`
- Test: `src/decorations/engine.test.ts`

- [ ] **Step 1: Write the failing test — `src/decorations/engine.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { CalendarDate, DayPeriod, MonthPeriod, WeekPeriod } from "@/calendar";
import { createInjector } from "@/infrastructure/di";
import { FakeNoteMetadataService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService as Fake } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";

import { decorationsModule } from "./module";
import { DecorationEngine } from "./engine";
import { buildDecoration, buildCondition, buildStyle } from "./testing";

import { Container } from "@/infrastructure/di";
import { CycleService } from "@/journals/cycle";
import { JournalsIndex } from "@/journals/journals-index";
import { JournalsRepository } from "@/journals/repository";
import { fakeRepo, fixedJournal, unwrap } from "@/journals/testing";
import { expectOk } from "@/infrastructure/result/testing";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { NoteMetadataService } from "@/infrastructure/host";

function buildEngineContainer(journals: Parameters<typeof fakeRepo>[0] = {}): {
  c: Container;
  metadata: FakeNoteMetadataService;
} {
  const c = new Container();
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  const metadata = new FakeNoteMetadataService();
  c.register(NoteMetadataService).useValue(metadata as unknown as NoteMetadataService);
  c.register(DecorationEngine).useClass(DecorationEngine);
  return { c, metadata };
}

function date(anchor: string) {
  const result = CalendarDate.parse(anchor);
  expectOk(result);
  return result.value;
}

describe("DecorationEngine", () => {
  describe("evaluateRange", () => {
    it("returns an empty map for empty inputs", () => {
      const { c } = buildEngineContainer();
      const engine = c.resolve(DecorationEngine);
      expect(engine.evaluateRange([], [])).toEqual(new Map());
    });

    it("returns no entries when has-note condition is unmet (no journal entry seeded)", () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("background")],
      });
      const { c } = buildEngineContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      const period = DayPeriod.of(date("2026-05-25"));
      const result = engine.evaluateRange([period], [{ journalName: "daily", decoration }]);

      expect(result.size).toBe(0);
    });

    it("returns no entries when period kind mismatches journal write-type", () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { c } = buildEngineContainer({
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      const dayPeriod = DayPeriod.of(date("2026-05-25"));
      const result = engine.evaluateRange([dayPeriod], [{ journalName: "weekly", decoration }]);

      expect(result.size).toBe(0);
    });

    it("returns no entries when conditions list is empty (v2 parity)", () => {
      const decoration = buildDecoration({ styles: [buildStyle("background")] });
      const { c } = buildEngineContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      const period = DayPeriod.of(date("2026-05-25"));
      const result = engine.evaluateRange([period], [{ journalName: "daily", decoration }]);

      expect(result.size).toBe(0);
    });
  });

  describe("evaluateAnchor", () => {
    it("returns the style list for a single period when weekday condition matches", () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })], // Monday
        styles: [buildStyle("background"), buildStyle("color")],
      });
      const { c } = buildEngineContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      // 2026-05-25 is a Monday
      const period = DayPeriod.of(date("2026-05-25"));
      const styles = engine.evaluateAnchor(period, [{ journalName: "daily", decoration }]);

      expect(styles.map((s) => s.type)).toEqual(["background", "color"]);
    });
  });
});
```

The `buildEngineContainer` helper above mirrors the pattern in `src/journals/cycle.test.ts`: instantiate a fresh `Container`, register each dependency with `useValue(fakeRepo(...))` / `useClass(...)`, then `c.resolve(DecorationEngine)`. No module-level wiring needed for unit tests; the engine class is registered directly.

Run: `npx vitest run src/decorations/engine.test.ts`
Expected: FAIL — `DecorationEngine`, `decorationsModule` not exported.

- [ ] **Step 2: Implement `src/decorations/engine.ts`**

```ts
import { match } from "ts-pattern";

import type { AnchorString, Period, PeriodKind } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService } from "@/infrastructure/host";
import type { NoteMetadata } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";
import type { JournalConfig, JournalWrite } from "@/journals/config";

import type { JournalDecoration, JournalDecorationCondition, JournalDecorationStyle } from "./config";
import {
  allTasksCompleted,
  checkDate,
  checkOffset,
  checkProperty,
  checkTag,
  checkTitle,
  checkWeekday,
  hasOpenTask,
} from "./engine-checks";

export function periodMatchesWrite(kind: PeriodKind, writeType: JournalWrite["type"]): boolean {
  return match([kind, writeType] as const)
    .with(["day", "day"], ["day", "custom"], () => true)
    .with(["week", "week"], () => true)
    .with(["month", "month"], () => true)
    .with(["quarter", "quarter"], () => true)
    .with(["year", "year"], () => true)
    .otherwise(() => false);
}

export class DecorationEngine {
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #metadata = inject(NoteMetadataService);
  readonly #cycle = inject(CycleService);

  evaluateRange(
    periods: ReadonlyArray<Period>,
    decorations: ReadonlyArray<{ journalName: string; decoration: JournalDecoration }>,
  ): Map<AnchorString, JournalDecorationStyle[]> {
    const result = new Map<AnchorString, JournalDecorationStyle[]>();
    if (periods.length === 0 || decorations.length === 0) return result;

    const configs = new Map<string, JournalConfig>();
    for (const { journalName } of decorations) {
      if (configs.has(journalName)) continue;
      const opt = this.#journals.get(journalName);
      if (opt.isSome()) configs.set(journalName, opt.value);
    }

    const metaCache = new Map<string, Option<NoteMetadata>>();
    const metadataFor = (journalName: string, anchorString: AnchorString): Option<NoteMetadata> => {
      const key = `${journalName}::${anchorString}`;
      const hit = metaCache.get(key);
      if (hit !== undefined) return hit;
      const value = this.#index
        .entryByAnchor(journalName, anchorString)
        .flatMap((entry) => this.#metadata.get(entry.path));
      metaCache.set(key, value);
      return value;
    };

    for (const { journalName, decoration } of decorations) {
      const config = configs.get(journalName);
      if (!config) continue;
      for (const period of periods) {
        if (!periodMatchesWrite(period.kind, config.write.type)) continue;
        const anchorString = period.anchor.toAnchor();
        if (!this.#matches(decoration, period, config, () => metadataFor(journalName, anchorString))) continue;
        let bucket = result.get(anchorString);
        if (!bucket) {
          bucket = [];
          result.set(anchorString, bucket);
        }
        bucket.push(...decoration.styles);
      }
    }
    return result;
  }

  evaluateAnchor(
    period: Period,
    decorations: ReadonlyArray<{ journalName: string; decoration: JournalDecoration }>,
  ): JournalDecorationStyle[] {
    const map = this.evaluateRange([period], decorations);
    return map.get(period.anchor.toAnchor()) ?? [];
  }

  #matches(
    decoration: JournalDecoration,
    period: Period,
    journal: JournalConfig,
    metadata: () => Option<NoteMetadata>,
  ): boolean {
    const { mode, conditions } = decoration;
    if (conditions.length === 0) return false;
    const test = (c: JournalDecorationCondition) => this.#check(c, period, journal, metadata);
    return mode === "or" ? conditions.some(test) : conditions.every(test);
  }

  #check(
    condition: JournalDecorationCondition,
    period: Period,
    journal: JournalConfig,
    metadata: () => Option<NoteMetadata>,
  ): boolean {
    return match(condition)
      .with({ type: "title" }, (c) => checkTitle(c, metadata().toNullable()))
      .with({ type: "tag" }, (c) => checkTag(c, metadata().toNullable()))
      .with({ type: "property" }, (c) => checkProperty(c, metadata().toNullable()))
      .with({ type: "date" }, (c) => checkDate(c, period))
      .with({ type: "weekday" }, (c) => checkWeekday(c, period))
      .with({ type: "offset" }, (c) => checkOffset(c, period, journal, this.#cycle))
      .with({ type: "has-note" }, () => metadata().isSome())
      .with({ type: "has-open-task" }, () => metadata().match({ none: () => false, some: hasOpenTask }))
      .with({ type: "all-tasks-completed" }, () => metadata().match({ none: () => false, some: allTasksCompleted }))
      .exhaustive();
  }
}
```

`Option.toNullable()` is the standard `Option<T> -> T | null` shortcut in this repo. If the helper has a different name (e.g. `getOrNull`), use that.

Run: `npx vitest run src/decorations/engine.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/decorations/engine.ts src/decorations/engine.test.ts
git commit -m "feat(decorations): DecorationEngine.evaluateRange and evaluateAnchor"
```

---

## Task 12: `decorations/module.ts` + `decorations/index.ts` + main.ts wiring

**Files:**

- Create: `src/decorations/module.ts`
- Create: `src/decorations/index.ts`
- Create: `src/decorations/errors.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write `src/decorations/errors.ts`**

```ts
// Reserved for any future invariant errors; currently empty.
export {};
```

- [ ] **Step 2: Write `src/decorations/module.ts`**

```ts
import type { Module } from "@/infrastructure/di";

import { DecorationEngine } from "./engine";

export const decorationsModule: Module = {
  register(c) {
    c.register(DecorationEngine).useClass(DecorationEngine);
  },
};
```

- [ ] **Step 3: Write `src/decorations/index.ts`**

```ts
export {
  colorSchema,
  borderSideSchema,
  decorationSchema,
  decorationStyleSchema,
  decorationConditionSchema,
  type BorderSide,
  type ColorSettings,
  type JournalDecoration,
  type JournalDecorationBackground,
  type JournalDecorationBorder,
  type JournalDecorationColor,
  type JournalDecorationCondition,
  type JournalDecorationCorner,
  type JournalDecorationDateCondition,
  type JournalDecorationIcon,
  type JournalDecorationOffsetCondition,
  type JournalDecorationPropertyCondition,
  type JournalDecorationShape,
  type JournalDecorationStringPropertyCondition,
  type JournalDecorationNumberPropertyCondition,
  type JournalDecorationBooleanPropertyCondition,
  type JournalDecorationStyle,
  type JournalDecorationTagCondition,
  type JournalDecorationTitleCondition,
  type JournalDecorationWeekdayCondition,
} from "./config";
export { defaultCondition, defaultDecoration, defaultStyle } from "./defaults";
export { DecorationEngine, periodMatchesWrite } from "./engine";
export { decorationsModule } from "./module";
export { CellDecoration, CellDecorationMapKey, type CellStyleRef } from "./ui/CellDecoration.vue"; // re-exported below in Task 16
export { useCellDecorations } from "./use-cell-decorations"; // re-exported below in Task 17
```

(Final lines re-exporting `CellDecoration`, `CellDecorationMapKey`, `useCellDecorations` will be wired in once those files exist — Tasks 16 and 17. Leave them commented for now and uncomment as you go.)

- [ ] **Step 4: Wire `decorationsModule` in `src/main.ts`**

Add the import and the module registration alongside the other modules:

```ts
import { decorationsModule } from "@/decorations";

// inside the module list / container build:
decorationsModule.register(c);
```

Mirror the existing registration pattern (e.g. how `journalsModule` is wired).

- [ ] **Step 5: Verify**

Run: `npm run check:types && npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/decorations/module.ts src/decorations/index.ts src/decorations/errors.ts src/main.ts
git commit -m "feat(decorations): module wiring + public barrel"
```

---

## Task 13: `derive-styles.ts` pure derivations (with uniform-border fix)

**Files:**

- Create: `src/decorations/derive-styles.ts`
- Test: `src/decorations/derive-styles.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";

import { backgroundFrom, borderStylesFrom, cornersFrom, paddingFrom, placedFrom, textColorFrom } from "./derive-styles";
import { buildStyle } from "./testing";

describe("backgroundFrom", () => {
  it("returns 'inherit' when there is no background style", () => {
    expect(backgroundFrom([])).toBe("inherit");
  });

  it("returns the first background style's color (first-wins)", () => {
    const a = buildStyle("background", { color: { type: "custom", color: "#aaa" } });
    const b = buildStyle("background", { color: { type: "custom", color: "#bbb" } });
    expect(backgroundFrom([a, b])).toBe("#aaa");
  });
});

describe("textColorFrom", () => {
  it("returns 'inherit' when there is no color style", () => {
    expect(textColorFrom([])).toBe("inherit");
  });

  it("returns the first color style's color (first-wins)", () => {
    const a = buildStyle("color", { color: { type: "custom", color: "#a1a1a1" } });
    expect(textColorFrom([a])).toBe("#a1a1a1");
  });
});

describe("borderStylesFrom", () => {
  it("returns four 'none' sides when no border style is present", () => {
    expect(borderStylesFrom([])).toEqual({
      borderTop: "none",
      borderRight: "none",
      borderBottom: "none",
      borderLeft: "none",
    });
  });

  it("applies a uniform border to all four sides", () => {
    const border = buildStyle("border", {
      border: "uniform",
      left: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#000" } },
    });
    expect(borderStylesFrom([border])).toEqual({
      borderTop: "2px solid #000",
      borderRight: "2px solid #000",
      borderBottom: "2px solid #000",
      borderLeft: "2px solid #000",
    });
  });

  it("applies different-mode sides independently", () => {
    const border = buildStyle("border", {
      border: "different",
      left: { show: true, width: 1, style: "solid", color: { type: "custom", color: "#f00" } },
      right: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
      top: { show: true, width: 3, style: "dashed", color: { type: "custom", color: "#0f0" } },
      bottom: { show: false, width: 0, style: "solid", color: { type: "transparent" } },
    });
    const result = borderStylesFrom([border]);
    expect(result.borderLeft).toBe("1px solid #f00");
    expect(result.borderTop).toBe("3px dashed #0f0");
    expect(result.borderRight).toBe("none");
    expect(result.borderBottom).toBe("none");
  });
});

describe("paddingFrom", () => {
  it("uses left.width for all four sides when border is uniform (v2 bug fix)", () => {
    const border = buildStyle("border", {
      border: "uniform",
      left: { show: true, width: 4, style: "solid", color: { type: "custom", color: "#000" } },
      right: { show: true, width: 99, style: "solid", color: { type: "custom", color: "#000" } },
      top: { show: true, width: 99, style: "solid", color: { type: "custom", color: "#000" } },
      bottom: { show: true, width: 99, style: "solid", color: { type: "custom", color: "#000" } },
    });
    const padding = paddingFrom([border]);
    // All four padding sides see width=4 (left.width), regardless of the other recorded widths.
    expect(padding).toContain("max(0em, 6px)"); // 4 + 2 = 6, each side
    // and exactly four occurrences of that token
    expect(padding.split("max(0em, 6px)").length - 1).toBe(4);
  });

  it("includes shape size on the placement_y side", () => {
    const shape = buildStyle("shape", { size: 0.6, placement_y: "top", placement_x: "center" });
    const padding = paddingFrom([shape]);
    expect(padding).toMatch(/max\(0\.7em, 2px\)/); // top: 0.6 + 0.1em
  });
});

describe("placedFrom", () => {
  it("groups shapes/icons into a 9-cell record keyed by placement_x_placement_y", () => {
    const shape = buildStyle("shape", { placement_x: "left", placement_y: "top" });
    const icon = buildStyle("icon", { placement_x: "right", placement_y: "bottom" });
    const placed = placedFrom([shape, icon]);
    expect(placed.left_top).toEqual([shape]);
    expect(placed.right_bottom).toEqual([icon]);
    expect(placed.center_middle).toEqual([]);
  });
});

describe("cornersFrom", () => {
  it("returns all corner decorations in input order", () => {
    const a = buildStyle("corner", { placement: "top-left" });
    const b = buildStyle("corner", { placement: "bottom-right" });
    expect(cornersFrom([a, b])).toEqual([a, b]);
  });
});
```

Run: `npx vitest run src/decorations/derive-styles.test.ts`
Expected: FAIL — derivations not exported.

- [ ] **Step 2: Implement `src/decorations/derive-styles.ts`**

```ts
import type {
  BorderSide,
  JournalDecorationBorder,
  JournalDecorationCorner,
  JournalDecorationIcon,
  JournalDecorationShape,
  JournalDecorationStyle,
} from "./config";
import { colorToString } from "./ui/color";

const PLACEMENT_KEYS = [
  "left_top",
  "left_middle",
  "left_bottom",
  "center_top",
  "center_middle",
  "center_bottom",
  "right_top",
  "right_middle",
  "right_bottom",
] as const;

export type Placement = (typeof PLACEMENT_KEYS)[number];

export function backgroundFrom(styles: ReadonlyArray<JournalDecorationStyle>): string {
  const hit = styles.find((s) => s.type === "background");
  return hit ? colorToString(hit.color) : "inherit";
}

export function textColorFrom(styles: ReadonlyArray<JournalDecorationStyle>): string {
  const hit = styles.find((s) => s.type === "color");
  return hit ? colorToString(hit.color) : "inherit";
}

function toBorderStyleString(side: BorderSide): string {
  if (!side.show) return "none";
  return `${side.width}px ${side.style} ${colorToString(side.color)}`;
}

export function borderStylesFrom(styles: ReadonlyArray<JournalDecorationStyle>): {
  borderTop: string;
  borderRight: string;
  borderBottom: string;
  borderLeft: string;
} {
  const result = { borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none" };
  for (const style of styles) {
    if (style.type !== "border") continue;
    if (style.border === "uniform") {
      const s = toBorderStyleString(style.left);
      if (s !== "none") {
        result.borderTop = s;
        result.borderRight = s;
        result.borderBottom = s;
        result.borderLeft = s;
      }
    } else {
      const sides = {
        borderTop: toBorderStyleString(style.top),
        borderRight: toBorderStyleString(style.right),
        borderBottom: toBorderStyleString(style.bottom),
        borderLeft: toBorderStyleString(style.left),
      };
      if (sides.borderTop !== "none") result.borderTop = sides.borderTop;
      if (sides.borderRight !== "none") result.borderRight = sides.borderRight;
      if (sides.borderBottom !== "none") result.borderBottom = sides.borderBottom;
      if (sides.borderLeft !== "none") result.borderLeft = sides.borderLeft;
    }
  }
  return result;
}

export function paddingFrom(styles: ReadonlyArray<JournalDecorationStyle>): string {
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;
  let topBorder = 0;
  let rightBorder = 0;
  let bottomBorder = 0;
  let leftBorder = 0;

  for (const style of styles) {
    if (style.type === "background" || style.type === "color" || style.type === "corner") continue;
    if (style.type === "border") {
      if (style.border === "uniform") {
        // FIX vs v2: uniform means "all sides == left", so use left.width for all four padding contributions.
        const w = style.left.width;
        topBorder = Math.max(topBorder, w);
        rightBorder = Math.max(rightBorder, w);
        bottomBorder = Math.max(bottomBorder, w);
        leftBorder = Math.max(leftBorder, w);
      } else {
        topBorder = Math.max(topBorder, style.top.width);
        rightBorder = Math.max(rightBorder, style.right.width);
        bottomBorder = Math.max(bottomBorder, style.bottom.width);
        leftBorder = Math.max(leftBorder, style.left.width);
      }
      continue;
    }
    const placement: { x?: "left" | "center" | "right"; y?: "top" | "middle" | "bottom" } = style;
    const fallback = style.type === "shape" ? 0.4 : 0.5;
    const size = style.size ?? fallback;
    if (placement.y === "top") top = Math.max(top, size);
    else if (placement.y === "bottom") bottom = Math.max(bottom, size);
    if (placement.x === "left") left = Math.max(left, size);
    else if (placement.x === "right") right = Math.max(right, size);
  }

  return `max(${top + 0.1}em, ${topBorder + 2}px) max(${right + 0.1}em, ${rightBorder + 2}px) max(${bottom + 0.1}em, ${bottomBorder + 2}px) max(${left + 0.1}em, ${leftBorder + 2}px)`;
}

export function placedFrom(
  styles: ReadonlyArray<JournalDecorationStyle>,
): Record<Placement, Array<JournalDecorationShape | JournalDecorationIcon>> {
  const result = {
    left_top: [],
    left_middle: [],
    left_bottom: [],
    center_top: [],
    center_middle: [],
    center_bottom: [],
    right_top: [],
    right_middle: [],
    right_bottom: [],
  } as Record<Placement, Array<JournalDecorationShape | JournalDecorationIcon>>;

  for (const style of styles) {
    if (style.type !== "shape" && style.type !== "icon") continue;
    const key = `${style.placement_x}_${style.placement_y}` as Placement;
    result[key].push(style);
  }
  return result;
}

export function cornersFrom(styles: ReadonlyArray<JournalDecorationStyle>): JournalDecorationCorner[] {
  return styles.filter((s): s is JournalDecorationCorner => s.type === "corner");
}
```

This file references `./ui/color` which is created in Task 14. Either create the color file first or stub it. Cleaner sequencing: do Task 14 first, then Task 13. **Reorder: Task 14 (color helper) runs before Task 13.**

Run: `npx vitest run src/decorations/derive-styles.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/decorations/derive-styles.ts src/decorations/derive-styles.test.ts
git commit -m "feat(decorations): pure CSS derivations (background/border/padding/placed)"
```

---

## Task 14: `color.ts` — `colorToString` helper (run BEFORE Task 13)

**Files:**

- Create: `src/decorations/ui/color.ts`
- Test: `src/decorations/ui/color.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";

import { colorToString } from "./color";

describe("colorToString", () => {
  it("returns 'transparent' for transparent type", () => {
    expect(colorToString({ type: "transparent" })).toBe("transparent");
  });

  it("returns var(--<name>) for theme type", () => {
    expect(colorToString({ type: "theme", name: "text-accent" })).toBe("var(--text-accent)");
  });

  it("returns the raw color string for custom type", () => {
    expect(colorToString({ type: "custom", color: "#ff00aa" })).toBe("#ff00aa");
  });
});
```

Run: `npx vitest run src/decorations/ui/color.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement `src/decorations/ui/color.ts`**

```ts
import type { ColorSettings } from "../config";

export function colorToString(color: ColorSettings): string {
  switch (color.type) {
    case "transparent":
      return "transparent";
    case "theme":
      return `var(--${color.name})`;
    case "custom":
      return color.color;
  }
}
```

Run: `npx vitest run src/decorations/ui/color.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/decorations/ui/color.ts src/decorations/ui/color.test.ts
git commit -m "feat(decorations): colorToString helper"
```

---

## Task 15: Subcomponents — `DecorationCorner.vue`, `DecorationShape.vue`, `DecorationIcon.vue`

**Files:**

- Create: `src/decorations/ui/DecorationCorner.vue`
- Create: `src/decorations/ui/DecorationShape.vue`
- Create: `src/decorations/ui/DecorationIcon.vue`

Ports of v2's `_old-code/components/notes-calendar/decorations/Decoration*.vue`. Read those files first and translate the templates and `<style scoped>` blocks directly. Each component is a single SFC with one `<script setup lang="ts">` block and a small inline-style/CSS block; nothing reactive beyond props.

- [ ] **Step 1: Port `DecorationCorner.vue`**

Mirror `_old-code/.../decorations/DecorationCorner.vue`. The component takes `:decoration` (`JournalDecorationCorner`) and renders an absolutely-positioned triangle in the requested corner using `colorToString(decoration.color)` for fill.

- [ ] **Step 2: Port `DecorationShape.vue`**

Mirror `_old-code/.../decorations/DecorationShape.vue`. Takes `:decoration` (`JournalDecorationShape`); renders the shape via CSS (`clip-path` for triangles, `border-radius: 50%` for circles, plain box for square), sized in `em` from `decoration.size`.

- [ ] **Step 3: Port `DecorationIcon.vue`**

Mirror `_old-code/.../decorations/DecorationIcon.vue`. Takes `:decoration` (`JournalDecorationIcon`); calls `renderIcon` from `@/infrastructure/host` to inject the SVG into a sized container.

- [ ] **Step 4: Commit**

```bash
git add src/decorations/ui/DecorationCorner.vue src/decorations/ui/DecorationShape.vue src/decorations/ui/DecorationIcon.vue
git commit -m "feat(decorations): port DecorationCorner/Shape/Icon subcomponents from v2"
```

---

## Task 16: `CellDecoration.vue` + `CellDecorationMapKey`

**Files:**

- Create: `src/decorations/ui/CellDecoration.vue`
- Test: `src/decorations/ui/CellDecoration.test.ts`
- Modify: `src/decorations/index.ts` — uncomment the `CellDecoration` re-exports
- Create: `src/decorations/ui/modals.ts` (empty placeholder, content `export {};`)

- [ ] **Step 1: Write `src/decorations/ui/CellDecoration.vue`**

```vue
<script setup lang="ts">
import { computed, inject, type InjectionKey, type ShallowRef } from "vue";

import type { AnchorString, Period } from "@/calendar";

import type { JournalDecorationStyle } from "../config";
import {
  backgroundFrom,
  borderStylesFrom,
  cornersFrom,
  paddingFrom,
  placedFrom,
  textColorFrom,
} from "../derive-styles";

import DecorationCorner from "./DecorationCorner.vue";
import DecorationIcon from "./DecorationIcon.vue";
import DecorationShape from "./DecorationShape.vue";

export type CellStyleRef = ShallowRef<ReadonlyArray<JournalDecorationStyle>>;

export const CellDecorationMapKey: InjectionKey<ReadonlyMap<AnchorString, CellStyleRef>> =
  Symbol("decorations:cell-map");

const { period } = defineProps<{ period: Period }>();
const cells = inject(CellDecorationMapKey, null);

const styles = computed<ReadonlyArray<JournalDecorationStyle>>(() => cells?.get(period.anchor.toAnchor())?.value ?? []);

const background = computed(() => backgroundFrom(styles.value));
const textColor = computed(() => textColorFrom(styles.value));
const border = computed(() => borderStylesFrom(styles.value));
const padding = computed(() => paddingFrom(styles.value));
const corners = computed(() => cornersFrom(styles.value));
const placed = computed(() => placedFrom(styles.value));
</script>

<template>
  <span class="cell-decoration" data-testid="cell-decoration">
    <span class="cell-decoration__border" :style="border" />
    <DecorationCorner v-for="(corner, i) in corners" :key="i" :decoration="corner" />
    <span class="cell-decoration__placed">
      <template v-for="(group, key) in placed" :key="key">
        <span v-if="group.length > 0" :class="`place place-${key}`">
          <template v-for="(d, i) in group" :key="i">
            <DecorationIcon v-if="d.type === 'icon'" :decoration="d" />
            <DecorationShape v-else :decoration="d" />
          </template>
        </span>
      </template>
    </span>
    <span class="cell-decoration__content"><slot /></span>
  </span>
</template>

<style scoped>
.cell-decoration {
  width: 100%;
  height: 100%;
  padding: v-bind(padding);
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: v-bind(background) !important;
  color: v-bind(textColor) !important;
  line-height: 1;
  position: relative;
  box-sizing: border-box;
}

.cell-decoration__border {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.cell-decoration__placed {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
}

.cell-decoration__content {
  display: inline-block;
}

.place {
  display: flex;
  gap: 2px;
}
.place-left_top {
  grid-area: 1/1;
  justify-content: flex-start;
  align-items: flex-start;
}
.place-left_middle {
  grid-area: 2/1;
  justify-content: flex-start;
  align-items: center;
}
.place-left_bottom {
  grid-area: 3/1;
  justify-content: flex-start;
  align-items: flex-end;
}
.place-center_top {
  grid-area: 1/2;
  justify-content: center;
  align-items: flex-start;
}
.place-center_middle {
  grid-area: 2/2;
  justify-content: center;
  align-items: center;
}
.place-center_bottom {
  grid-area: 3/2;
  justify-content: center;
  align-items: flex-end;
}
.place-right_top {
  grid-area: 1/3;
  justify-content: flex-end;
  align-items: flex-start;
}
.place-right_middle {
  grid-area: 2/3;
  justify-content: flex-end;
  align-items: center;
}
.place-right_bottom {
  grid-area: 3/3;
  justify-content: flex-end;
  align-items: flex-end;
}
</style>
```

The `:style="border"` binding works because `borderStylesFrom` returns `{ borderTop, borderRight, borderBottom, borderLeft }` — Vue maps those camelCase keys to CSS properties.

- [ ] **Step 2: Write the failing test — `src/decorations/ui/CellDecoration.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { defineComponent, h, provide, shallowRef } from "vue";
import { render } from "@testing-library/vue";

import { CalendarDate, DayPeriod } from "@/calendar";

import { buildStyle } from "../testing";

import CellDecoration, { CellDecorationMapKey } from "./CellDecoration.vue";

describe("CellDecoration", () => {
  it("renders slot content unchanged when no decorations are provided", () => {
    const period = DayPeriod.of(CalendarDate.parse("2026-05-25").unwrap());
    const { getByText } = render(CellDecoration, {
      props: { period },
      slots: { default: "Hello" },
    });
    expect(getByText("Hello")).toBeTruthy();
  });

  it("applies the background color from provided decorations", () => {
    const period = DayPeriod.of(CalendarDate.parse("2026-05-25").unwrap());
    const cells = new Map();
    cells.set(
      period.anchor.toAnchor(),
      shallowRef([buildStyle("background", { color: { type: "custom", color: "rgb(10, 20, 30)" } })]),
    );

    const Host = defineComponent({
      setup() {
        provide(CellDecorationMapKey, cells);
        return () => h(CellDecoration, { period }, () => "hi");
      },
    });

    const { getByTestId } = render(Host);
    const el = getByTestId("cell-decoration") as HTMLElement;
    expect(el.style.backgroundColor).toBe("rgb(10, 20, 30)");
  });
});
```

Run: `npx vitest run src/decorations/ui/CellDecoration.test.ts`
Expected: PASS (since CellDecoration is now implemented). If it fails on Vue's `v-bind` reactivity for `background-color`, double-check the SFC's `v-bind(background)` inline declaration is being applied to `style.backgroundColor`.

- [ ] **Step 3: Add empty `modals.ts` placeholder**

`src/decorations/ui/modals.ts`:

```ts
export {};
```

This is required to satisfy the project's eslint rules about per-feature modal location even though no modals exist yet (per `feedback_modals_consolidation`).

- [ ] **Step 4: Uncomment CellDecoration / CellDecorationMapKey / CellStyleRef in `src/decorations/index.ts`**

Update the re-export to its real shape:

```ts
export { default as CellDecoration, CellDecorationMapKey, type CellStyleRef } from "./ui/CellDecoration.vue";
```

- [ ] **Step 5: Commit**

```bash
git add src/decorations/ui src/decorations/index.ts
git commit -m "feat(decorations): CellDecoration renderer + injection key"
```

---

## Task 17: `useCellDecorations` — seed and watchEffect

**Files:**

- Create: `src/decorations/use-cell-decorations.ts`
- Test: `src/decorations/use-cell-decorations.test.ts`
- Modify: `src/decorations/index.ts`

- [ ] **Step 1: Write the failing seed test — `src/decorations/use-cell-decorations.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { defineComponent, h, inject as vInject, nextTick } from "vue";
import { render } from "@testing-library/vue";

import { CalendarDate, DayPeriod } from "@/calendar";

import { CellDecorationMapKey } from "./ui/CellDecoration.vue";
import { useCellDecorations } from "./use-cell-decorations";
import { buildDecoration, buildCondition, buildStyle } from "./testing";

import { createNanoEvents } from "nanoevents";
import { ref, type Ref } from "vue";

import { Container } from "@/infrastructure/di";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";
import { fakeRepo, fixedJournal } from "@/journals/testing";
import { expectOk } from "@/infrastructure/result/testing";

import { DecorationEngine } from "./engine";

function buildContainer(): Container {
  const c = new Container();
  c.register(JournalsRepository).useValue(
    fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        {
          decorations: [
            buildDecoration({
              mode: "or",
              conditions: [buildCondition("weekday", { weekdays: [1] })],
              styles: [buildStyle("background")],
            }),
          ],
        },
      ),
    }),
  );
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NoteMetadataService).useValue(new FakeNoteMetadataService() as unknown as NoteMetadataService);
  c.register(NotesService).useValue({ events: createNanoEvents() } as unknown as NotesService);
  c.register(DecorationEngine).useClass(DecorationEngine);
  return c;
}

function date(anchor: string) {
  const result = CalendarDate.parse(anchor);
  expectOk(result);
  return result.value;
}

// `withInjectorOverride` below stands in for whatever helper the repository uses to
// make `inject()` calls inside a Vue component resolve from a provided container.
// Look at an existing v3 composable test (e.g. `src/journals/settings/ui/use-today-metadata.test.ts`)
// for the canonical pattern. If composables in this codebase are tested by binding the
// container to a Vue app via a plugin, use that mechanism instead.

describe("useCellDecorations", () => {
  it("seeds a ShallowRef per visible anchor on mount", async () => {
    const container = buildContainer();
    const period = DayPeriod.of(date("2026-05-25")); // Monday

    let captured: ReadonlyMap<string, { value: unknown[] }> | null = null;
    const Child = defineComponent({
      setup() {
        captured = vInject(CellDecorationMapKey) as any;
        return () => null;
      },
    });
    const Host = defineComponent({
      setup() {
        withInjectorOverride(container, () => {
          useCellDecorations(
            () => [period],
            () => ["daily"],
          );
        });
        return () => h(Child);
      },
    });

    render(Host);
    await nextTick();

    expect(captured).not.toBeNull();
    expect(captured!.get(period.anchor.toAnchor())!.value).toHaveLength(1);
  });

  it("re-seeds when the periods input changes", async () => {
    const container = buildContainer();
    const p1 = DayPeriod.of(date("2026-05-25"));
    const p2 = DayPeriod.of(date("2026-05-26"));
    const periodsRef: Ref<(typeof p1)[]> = ref([p1]);

    let captured: ReadonlyMap<string, { value: unknown[] }> | null = null;
    const Child = defineComponent({
      setup() {
        captured = vInject(CellDecorationMapKey) as any;
        return () => null;
      },
    });
    const Host = defineComponent({
      setup() {
        withInjectorOverride(container, () => {
          useCellDecorations(periodsRef, () => ["daily"]);
        });
        return () => h(Child);
      },
    });

    render(Host);
    await nextTick();
    expect(captured!.has(p1.anchor.toAnchor())).toBe(true);
    expect(captured!.has(p2.anchor.toAnchor())).toBe(false);

    periodsRef.value = [p2];
    await nextTick();
    expect(captured!.has(p1.anchor.toAnchor())).toBe(false);
    expect(captured!.has(p2.anchor.toAnchor())).toBe(true);
  });

  it("re-seeds when a journal's decorations array mutates", async () => {
    const container = buildContainer();
    const repository = container.resolve(JournalsRepository);
    const period = DayPeriod.of(date("2026-05-25"));

    let captured: ReadonlyMap<string, { value: unknown[] }> | null = null;
    const Child = defineComponent({
      setup() {
        captured = vInject(CellDecorationMapKey) as any;
        return () => null;
      },
    });
    const Host = defineComponent({
      setup() {
        withInjectorOverride(container, () => {
          useCellDecorations(
            () => [period],
            () => ["daily"],
          );
        });
        return () => h(Child);
      },
    });

    render(Host);
    await nextTick();
    const initialLen = captured!.get(period.anchor.toAnchor())!.value.length;

    const cfg = repository.get("daily").value;
    cfg.decorations.push(
      buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("color")],
      }),
    );
    await nextTick();

    expect(captured!.get(period.anchor.toAnchor())!.value.length).toBe(initialLen + 1);
  });
});
```

Run: `npx vitest run src/decorations/use-cell-decorations.test.ts`
Expected: FAIL — `useCellDecorations` not exported.

- [ ] **Step 2: Implement seed-only `src/decorations/use-cell-decorations.ts`**

```ts
import { provide, shallowRef, toValue, watchEffect, type MaybeRefOrGetter, type ShallowRef } from "vue";

import type { AnchorString, Period } from "@/calendar";
import { inject as diInject } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals";

import type { JournalDecoration, JournalDecorationStyle } from "./config";
import { DecorationEngine } from "./engine";
import { CellDecorationMapKey, type CellStyleRef } from "./ui/CellDecoration.vue";

export function useCellDecorations(
  periodsRef: MaybeRefOrGetter<ReadonlyArray<Period>>,
  journalNamesRef: MaybeRefOrGetter<ReadonlyArray<string>>,
): ReadonlyMap<AnchorString, CellStyleRef> {
  const engine = diInject(DecorationEngine);
  const journals = diInject(JournalsRepository);

  const cells = new Map<AnchorString, CellStyleRef>();
  let periodsByAnchor = new Map<AnchorString, Period>();

  function gatherDecorations(): ReadonlyArray<{ journalName: string; decoration: JournalDecoration }> {
    const out: { journalName: string; decoration: JournalDecoration }[] = [];
    for (const name of toValue(journalNamesRef)) {
      const opt = journals.get(name);
      if (opt.isNone()) continue;
      for (const decoration of opt.value.decorations) {
        out.push({ journalName: name, decoration });
      }
    }
    return out;
  }

  function reseed() {
    const periods = toValue(periodsRef);
    periodsByAnchor = new Map(periods.map((p) => [p.anchor.toAnchor(), p]));

    const decorations = gatherDecorations();
    const initial = engine.evaluateRange(periods, decorations);

    for (const anchor of [...cells.keys()]) {
      if (!periodsByAnchor.has(anchor)) cells.delete(anchor);
    }
    for (const [anchor] of periodsByAnchor) {
      const styles = (initial.get(anchor) ?? []) as ReadonlyArray<JournalDecorationStyle>;
      const existing = cells.get(anchor);
      if (existing) existing.value = styles;
      else cells.set(anchor, shallowRef<ReadonlyArray<JournalDecorationStyle>>(styles));
    }
  }

  watchEffect(reseed);
  provide(CellDecorationMapKey, cells);
  return cells;
}
```

Run: `npx vitest run src/decorations/use-cell-decorations.test.ts`
Expected: First test PASSES; remaining tests still pending.

- [ ] **Step 3: Commit**

```bash
git add src/decorations/use-cell-decorations.ts src/decorations/use-cell-decorations.test.ts
git commit -m "feat(decorations): useCellDecorations seed via watchEffect"
```

---

## Task 18: `useCellDecorations` — event handlers (metadata-changed, entryChanged)

**Files:**

- Modify: `src/decorations/use-cell-decorations.ts`
- Modify: `src/decorations/use-cell-decorations.test.ts`

- [ ] **Step 1: Add failing event-handling tests**

Add the following tests to `src/decorations/use-cell-decorations.test.ts`. Update `buildContainer` to return the emitter handles so tests can fire events:

```ts
import { createNanoEvents, type Emitter } from "nanoevents";
import type { NotesEvents, VaultPath } from "@/infrastructure/host";

function buildContainerWithHandles() {
  const notesEmitter: Emitter<NotesEvents> = createNanoEvents();
  const c = new Container();
  c.register(JournalsRepository).useValue(
    fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        {
          decorations: [
            buildDecoration({
              mode: "or",
              conditions: [buildCondition("has-note")],
              styles: [buildStyle("background")],
            }),
          ],
        },
      ),
    }),
  );
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  const fakeMetadata = new FakeNoteMetadataService();
  c.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  c.register(NotesService).useValue({ events: notesEmitter } as unknown as NotesService);
  c.register(DecorationEngine).useClass(DecorationEngine);
  return { c, notesEmitter, fakeMetadata };
}

describe("useCellDecorations event handling", () => {
  it("updates a single anchor when metadata-changed fires for an in-scope path", async () => {
    const { c, notesEmitter, fakeMetadata } = buildContainerWithHandles();
    const index = c.resolve(JournalsIndex);
    const period = DayPeriod.of(date("2026-05-25"));

    // Seed an entry so has-note matches and metadata is reachable.
    const path = "Daily/2026-05-25.md" as VaultPath;
    index.register({ journalName: "daily", anchor: period.anchor.toAnchor(), path });
    fakeMetadata.setMetadata(path, { title: "2026-05-25", tags: [], properties: {}, tasks: [] });

    let captured: ReadonlyMap<string, { value: unknown[] }> | null = null;
    const Child = defineComponent({
      setup() {
        captured = vInject(CellDecorationMapKey) as any;
        return () => null;
      },
    });
    const Host = defineComponent({
      setup() {
        withInjectorOverride(c, () =>
          useCellDecorations(
            () => [period],
            () => ["daily"],
          ),
        );
        return () => h(Child);
      },
    });
    render(Host);
    await nextTick();

    const ref = captured!.get(period.anchor.toAnchor())!;
    const initial = ref.value;
    notesEmitter.emit("metadata-changed", path);
    await nextTick();
    expect(ref.value).not.toBe(initial); // identity changed → re-evaluated
  });

  it("does not update when metadata-changed fires for an out-of-scope path", async () => {
    const { c, notesEmitter } = buildContainerWithHandles();
    const period = DayPeriod.of(date("2026-05-25"));

    let captured: ReadonlyMap<string, { value: unknown[] }> | null = null;
    const Child = defineComponent({
      setup() {
        captured = vInject(CellDecorationMapKey) as any;
        return () => null;
      },
    });
    const Host = defineComponent({
      setup() {
        withInjectorOverride(c, () =>
          useCellDecorations(
            () => [period],
            () => ["daily"],
          ),
        );
        return () => h(Child);
      },
    });
    render(Host);
    await nextTick();

    const ref = captured!.get(period.anchor.toAnchor())!;
    const initial = ref.value;
    notesEmitter.emit("metadata-changed", "Other/random.md" as VaultPath);
    await nextTick();
    expect(ref.value).toBe(initial);
  });

  it("updates the affected anchor when entryChanged fires for an in-scope anchor", async () => {
    const { c, fakeMetadata } = buildContainerWithHandles();
    const index = c.resolve(JournalsIndex);
    const period = DayPeriod.of(date("2026-05-25"));

    let captured: ReadonlyMap<string, { value: unknown[] }> | null = null;
    const Child = defineComponent({
      setup() {
        captured = vInject(CellDecorationMapKey) as any;
        return () => null;
      },
    });
    const Host = defineComponent({
      setup() {
        withInjectorOverride(c, () =>
          useCellDecorations(
            () => [period],
            () => ["daily"],
          ),
        );
        return () => h(Child);
      },
    });
    render(Host);
    await nextTick();

    const ref = captured!.get(period.anchor.toAnchor())!;
    const initial = ref.value;
    const path = "Daily/2026-05-25.md" as VaultPath;
    fakeMetadata.setMetadata(path, { title: "2026-05-25", tags: [], properties: {}, tasks: [] });
    index.register({ journalName: "daily", anchor: period.anchor.toAnchor(), path });
    await nextTick();
    expect(ref.value).not.toBe(initial);
  });

  it("detaches subscriptions on unmount", async () => {
    const { c, notesEmitter, fakeMetadata } = buildContainerWithHandles();
    const index = c.resolve(JournalsIndex);
    const period = DayPeriod.of(date("2026-05-25"));
    const path = "Daily/2026-05-25.md" as VaultPath;
    index.register({ journalName: "daily", anchor: period.anchor.toAnchor(), path });
    fakeMetadata.setMetadata(path, { title: "2026-05-25", tags: [], properties: {}, tasks: [] });

    let capturedRef: { value: unknown[] } | null = null;
    const Child = defineComponent({
      setup() {
        const map = vInject(CellDecorationMapKey)!;
        capturedRef = map.get(period.anchor.toAnchor())! as any;
        return () => null;
      },
    });
    const Host = defineComponent({
      setup() {
        withInjectorOverride(c, () =>
          useCellDecorations(
            () => [period],
            () => ["daily"],
          ),
        );
        return () => h(Child);
      },
    });
    const utils = render(Host);
    await nextTick();
    const initial = capturedRef!.value;

    utils.unmount();
    expect(() => notesEmitter.emit("metadata-changed", path)).not.toThrow();
    // The captured ref still holds its last value; the test asserts no throw and no mutation after unmount.
    expect(capturedRef!.value).toBe(initial);
  });
});
```

Run: `npx vitest run src/decorations/use-cell-decorations.test.ts`
Expected: FAIL.

- [ ] **Step 2: Extend the composable with `onMounted` / `onUnmounted` handlers**

```ts
import { onMounted, onUnmounted } from "vue";
import { JournalsIndex } from "@/journals";
import { NotesService, type VaultPath } from "@/infrastructure/host";

// inside useCellDecorations:
const index = diInject(JournalsIndex);
const notes = diInject(NotesService);

const anchorsByPath = new Map<VaultPath, AnchorString>();
let journalNamesInScope = new Set<string>();

function rebuildScopeMaps() {
  const periods = toValue(periodsRef);
  const journalNames = toValue(journalNamesRef);
  journalNamesInScope = new Set(journalNames);
  anchorsByPath.clear();
  for (const period of periods) {
    const anchor = period.anchor.toAnchor();
    for (const name of journalNames) {
      const opt = index.entryByAnchor(name, anchor);
      if (opt.isSome()) anchorsByPath.set(opt.value.path, anchor);
    }
  }
}

// Replace the existing reseed with:
function reseed() {
  rebuildScopeMaps();
  const periods = toValue(periodsRef);
  periodsByAnchor = new Map(periods.map((p) => [p.anchor.toAnchor(), p]));
  const decorations = gatherDecorations();
  const initial = engine.evaluateRange(periods, decorations);
  for (const anchor of [...cells.keys()]) {
    if (!periodsByAnchor.has(anchor)) cells.delete(anchor);
  }
  for (const [anchor] of periodsByAnchor) {
    const styles = (initial.get(anchor) ?? []) as ReadonlyArray<JournalDecorationStyle>;
    const existing = cells.get(anchor);
    if (existing) existing.value = styles;
    else cells.set(anchor, shallowRef<ReadonlyArray<JournalDecorationStyle>>(styles));
  }
}

onMounted(() => {
  const offMeta = notes.events.on("metadata-changed", (path) => {
    const anchor = anchorsByPath.get(path);
    if (anchor === undefined) return;
    const period = periodsByAnchor.get(anchor);
    if (!period) return;
    cells.get(anchor)!.value = engine.evaluateAnchor(period, gatherDecorations());
  });
  const offIndex = index.events.on("entryChanged", ({ entry, kind }) => {
    if (!journalNamesInScope.has(entry.journalName)) return;
    if (!periodsByAnchor.has(entry.anchor)) return;
    if (kind === "added") anchorsByPath.set(entry.path, entry.anchor);
    else anchorsByPath.delete(entry.path);
    const period = periodsByAnchor.get(entry.anchor)!;
    cells.get(entry.anchor)!.value = engine.evaluateAnchor(period, gatherDecorations());
  });
  onUnmounted(() => {
    offMeta();
    offIndex();
  });
});
```

Verify the `notes.events.on` / `index.events.on` `Subscribable` API returns a disposer (it should — see existing usages in v3).

Run: `npx vitest run src/decorations/use-cell-decorations.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/decorations/use-cell-decorations.ts src/decorations/use-cell-decorations.test.ts
git commit -m "feat(decorations): useCellDecorations subscribes to metadata + index events"
```

---

## Task 19: Scoped `cell` slot on the five `Calendar*View` components

**Files:**

- Modify: `src/calendar/ui/CalendarMonthView.vue`
- Modify: `src/calendar/ui/CalendarWeekView.vue`
- Modify: `src/calendar/ui/CalendarQuarterView.vue`
- Modify: `src/calendar/ui/CalendarYearView.vue`
- Modify: `src/calendar/ui/CalendarDecadeView.vue`

- [ ] **Step 1: Replace each view's cell content with a scoped slot**

For each file, locate the per-cell `UiButton` (or equivalent) and replace its inner content:

Before:

```vue
<UiButton ...>
  {{ cell.label }}
</UiButton>
```

After:

```vue
<UiButton ...>
  <slot name="cell" :period="cell.period" :label="cell.label">{{ cell.label }}</slot>
</UiButton>
```

This is back-compat: any caller that doesn't supply the slot gets the original label rendering.

- [ ] **Step 2: Verify existing view tests still pass**

Run: `npx vitest run src/calendar/ui/`
Expected: PASS for `CalendarMonthView.test.ts`, `CalendarWeekView.test.ts`, `CalendarQuarterView.test.ts`, `CalendarYearView.test.ts`, `CalendarDecadeView.test.ts`, `DatePicker.test.ts`, `DatePickerModal.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/calendar/ui/Calendar*.vue
git commit -m "feat(calendar): expose scoped cell slot on period views"
```

---

## Task 20: `useCellDecorations` re-export and final verification

**Files:**

- Modify: `src/decorations/index.ts`

- [ ] **Step 1: Add `useCellDecorations` to the barrel**

```ts
export { useCellDecorations } from "./use-cell-decorations";
```

(Should already be present from Task 12 if you uncommented it; otherwise add now.)

- [ ] **Step 2: Run the full test + check suite**

```bash
npm run test
npm run check:types
npm run check:lint
```

Expected: all three PASS.

If `check:lint` complains about any test file location, modal location, or feature-directory shape, address per the relevant memory:

- `feedback_testing_dir_layout` — colocated `*.test.ts`, no top-level `mocks/`.
- `feedback_modals_consolidation` — modals live in `<unit>/ui/modals.ts`; an empty `modals.ts` is fine.
- `feedback_feature_directory_schema` — `ui/` for SFCs+modals.ts, `flows/` for `.flow.ts`, feature root for domain+wiring.

- [ ] **Step 3: Commit any final fix-ups**

```bash
git add -p   # selectively stage
git commit -m "chore(decorations): final wiring + lint fixes"
```

---

## Self-Review Notes

- **Schema coverage** — Tasks 3–6 cover the full schema graph (`color`, `borderSide`, all six style arms, all condition variants including the typed property union, top-level `decorationSchema`, integration into `journalConfigSchema`).
- **Engine coverage** — Tasks 9–11 cover every condition predicate; Task 11 covers `evaluateRange` flow (kind filter, missing-config, empty conditions, mixed kinds via separate test cases) and `evaluateAnchor`.
- **Render coverage** — Tasks 13, 14, 15, 16 cover derivations, color helper, subcomponents, and the wrapper component including the v2 uniform-border padding fix.
- **Composable coverage** — Tasks 17, 18 cover seed (`watchEffect`) and per-event invalidation (`metadata-changed`, `entryChanged`), with explicit teardown verification.
- **Slot integration** — Task 19 adds the scoped `cell` slot to all five period views without breaking existing consumers.
- **Out of scope per spec §8** — management UI, notes-calendar view, frontmatter-tags extraction, list/date property variants, decoration IDs, settings migration. None of those should appear in the implementation; if you find yourself reaching for them, stop and re-read spec §8.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-25-v3-decorations.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach?**
