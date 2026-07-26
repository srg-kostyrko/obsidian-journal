# Note-name collision warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn in journal settings when two different periods of a journal render the same note path, so entries silently sharing one note are caught at configuration time.

**Architecture:** A pure `findPathCollision` helper walks a list of anchors against a caller-supplied renderer and returns the first repeated path. A Vue composable feeds it up to 40 consecutive anchors of the journal, rendered through the real `NotePathService`, and the existing `NoteCreationSection.vue` renders the resulting warning. The new check subsumes and replaces the old `nameTemplateCollides`.

**Tech Stack:** TypeScript, Vue 3 SFCs with `<script setup>`, vitest, `@testing-library/vue`, the project's own `Container` DI, paraglide i18n.

**Spec:** `docs/superpowers/specs/2026-07-26-name-template-collision-warning-design.md`

## Global Constraints

- Test commands are **npm**, not pnpm: `npm run test`, `npm run check:types`, `npm run check:lint`. All three must pass before each commit.
- Tests are colocated: `foo.test.ts` sits next to `foo.ts`.
- One behavior per test. No "and"/comma-list test names. Express scope with nested `describe()` blocks.
- No `eslint-disable` comments, ever. Fix the code instead.
- No non-null assertions (`!`) in production code — the rule is on for `src/**` and off for `*.test.ts`. Production code uses `.at()` plus `??`.
- Only WHY-comments. No comments that restate what the code does, no file-header JSDoc.
- Vue components get inline `defineProps<{...}>()`; DI in components goes through `useService`.
- Component tests use `@testing-library/vue` + `user-event`. No `@vue/test-utils`, no CSS-class queries, no test-only `data-*` attributes.
- Modules under `src/journals/settings/ui/` import journal services by **direct submodule path** (`../../cycle`), never via the `@/journals` barrel — the barrel creates an import cycle here.
- i18n: edit `messages/en.json` at the repo root and run `npm run compile:i18n`. `src/i18n/paraglide` is generated and git-ignored — never stage it.
- New user-facing copy follows `docs/2026-07-13-ux-text-audit.md` §A: sentence case, en-US.
- Commit to the current branch (`v3-ai`). Never create a branch. Never add a `Co-Authored-By` trailer.

---

### Task 1: `findPathCollision` pure helper

Adds the collision-finding core next to the existing `nameTemplateCollides`. The old function stays for now so the tree keeps compiling; Task 3 removes it.

**Files:**

- Modify: `src/journals/settings/ui/name-template-collision.ts`
- Test: `src/journals/settings/ui/name-template-collision.test.ts`

**Interfaces:**

- Consumes: `AnchorString` from `@/calendar` (a branded `string`), `anchor()` from `@/calendar/testing`.
- Produces:

  ```ts
  export interface PathCollision {
    readonly first: AnchorString;
    readonly second: AnchorString;
    readonly path: string;
  }
  export function findPathCollision(
    anchors: readonly AnchorString[],
    pathFor: (anchor: AnchorString) => string | undefined,
  ): PathCollision | null;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/journals/settings/ui/name-template-collision.test.ts`. Add the two new imports to the existing import block at the top of the file — the file currently imports only `{ describe, expect, it }` from `vitest` and `{ nameTemplateCollides }` from `./name-template-collision`:

```ts
import { anchor } from "@/calendar/testing";

import { findPathCollision, nameTemplateCollides } from "./name-template-collision";
```

Then append this block after the existing `describe("nameTemplateCollides", ...)` block:

```ts
describe("findPathCollision", () => {
  it("reports the earliest pair of anchors that render the same path", () => {
    const paths: Record<string, string> = {
      "2026-01-01": "a.md",
      "2026-01-02": "b.md",
      "2026-01-03": "a.md",
    };
    const result = findPathCollision(
      [anchor("2026-01-01"), anchor("2026-01-02"), anchor("2026-01-03")],
      (a) => paths[a],
    );
    expect(result).toEqual({ first: anchor("2026-01-01"), second: anchor("2026-01-03"), path: "a.md" });
  });

  it("returns null when every anchor renders a distinct path", () => {
    const paths: Record<string, string> = {
      "2026-01-01": "a.md",
      "2026-01-02": "b.md",
    };
    const result = findPathCollision([anchor("2026-01-01"), anchor("2026-01-02")], (a) => paths[a]);
    expect(result).toBeNull();
  });

  it("does not match unrenderable anchors against each other", () => {
    const result = findPathCollision([anchor("2026-01-01"), anchor("2026-01-02")], () => undefined);
    expect(result).toBeNull();
  });

  it("returns null for an empty anchor list", () => {
    expect(findPathCollision([], () => "a.md")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/journals/settings/ui/name-template-collision.test.ts`

Expected: FAIL. The four new tests error because `findPathCollision` is not exported from `./name-template-collision`. The six existing `nameTemplateCollides` tests still pass.

- [ ] **Step 3: Write the implementation**

Add to `src/journals/settings/ui/name-template-collision.ts`. Keep the existing `tokenize` import, the `DATE_VARIABLES` constant and the `nameTemplateCollides` function exactly as they are, and add a type-only import plus the new code:

```ts
import type { AnchorString } from "@/calendar";

export interface PathCollision {
  readonly first: AnchorString;
  readonly second: AnchorString;
  readonly path: string;
}

export function findPathCollision(
  anchors: readonly AnchorString[],
  pathFor: (anchor: AnchorString) => string | undefined,
): PathCollision | null {
  const seen = new Map<string, AnchorString>();
  for (const current of anchors) {
    const path = pathFor(current);
    // An anchor that fails to render tells us nothing about collisions; treating the
    // absent paths as equal would report every such pair as a collision.
    if (path === undefined) continue;
    const first = seen.get(path);
    if (first !== undefined) return { first, second: current, path };
    seen.set(path, current);
  }
  return null;
}
```

Import ordering follows the project's eslint config: the `@/calendar` type import goes in the same group as the existing `@/templates` import, alphabetically before it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/journals/settings/ui/name-template-collision.test.ts`

Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full gate**

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all three pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/settings/ui/name-template-collision.ts src/journals/settings/ui/name-template-collision.test.ts
git commit -m "feat(journals): add findPathCollision helper"
```

---

### Task 2: `useCollisionCheck` composable

Samples the journal's periods and reports the first collision. Not wired into any component yet — Task 3 does that.

**Files:**

- Create: `src/journals/settings/ui/use-collision-check.ts`
- Test: `src/journals/settings/ui/use-collision-check.test.ts`

**Interfaces:**

- Consumes: `findPathCollision` and `PathCollision` from Task 1.
- Consumes from the codebase:
  - `CycleService.anchorOf(name: string, date: CalendarDate): Option<AnchorString>`
  - `CycleService.nextAnchor(name: string, from: AnchorString): Option<AnchorString>`
  - `TimelineService.contains(name: string, anchor: AnchorString): boolean`
  - `NotePathService.pathForDate(name: string, date: CalendarDate): Result<VaultPath, JournalNotFoundError>`
  - `CalendarDate.today()`, `CalendarDate.fromAnchor(anchor: AnchorString)`
  - `useService` from `@/infrastructure/di`
  - `JournalConfig` has `name: string`, `nameTemplate: string`, and `timeline: { start: AnchorString | "" }`
- Produces:

  ```ts
  export function useCollisionCheck(config: Ref<JournalConfig | undefined>): ComputedRef<PathCollision | null>;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/journals/settings/ui/use-collision-check.test.ts`:

```ts
import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, ref, type ComputedRef } from "vue";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import { CycleService } from "../../cycle";
import { FrontmatterService } from "../../frontmatter";
import { JournalsIndex } from "../../journals-index";
import { NotePathService } from "../../notes/note-path";
import { NumberingService } from "../../numbering";
import { JournalsRepository } from "../../repository";
import { fakeRepo, fixedJournal } from "../../testing";
import { TimelineService } from "../../timeline";

import { useCollisionCheck } from "./use-collision-check";

import type { JournalConfig } from "../../config";
import type { PathCollision } from "./name-template-collision";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  teardown();
  cleanup();
});

function buildContainer(config: JournalConfig): Container {
  const container = new Container();
  container.addModule(LoggerModule);
  container.register(JournalsRepository).useValue(fakeRepo({ [config.name]: config }));
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(NotePathService).useClass(NotePathService);
  return container;
}

function probe(config: JournalConfig): ComputedRef<PathCollision | null> {
  const container = buildContainer(config);
  let captured: ComputedRef<PathCollision | null> | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useCollisionCheck(ref<JournalConfig | undefined>(config));
      return undefined;
    },
    template: "<div />",
  });
  render(Probe, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  if (!captured) throw new Error("probe did not capture the collision ref");
  return captured;
}

function dayJournal(overrides: Partial<JournalConfig> = {}): JournalConfig {
  return fixedJournal(
    "daily",
    { type: "day" },
    { timeline: { start: "2026-01-01" as AnchorString, end: { kind: "never" } }, ...overrides },
  );
}

describe("useCollisionCheck", () => {
  it("stays silent for a template whose date varies per period", () => {
    expect(probe(dayJournal()).value).toBeNull();
  });

  it("flags a template whose boundary modifier collapses the date", () => {
    const collision = probe(dayJournal({ nameTemplate: "{{date<endOf=month>}}" })).value;
    expect(collision).toMatchObject({ first: "2026-01-01", second: "2026-01-02" });
  });

  it("flags a template whose shift and boundary collapse the date", () => {
    const collision = probe(dayJournal({ nameTemplate: "{{date+1w<endOf=month>:YYYY-MM-DD}}" })).value;
    expect(collision).not.toBeNull();
  });

  it("flags a template whose inline format is coarser than the period", () => {
    const collision = probe(dayJournal({ nameTemplate: "{{date:YYYY-MM}}" })).value;
    expect(collision).toMatchObject({ path: "2026-01.md" });
  });

  it("flags a plain date variable when the journal's own date format is coarser than the period", () => {
    const collision = probe(dayJournal({ nameTemplate: "{{date}}", dateFormat: "YYYY-MM" })).value;
    expect(collision).toMatchObject({ path: "2026-01.md" });
  });

  it("flags a template with no date variable at all", () => {
    const collision = probe(dayJournal({ nameTemplate: "MyNote" })).value;
    expect(collision).toMatchObject({ path: "MyNote.md" });
  });

  it("stays silent when the folder disambiguates a coarse name", () => {
    const config = dayJournal({ nameTemplate: "{{date:YYYY-MM}}", folder: "Journal/{{date:DD}}" });
    expect(probe(config).value).toBeNull();
  });

  it("stays silent for an empty name template", () => {
    expect(probe(dayJournal({ nameTemplate: "" })).value).toBeNull();
  });

  it("stays silent when the timeline ends before the colliding period", () => {
    const config = dayJournal({
      nameTemplate: "{{date<endOf=month>}}",
      timeline: { start: "2026-01-01" as AnchorString, end: { kind: "repeats", count: 1 } },
    });
    expect(probe(config).value).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/journals/settings/ui/use-collision-check.test.ts`

Expected: FAIL — the module `./use-collision-check` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/journals/settings/ui/use-collision-check.ts`:

```ts
import { computed, type ComputedRef, type Ref } from "vue";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";

import { CycleService } from "../../cycle";
import { NotePathService } from "../../notes/note-path";
import { TimelineService } from "../../timeline";

import { findPathCollision, type PathCollision } from "./name-template-collision";

import type { JournalConfig } from "../../config";

const SAMPLE_COUNT = 40;

export function useCollisionCheck(config: Ref<JournalConfig | undefined>): ComputedRef<PathCollision | null> {
  const cycle = useService(CycleService);
  const timeline = useService(TimelineService);
  const notePath = useService(NotePathService);
  return computed(() => {
    const value = config.value;
    if (!value?.nameTemplate) return null;
    const name = value.name;
    // Walking from the timeline start rather than today keeps the verdict stable from
    // one day to the next; an unset start leaves today as the only origin available.
    const origin = value.timeline.start === "" ? CalendarDate.today() : CalendarDate.fromAnchor(value.timeline.start);
    const startAnchor = cycle.anchorOf(name, origin);
    if (startAnchor.isNone()) return null;
    const anchors: AnchorString[] = [];
    let current = startAnchor.value;
    // CycleService steps forever, so the timeline is what stops the walk: periods past the
    // journal's end never become notes and must not raise a collision.
    while (anchors.length < SAMPLE_COUNT && timeline.contains(name, current)) {
      anchors.push(current);
      const next = cycle.nextAnchor(name, current);
      if (next.isNone()) break;
      current = next.value;
    }
    return findPathCollision(anchors, (candidate) => {
      const path = notePath.pathForDate(name, CalendarDate.fromAnchor(candidate));
      return path.isOk() ? path.value : undefined;
    });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/journals/settings/ui/use-collision-check.test.ts`

Expected: PASS, 9 tests.

If the boundary-modifier test reports a different `second` anchor than `2026-01-02`, read the rendered paths before changing the expectation — the assertion encodes the real behavior (every January day renders `2026-01-31.md`), so a mismatch means the walk origin or the modifier order is wrong, not that the expectation is too strict.

- [ ] **Step 5: Run the full gate**

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all three pass.

- [ ] **Step 6: Commit**

```bash
git add src/journals/settings/ui/use-collision-check.ts src/journals/settings/ui/use-collision-check.test.ts
git commit -m "feat(journals): sample journal periods for note-path collisions"
```

---

### Task 3: Wire the warning into settings and retire `nameTemplateCollides`

Changes the message to carry the colliding pair, swaps the component over to the new composable, deletes the superseded helper, and records the manual-test case.

**Files:**

- Modify: `messages/en.json:1189`
- Modify: `src/journals/settings/ui/sections/NoteCreationSection.vue`
- Modify: `src/journals/settings/ui/name-template-collision.ts`
- Modify: `src/journals/settings/ui/name-template-collision.test.ts`
- Test: `src/journals/settings/ui/sections/NoteCreationSection.test.ts`
- Modify: `docs/manual-testing-checklist-v3.md`

**Interfaces:**

- Consumes: `useCollisionCheck` from Task 2, `PathCollision` from Task 1.
- Produces: nothing new for later tasks; this is the last task.

- [ ] **Step 1: Write the failing component tests**

In `src/journals/settings/ui/sections/NoteCreationSection.test.ts`, register `TimelineService` in `mount()`. Add it to the existing `@/journals` import list (which already pulls `CycleService`, `FrontmatterService`, `JournalsRepository`, `JournalsViewModel`, `NotePathService`, `NumberingService`) and add this line next to the other `useClass` registrations:

```ts
container.register(TimelineService).useClass(TimelineService);
```

Then replace the two existing collision tests at lines 120-128 with:

```ts
it("names the colliding note path when every entry resolves to one note", () => {
  mount({ nameTemplate: "MyNote" });
  expect(screen.getByText(/MyNote\.md/)).toBeTruthy();
});

it("does not warn about collisions for the default date template", () => {
  mount();
  expect(screen.queryByText(/resolve to/)).toBeNull();
});
```

The positive test asserts on the rendered path rather than on `m.*()` with the same arguments the component passes, for the reason spelled out in the neighbouring invertibility test at line 112: re-deriving the arguments would make the assertion pass for any message body.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/journals/settings/ui/sections/NoteCreationSection.test.ts`

Expected: FAIL. `MyNote.md` is not in the document — the component still renders the old parameterless warning text.

- [ ] **Step 3: Update the message**

In `messages/en.json`, replace line 1189 with:

```json
  "journal_edit_name_template_collision_warning": "Entries for {first} and {second} both resolve to {path}. They will share one note.",
```

Then regenerate:

```bash
npm run compile:i18n
```

Do not stage anything under `src/i18n/paraglide` — it is git-ignored generated output.

- [ ] **Step 4: Switch the component to the composable**

In `src/journals/settings/ui/sections/NoteCreationSection.vue`:

Replace the import of the old helper:

```ts
import { nameTemplateCollides } from "../name-template-collision";
```

with:

```ts
import { useCollisionCheck } from "../use-collision-check";
```

placing it in the same relative-import group, after `import { useAutoCreateOnEnable } from "../use-auto-create-on-enable";` and before `import { extractFromDateFormat, extractFromNameTemplate } from "../use-folder-extractor";`.

Delete these two lines from the `<script setup>` block:

```ts
const nameTemplateRef = computed(() => config.value?.nameTemplate ?? "");
const templateCollides = computed(() => nameTemplateCollides(nameTemplateRef.value, numberingVariableNames.value));
```

and add, next to the existing `const invertibility = useInvertibilityCheck(config);`:

```ts
const collision = useCollisionCheck(config);
```

Keep `numberingVariableNames` — `VariableReferenceHint` still uses it. Keep the `computed` import; `config`, `hasCycle` and `numberingVariableNames` still need it.

In the template, replace:

```vue
<div v-if="templateCollides" class="journal-hint">
          {{ m.journal_edit_name_template_collision_warning() }}
        </div>
```

with:

```vue
<div v-if="collision" class="journal-hint">
          {{ m.journal_edit_name_template_collision_warning(collision) }}
        </div>
```

`PathCollision`'s three fields are named exactly `first`, `second` and `path`, so it satisfies the generated message signature directly.

- [ ] **Step 5: Delete the superseded helper**

In `src/journals/settings/ui/name-template-collision.ts`, delete the `tokenize` import, the `DATE_VARIABLES` constant with its comment, and the whole `nameTemplateCollides` function. `findPathCollision`, `PathCollision` and the `AnchorString` type import remain.

In `src/journals/settings/ui/name-template-collision.test.ts`, delete the entire `describe("nameTemplateCollides", ...)` block and drop `nameTemplateCollides` from the import, leaving `import { findPathCollision } from "./name-template-collision";`. The `describe("findPathCollision", ...)` block stays.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- src/journals/settings/ui`

Expected: PASS. `NoteCreationSection.test.ts`, `name-template-collision.test.ts` (4 tests) and `use-collision-check.test.ts` (9 tests) are all green.

- [ ] **Step 7: Record the manual-test case**

In `docs/manual-testing-checklist-v3.md`, insert a line into §2 directly after the existing shift-and-boundary item at lines 115-116 (`Shift **and** boundary together — ...`):

```markdown
- [ ] **Colliding name template** — `{{date<endOf=month>}}` on a Day journal → the
      name-template field warns, naming the two dates and the shared note path.
```

- [ ] **Step 8: Run the full gate**

Run: `npm run test && npm run check:types && npm run check:lint`

Expected: all three pass.

- [ ] **Step 9: Commit**

```bash
git add messages/en.json \
  src/journals/settings/ui/sections/NoteCreationSection.vue \
  src/journals/settings/ui/sections/NoteCreationSection.test.ts \
  src/journals/settings/ui/name-template-collision.ts \
  src/journals/settings/ui/name-template-collision.test.ts \
  docs/manual-testing-checklist-v3.md
git commit -m "feat(journals): warn when two periods resolve to the same note

The previous check only caught name templates with no per-entry variable.
Sampling the journal's periods also catches boundary modifiers, shifts and
coarse date formats, and reports the two dates that collide."
```
