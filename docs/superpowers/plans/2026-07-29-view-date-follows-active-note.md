# View Date Follows Active Note — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the journal view's date a single value that an opened journal note _seeds_ rather than overrides, so navigation, the date picker and `{{date}}` all act on the date the user is looking at.

**Architecture:** `ViewContext.refDate` becomes the view's selected date, written whenever an in-scope journal note opens. Each calendar block keeps only a _window anchor_ — which periods are laid out — and re-centers it on navigation always, but on a follow only when the new date fell outside the window. The per-block `followActiveDate` flag becomes a single view-level setting. The old shadow-state composable `useFollowActiveDate` is deleted.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>` SFCs), valibot schemas, vitest + @testing-library/vue, paraglide i18n, WebdriverIO for e2e against real Obsidian.

Spec: `docs/superpowers/specs/2026-07-29-view-date-follows-active-note-design.md`

## Global Constraints

- Quality gates for every task: `npm run test`, `npm run check:types`, `npm run check:lint`. All three must pass before committing.
- Never add `eslint-disable` comments — fix the code instead.
- Never add a `Co-Authored-By` trailer to a commit message.
- Commit to the current branch (`v3-ai`). Never create a branch.
- `src/i18n/paraglide` is generated and git-ignored. Edit `messages/en.json`, then run `npm run compile:i18n`. Never stage anything under `src/i18n/paraglide`.
- New copy follows `docs/2026-07-13-ux-text-audit.md` §A: sentence case, en-US.
- `no-non-null-assertion` is ON in production code and OFF in tests. Use `.at(i) ?? fallback`, never `!`.
- Test rules: colocate `*.test.ts` beside the implementation; one behavior per test; test descriptions name the behavior (subject + verb), no "and"/comma lists; assert observable outcomes, not call counts; no tests for wiring, barrels, or framework behavior.
- Discriminated-union dispatch uses `ts-pattern` `match().with().exhaustive()`, never `switch`.
- Vue SFCs use inline `defineProps<{...}>()`.

---

### Task 1: Window-anchor composable and the `refDateOrigin` seam

Adds the read-only origin signal to `ViewContext` and the composable that turns it into window-layout behavior. Nothing consumes them yet — after this task `refDateOrigin` is always `"navigate"`, which is true because nothing follows at the view level until Task 2.

**Files:**

- Modify: `src/views/view-context.ts`
- Modify: `src/views/view-leaf.ts`
- Modify: `src/views/ui/preview-view-context.ts`
- Modify: `src/views/testing.ts`
- Create: `src/views/blocks/ui/use-window-anchor.ts`
- Test: `src/views/blocks/ui/use-window-anchor.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `export type RefDateOrigin = "navigate" | "follow"` from `src/views/view-context.ts`
  - `ViewContext.refDateOrigin: Readonly<Ref<RefDateOrigin>>`
  - `export function useWindowAnchor(options: { refDate: MaybeRefOrGetter<AnchorString>; origin: MaybeRefOrGetter<RefDateOrigin>; contains: (date: AnchorString, windowAnchor: AnchorString) => boolean }): ComputedRef<AnchorString>` from `src/views/blocks/ui/use-window-anchor.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/blocks/ui/use-window-anchor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar";

import { useWindowAnchor } from "./use-window-anchor";

import type { RefDateOrigin } from "../../view-context";

const A = "2026-05-15" as AnchorString;
const B = "2026-09-10" as AnchorString;

describe("useWindowAnchor", () => {
  it("re-centers on a navigated date that the window already contained", async () => {
    const refDate = ref(A);
    const origin = ref<RefDateOrigin>("navigate");
    const anchor = useWindowAnchor({ refDate, origin, contains: () => true });

    refDate.value = B;
    await nextTick();

    expect(anchor.value).toBe(B);
  });

  it("holds the window on a followed date that is still inside it", async () => {
    const refDate = ref(A);
    const origin = ref<RefDateOrigin>("follow");
    const anchor = useWindowAnchor({ refDate, origin, contains: () => true });

    refDate.value = B;
    await nextTick();

    expect(anchor.value).toBe(A);
  });

  it("moves the window to a followed date that falls outside it", async () => {
    const refDate = ref(A);
    const origin = ref<RefDateOrigin>("follow");
    const anchor = useWindowAnchor({ refDate, origin, contains: () => false });

    refDate.value = B;
    await nextTick();

    expect(anchor.value).toBe(B);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/views/blocks/ui/use-window-anchor.test.ts`
Expected: FAIL — cannot resolve `./use-window-anchor` and `RefDateOrigin` is not exported.

- [ ] **Step 3: Add `RefDateOrigin` and `refDateOrigin` to the view context**

In `src/views/view-context.ts`, add the type above the interface and the field to the interface:

```ts
export type RefDateOrigin = "navigate" | "follow";

export interface ViewContext {
  readonly viewId: ViewId;
  readonly viewName: Readonly<Ref<string>>;
  readonly refDate: Readonly<Ref<AnchorString>>;
  // Whether the current refDate arrived from explicit navigation or from a note opening.
  // Calendar blocks re-center their window on the former and only re-lay-out for the
  // latter when the date fell outside what they already show.
  readonly refDateOrigin: Readonly<Ref<RefDateOrigin>>;
  readonly shelf: Readonly<Ref<string | null>>;
  // The settings-page preview renders items detached from any live journal scope. Items use
  // this to show their configured shape (e.g. as placeholders) instead of self-hiding.
  readonly preview: boolean;
  setRefDate(date: AnchorString): void;
  setShelf(shelf: string | null): void;
}
```

- [ ] **Step 4: Implement the origin in the leaf root**

In `src/views/view-leaf.ts`, add `shallowRef` to the `vue` import list, then inside `buildRootComponent`'s `setup()` declare the followed-anchor ref above `const context: ViewContext = {` and use it in the two places below:

```ts
// Set only by the view-level follow writer (Task 2) and cleared by every explicit
// navigation, so refDateOrigin can tell the two apart without a second date.
const followedAnchor = shallowRef<AnchorString | null>(null);

const context: ViewContext = {
  viewId,
  viewName: computed(() => view.value?.name ?? ""),
  refDate: computed(() => leafState.refDate ?? todayAnchor()),
  refDateOrigin: computed(() => (leafState.refDate === followedAnchor.value ? "follow" : "navigate")),
  shelf: computed(() =>
    resolveLeafShelf(leafState.shelf, view.value?.defaultShelf ?? null, (name) => shelves.get(name).isSome()),
  ),
  preview: false,
  setRefDate: (date) => {
    followedAnchor.value = null;
    leafState.refDate = date;
  },
  setShelf: (shelf) => {
    leafState.shelf = shelf;
  },
};
```

- [ ] **Step 5: Give the preview and test contexts a constant origin**

In `src/views/ui/preview-view-context.ts`, import `shallowRef` from `vue` and `type RefDateOrigin` from `../view-context`, then add the field to the object passed to `provideViewContext`, directly after `refDate`:

```ts
    refDateOrigin: shallowRef<RefDateOrigin>("navigate"),
```

In `src/views/testing.ts`, import `type RefDateOrigin` from `./view-context` (extend the existing `import { provideViewContext, type ViewContext } from "./view-context";`) and add the field to `provideViewContextStub`'s defaults, directly after `refDate`:

```ts
    refDateOrigin: ref<RefDateOrigin>("navigate"),
```

- [ ] **Step 6: Write the composable**

Create `src/views/blocks/ui/use-window-anchor.ts`:

```ts
import { computed, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type { AnchorString } from "@/calendar";

import type { RefDateOrigin } from "../../view-context";

export interface WindowAnchorOptions {
  readonly refDate: MaybeRefOrGetter<AnchorString>;
  readonly origin: MaybeRefOrGetter<RefDateOrigin>;
  readonly contains: (date: AnchorString, windowAnchor: AnchorString) => boolean;
}

export function useWindowAnchor(options: WindowAnchorOptions): ComputedRef<AnchorString> {
  const anchor = shallowRef(toValue(options.refDate));

  watch(
    () => toValue(options.refDate),
    (next) => {
      // A note opening moves the selection but should not scroll a grid that already shows it;
      // navigation is an explicit request to move, so it always re-lays-out the window.
      if (toValue(options.origin) === "follow" && options.contains(next, anchor.value)) return;
      anchor.value = next;
    },
  );

  return computed(() => anchor.value);
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/views/blocks/ui/use-window-anchor.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 8: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass. `check:types` is the real guard here — every `ViewContext` literal in the repo must now carry `refDateOrigin`.

- [ ] **Step 9: Commit**

```bash
git add src/views/view-context.ts src/views/view-leaf.ts src/views/ui/preview-view-context.ts src/views/testing.ts src/views/blocks/ui/use-window-anchor.ts src/views/blocks/ui/use-window-anchor.test.ts
git commit -m "feat(views): add a window anchor that separates selection from layout"
```

---

### Task 2: View-level follow setting and the follow writer

Adds the `followActiveDate` setting to the view and the watcher that writes an opened note's date into `refDate`.

**Files:**

- Modify: `src/views/config.ts`
- Modify: `src/views/default-view.ts:35`
- Modify: `src/views/service.ts` (the create-defaults literal near line 82 and the `update` patch type near line 114)
- Modify: `src/views/ui/ViewEditSubpage.vue`
- Modify: `messages/en.json`
- Modify: `src/views/view-leaf.ts`
- Create: `src/views/use-follow-active-note.ts`
- Test: `src/views/use-follow-active-note.test.ts`

**Interfaces:**

- Consumes: `followedAnchor` and the `ViewContext` shape from Task 1.
- Produces:
  - `View.followActiveDate: boolean` (schema default `true`)
  - `export function useFollowActiveNote(options: { enabled: () => boolean; inScope: (journalName: string) => boolean; onFollow: (date: AnchorString) => void }): void` from `src/views/use-follow-active-note.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/use-follow-active-note.test.ts`:

```ts
import { render } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { fixedJournal } from "@/journals/testing";
import { buildNotesCalendarHarness } from "@/notes-calendar/testing";

import { useFollowActiveNote } from "./use-follow-active-note";

function mount(options: { enabled?: boolean; inScope?: (name: string) => boolean } = {}) {
  const harness = buildNotesCalendarHarness({
    journals: {
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
    },
  });
  const followed: AnchorString[] = [];
  const Host = defineComponent({
    setup() {
      useFollowActiveNote({
        enabled: () => options.enabled ?? true,
        inScope: options.inScope ?? (() => true),
        onFollow: (date) => followed.push(date),
      });
      return () => h("div");
    },
  });
  render(Host, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, harness.container) }] },
  });
  return { followed, active: harness.active };
}

beforeAll(() => {
  installTestCalendar();
});

describe("useFollowActiveNote", () => {
  it("writes the opened note's date", async () => {
    const { followed, active } = mount();

    active.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
    await nextTick();

    expect(followed).toEqual(["2026-03-09"]);
  });

  it("writes the week's representative day for a weekly note", async () => {
    // ISO test calendar: the week anchored Mon 2025-12-29 is week 1 of 2026, so the day
    // that carries the week-year is Thu 2026-01-01 — a different day and a different year.
    const { followed, active } = mount();

    active.setActive({ journalName: "weekly", anchor: "2025-12-29" as AnchorString });
    await nextTick();

    expect(followed).toEqual(["2026-01-01"]);
  });

  it("ignores a note of a journal outside the view's scope", async () => {
    const { followed, active } = mount({ inScope: (name) => name === "daily" });

    active.setActive({ journalName: "weekly", anchor: "2026-03-09" as AnchorString });
    await nextTick();

    expect(followed).toEqual([]);
  });

  it("ignores the active note being cleared", async () => {
    const { followed, active } = mount();
    active.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
    await nextTick();

    active.setActive(null);
    await nextTick();

    expect(followed).toEqual(["2026-03-09"]);
  });

  it("stays silent while following is turned off", async () => {
    const { followed, active } = mount({ enabled: false });

    active.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
    await nextTick();

    expect(followed).toEqual([]);
  });

  it("follows a note that is already active when the view mounts", () => {
    const harness = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    harness.active.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
    const followed: AnchorString[] = [];
    const Host = defineComponent({
      setup() {
        useFollowActiveNote({ enabled: () => true, inScope: () => true, onFollow: (date) => followed.push(date) });
        return () => h("div");
      },
    });
    render(Host, {
      global: { plugins: [{ install: (app) => provideInjectorOnApp(app, harness.container) }] },
    });

    expect(followed).toEqual(["2026-03-09"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/views/use-follow-active-note.test.ts`
Expected: FAIL — cannot resolve `./use-follow-active-note`.

- [ ] **Step 3: Write the follow watcher**

Create `src/views/use-follow-active-note.ts`:

```ts
import { watch } from "vue";

import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { CycleService } from "@/journals";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";

export interface FollowActiveNoteOptions {
  readonly enabled: () => boolean;
  readonly inScope: (journalName: string) => boolean;
  readonly onFollow: (date: AnchorString) => void;
}

export function useFollowActiveNote(options: FollowActiveNoteOptions): void {
  const activeEntry = useService(ActiveEntryViewModel);
  const cycle = useService(CycleService);

  watch(
    activeEntry.active,
    (active) => {
      if (!options.enabled()) return;
      if (active === null || !options.inScope(active.journalName)) return;
      // A week's stored anchor is its first day; the representative day is the one whose
      // calendar year is the week-year, which is what a rendered {{date}} must carry.
      const date = cycle
        .representativeOf(active.journalName, active.anchor)
        .map((day) => day.toAnchor())
        .getOr(active.anchor);
      options.onFollow(date);
    },
    { immediate: true },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/views/use-follow-active-note.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Add the view-level setting to the schema**

In `src/views/config.ts`, add the field to `viewSchema` immediately after `rememberDate`:

```ts
  rememberDate: v.optional(v.boolean(), false),
  // Following writes the opened note's date into this view's date; each calendar block's
  // window layout decides whether that actually scrolls its grid.
  followActiveDate: v.optional(v.boolean(), true),
```

and to the `viewsCollection` default factory, after `rememberDate: false,`:

```ts
    followActiveDate: true,
```

In `src/views/default-view.ts`, add `followActiveDate: true,` immediately after `rememberDate: false,` (line 35).

In `src/views/service.ts`, add `followActiveDate: true,` immediately after the `rememberDate: false,` entry in the create-defaults literal (near line 82), and extend the `update` patch pick (near line 114) to:

```ts
    patch: Partial<
      Pick<
        View,
        | "name"
        | "icon"
        | "defaultShelf"
        | "showInRibbon"
        | "leaf"
        | "openOnStartup"
        | "rememberDate"
        | "followActiveDate"
      >
    >,
```

- [ ] **Step 6: Add the copy**

In `messages/en.json`, add these two keys directly after `view_edit_remember_date_description` (line 898):

```json
  "view_edit_follow_active_date_label": "Follow active note",
  "view_edit_follow_active_date_description": "When on, opening a journal note moves this view to that note's date. You can still navigate away from it.",
```

Then run: `npm run compile:i18n`

- [ ] **Step 7: Add the settings row**

In `src/views/ui/ViewEditSubpage.vue`, add the computed directly after `rememberDateValue` (which ends at line 78):

```ts
const followActiveDateValue = computed<boolean>({
  get: () => view.value?.followActiveDate ?? true,
  set: (next) => {
    void viewsService.update(viewId, { followActiveDate: next });
  },
});
```

and the row in the template directly after the remember-date `UiSettingRow` (which ends at line 137):

```html
<UiSettingRow :name="m.view_edit_follow_active_date_label()">
  <template #description>{{ m.view_edit_follow_active_date_description() }}</template>
  <UiToggle v-model="followActiveDateValue" />
</UiSettingRow>
```

- [ ] **Step 8: Wire the watcher into the leaf root**

In `src/views/view-leaf.ts`, add the imports:

```ts
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
```

```ts
import { useFollowActiveNote } from "./use-follow-active-note";
```

(the second goes with the other relative `./` imports, after `./service`).

Then, inside `buildRootComponent`'s `setup()`, directly after the `provideViewContext(context);` call:

```ts
const scope = useShelfScope(() => context.shelf.value);
useFollowActiveNote({
  enabled: () => view.value?.followActiveDate ?? true,
  inScope: (name) => scope.all.value.includes(name),
  onFollow: (date) => {
    followedAnchor.value = date;
    leafState.refDate = date;
  },
});
```

- [ ] **Step 9: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/views/config.ts src/views/default-view.ts src/views/service.ts src/views/ui/ViewEditSubpage.vue src/views/view-leaf.ts src/views/use-follow-active-note.ts src/views/use-follow-active-note.test.ts messages/en.json
git commit -m "feat(views): seed the view date from the active note"
```

---

### Task 3: Month and week calendar blocks use the window anchor

**Files:**

- Modify: `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`
- Modify: `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`
- Modify: `src/views/blocks/calendar-block-schema.ts`
- Modify: `src/views/blocks/month-calendar/month-calendar-block.ts:33`
- Modify: `src/views/blocks/week-calendar/week-calendar-block.ts:33`
- Modify: `src/views/blocks/ui/calendar-block-fields.ts`
- Modify: `src/views/blocks/ui/CalendarBlockConfigFields.vue`
- Test: `src/views/blocks/month-calendar/MonthCalendarBlock.test.ts`
- Test: `src/views/blocks/week-calendar/WeekCalendarBlock.test.ts`
- Test: `src/views/blocks/month-calendar/MonthCalendarBlockConfig.test.ts:57`

**Interfaces:**

- Consumes: `useWindowAnchor` and `ViewContext.refDateOrigin` from Task 1.
- Produces: `MonthCalendarConfig` and `WeekCalendarConfig` no longer carry `followActiveDate`.

- [ ] **Step 1: Rewrite the month block's follow tests**

In `src/views/blocks/month-calendar/MonthCalendarBlock.test.ts`:

Delete the `vi.mock("@/notes-calendar/use-shelf-scope", …)` block together with the `FIXED` / `CUSTOM` constants (lines 45-58), delete the `ACTIVE` ref (line 60), delete the `ActiveEntryViewModel` registration inside `mountBlock`, and delete the now-unused `ActiveEntryViewModel` / `ActiveEntryRef` import. Reduce the `afterEach` to `cleanup();` only. Remove `followActiveDate: true` from `baseConfig`.

Replace `mountBlock` so callers can drive both the date and its origin:

```ts
function mountBlock(config: MonthCalendarConfig, contextOverride: Partial<ViewContext> = {}) {
  const container = new Container();
  const context = provideViewContextStub(contextOverride);
  const renderRoot = () => h(monthCalendarBlock.component, { instanceId: "block-1" as BlockInstanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  return render(Wrapper, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}
```

Delete the five follow tests (from `"recenters to the active note's month when it is off-window and following"` through `"returns to the reference month when the active note becomes out of scope"`, lines 137-181) and replace them with the two below.

These are deliberately the _only_ two: a followed date that falls **outside** the window re-lays-out to exactly the same place a navigated one would, so an "off-window follow" test cannot fail while the "inside" pair passes. Both tests use `before: 1, after: 1` — with a single-period window, hold and re-center are indistinguishable by construction.

```ts
it("holds the window on a followed date that is already visible", async () => {
  const refDate = ref("2026-05-15" as AnchorString);
  const refDateOrigin = ref<RefDateOrigin>("navigate");
  const { getAllByTestId } = mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });

  refDateOrigin.value = "follow";
  refDate.value = "2026-04-02" as AnchorString;
  await nextTick();

  expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-04-01");
});

it("re-centers the window on a navigated date that it already contained", async () => {
  const refDate = ref("2026-05-15" as AnchorString);
  const refDateOrigin = ref<RefDateOrigin>("navigate");
  const { getAllByTestId } = mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });

  refDate.value = "2026-04-02" as AnchorString;
  await nextTick();

  expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-03-01");
});
```

Add `import type { RefDateOrigin } from "../../view-context";` to the type imports (the file already imports `provideViewContext, type ViewContext` from `"../../view-context"` — extend that import instead).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/views/blocks/month-calendar/MonthCalendarBlock.test.ts`
Expected: FAIL — the block still derives its window through `useFollowActiveDate`, which ignores `refDateOrigin` and clears its local focus on every `refDate` change, so the "holds the window" assertion re-centers to `2026-03-01` instead of staying on `2026-04-01`.

- [ ] **Step 3: Rewire the month block**

In `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`, replace the `useFollowActiveDate` import with the new composable, drop the `useShelfScope` import and its `scope` const (it was only feeding `inScope`), and swap the focus computation:

```ts
import { useResolvedWeekPlacement } from "@/calendar";
import { usePeriodWindow } from "@/calendar/ui";
import NotesMonthView from "@/notes-calendar/ui/NotesMonthView.vue";

import { useViewContext } from "../../../view-context";
import { monthWindowContains } from "../../ui/follow-visibility";
import { useWindowAnchor } from "../../ui/use-window-anchor";
```

```ts
const viewContext = useViewContext();

const focus = useWindowAnchor({
  refDate: viewContext.refDate,
  origin: viewContext.refDateOrigin,
  contains: (date, anchor) => monthWindowContains(date, anchor, props.config.before, props.config.after),
});
```

Everything below (`usePeriodWindow`, `outsideDates`, `weekPlacement`, the template) is unchanged.

- [ ] **Step 4: Rewire the week block**

In `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`, make the same swap:

```ts
const focus = useWindowAnchor({
  refDate: viewContext.refDate,
  origin: viewContext.refDateOrigin,
  contains: (date, anchor) => weekWindowContains(date, anchor, props.config.before, props.config.after),
});
```

with imports adjusted the same way — drop `useFollowActiveDate` and `useShelfScope` (and its `scope` const), add `useWindowAnchor` from `"../../ui/use-window-anchor"`.

- [ ] **Step 5: Drop the block-level flag**

In `src/views/blocks/calendar-block-schema.ts`, delete the `followActiveDate: v.optional(v.boolean()),` line.

In `src/views/blocks/month-calendar/month-calendar-block.ts` and `src/views/blocks/week-calendar/week-calendar-block.ts`, delete the `followActiveDate: true,` entry from each `defaultConfig` (line 33 in both).

In `src/views/blocks/ui/calendar-block-fields.ts`, delete the `followActiveDate?: boolean;` field.

In `src/views/blocks/ui/CalendarBlockConfigFields.vue`, delete the first `UiSettingRow` in the template — the one wrapping `m.view_block_config_follow_active_date_label()` and its `UiToggle`.

- [ ] **Step 6: Fix the remaining block config tests**

In `src/views/blocks/month-calendar/MonthCalendarBlockConfig.test.ts`, delete the `followActiveDate: false,` entry (line 57).

In `src/views/blocks/week-calendar/WeekCalendarBlock.test.ts`: remove `followActiveDate: true` from `baseConfig`; delete the `vi.mock("@/notes-calendar/use-shelf-scope", …)` block and the `FIXED` constant; delete the `ACTIVE` ref and the `ActiveEntryViewModel` registration in `mountBlock` plus its imports; reduce `afterEach` to `cleanup();`. Delete the three follow tests (`"recenters to the active note's week when it is off-window and following"`, `"stays on the reference week when following is off"`, `"returns to the reference week when the active note clears"`) and replace them with the pair below.

Both move the date to `2026-05-22`, which is ISO week 21 while `2026-05-15` is week 20 — a different week, but still inside a `before: 1, after: 1` window. A date in the _same_ week as the start (e.g. `2026-05-16`, also week 20) would pass under both origins and prove nothing.

```ts
it("holds the window on a followed date that is already visible", async () => {
  const refDate = ref("2026-05-15" as AnchorString);
  const refDateOrigin = ref<RefDateOrigin>("navigate");
  const { getAllByTestId } = mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });
  const start = getAllByTestId("week-stub")[0]?.dataset.week;

  refDateOrigin.value = "follow";
  refDate.value = "2026-05-22" as AnchorString;
  await nextTick();

  expect(getAllByTestId("week-stub")[0]?.dataset.week).toBe(start);
});

it("re-centers the window on a navigated date that it already contained", async () => {
  const refDate = ref("2026-05-15" as AnchorString);
  const refDateOrigin = ref<RefDateOrigin>("navigate");
  const { getAllByTestId } = mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });
  const start = getAllByTestId("week-stub")[0]?.dataset.week;

  refDate.value = "2026-05-22" as AnchorString;
  await nextTick();

  expect(getAllByTestId("week-stub")[0]?.dataset.week).not.toBe(start);
});
```

Add `import type { RefDateOrigin } from "../../view-context";` to the existing `"../../view-context"` import. If deleting the old tests leaves the file's `addSixDays` helper unused, delete it too — `check:lint` will say so.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/views/blocks/month-calendar src/views/blocks/week-calendar`
Expected: PASS.

- [ ] **Step 8: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass. `check:types` catches any remaining `followActiveDate` in a typed month/week config literal.

- [ ] **Step 9: Commit**

```bash
git add src/views/blocks/month-calendar src/views/blocks/week-calendar src/views/blocks/calendar-block-schema.ts src/views/blocks/ui/calendar-block-fields.ts src/views/blocks/ui/CalendarBlockConfigFields.vue
git commit -m "refactor(views): render month and week grids from the window anchor"
```

---

### Task 4: Custom-intervals block reads the view date directly

**Deliberate deviation from the spec's "Block wiring" bullet, which listed this block under `useWindowAnchor`.** `resolveWindow(kind, anchor)` (`window-resolution.ts:12`) always returns the single `week`/`month`/`quarter`/`year` period _containing_ the anchor, so `contains(date, anchor)` is true exactly when both fall in the same period — and re-centering on a date in the same period yields the identical window. Holding and re-centering are therefore indistinguishable here for every input, which makes a window anchor pure dead state and any test of it a tautology. The block reads `context.refDate` directly instead. Month and week blocks are different: with `before`/`after` above zero their windows overlap, so holding is genuinely observable.

This is a removal task, so there is no failing test to write first — the tests being deleted encode behavior the spec removes.

**Files:**

- Modify: `src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue`
- Modify: `src/views/blocks/custom-intervals/custom-intervals-block.ts:22,34`
- Modify: `src/views/blocks/custom-intervals/ui/CustomIntervalsBlockConfig.vue:38-45`
- Test: `src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts`

**Interfaces:**

- Consumes: `ViewContext.refDate` as the view's selected date.
- Produces: `CustomIntervalsConfig` no longer carries `followActiveDate`.

- [ ] **Step 1: Delete the follow tests**

In `src/views/blocks/custom-intervals/CustomIntervalsBlock.test.ts`, delete the two follow tests — `"recenters the window to the active note's interval when it is off-window and following"` and `"keeps the window on the reference date when following is off"`. The surviving tests already assert that the rendered window tracks `refDate`, which is the whole remaining contract.

- [ ] **Step 2: Rewire the block**

In `src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue`, delete the `useFollowActiveDate` import and the whole `const focus = useFollowActiveDate({ … })` block (lines 46-54), then point the window at the view date:

```ts
const window = computed(() => resolveWindow(props.config.window, context.refDate.value));
```

Delete the now-unused `spanContains` import from `"../../ui/follow-visibility"`. Keep `activeEntry` (it still drives `isEntryActive`), `scope` and `displayedJournals` exactly as they are.

- [ ] **Step 3: Drop the block-level flag**

In `src/views/blocks/custom-intervals/custom-intervals-block.ts`, delete `followActiveDate: v.optional(v.boolean()),` from the schema (line 22) and `followActiveDate: true` from `defaultConfig` (line 34).

In `src/views/blocks/custom-intervals/ui/CustomIntervalsBlockConfig.vue`, delete the `UiSettingRow` wrapping `m.view_block_config_follow_active_date_label()` and its `UiToggle` (lines 38-45).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/views/blocks/custom-intervals`
Expected: PASS — the surviving window and decoration tests still hold.

- [ ] **Step 5: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/blocks/custom-intervals
git commit -m "refactor(views): render the custom-intervals window from the view date"
```

---

### Task 5: Markdown template renders the view's date, and the old composable is deleted

**Files:**

- Modify: `src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.vue`
- Modify: `src/views/blocks/markdown-template/markdown-template-block.ts:11,22`
- Modify: `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue:35-42`
- Modify: `messages/en.json` and the nine other `messages/*.json` locale files
- Modify: `src/notes-calendar/index.ts:7`
- Delete: `src/notes-calendar/use-follow-active-date.ts`
- Delete: `src/notes-calendar/use-follow-active-date.test.ts`
- Test: `src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.test.ts`

**Interfaces:**

- Consumes: `ViewContext.refDate` carrying the followed note's representative day (Task 2).
- Produces: `MarkdownTemplateConfig` is `{ templatePath: string }` only.

- [ ] **Step 1: Rewrite the block's date tests**

In `src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.test.ts`:

Delete the four active-note tests — `"resolves {{date}} to the active note's anchor"`, `"resolves {{date}} to the representative day when the active note is a weekly entry"`, `"re-renders {{date}} when the active note changes"` and `"uses the reference date for {{date}} when following is disabled"`. The first two behaviors now live in `src/views/use-follow-active-note.test.ts`; the last two are covered by the surviving `"falls back to the focused refDate for {{date}} when no journal note is active"` and `"re-renders when the focused date changes"`.

Rename `"falls back to the focused refDate for {{date}} when no journal note is active"` to `"resolves {{date}} to the view's date"` and drop its now-meaningless framing:

```ts
it("resolves {{date}} to the view's date", async () => {
  seedAndMount(
    { "templates/today.md": "Today is {{date}}" },
    { templatePath: "templates/today.md" },
    "2026-05-15" as AnchorString,
  );
  expect(await screen.findByText("Today is 2026-05-15")).toBeTruthy();
});
```

Then strip `seedAndMount` down: delete its `activeEntry` parameter, the `activeRef` const, the `activeRef` entry in the returned object, and the `ActiveEntryViewModel`, `CycleService`, `JournalsIndex` and `JournalsRepository` registrations. Delete the now-unused imports (`CycleService`, `JournalsIndex`, `JournalsRepository`, `fakeRepo`, `fixedJournal`, `ActiveEntryViewModel`, `ActiveEntryRef`, `shallowRef`). The component now needs only `NotesService`, `TemplateEngine` and `MarkdownRenderService`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/views/blocks/markdown-template`
Expected: FAIL — the component still resolves `ActiveEntryViewModel` and `CycleService` from the container, which no longer registers them.

- [ ] **Step 3: Rewire the block**

In `src/views/blocks/markdown-template/ui/MarkdownTemplateBlock.vue`, delete the `ActiveEntryViewModel`, `CycleService` and `Option` imports along with the `activeEntry` and `cycle` service lookups, and simplify `rendered`:

```ts
const rendered = computed(() => {
  if (rawTemplate.value === null) return "";
  const focus = CalendarDate.fromAnchor(viewContext.refDate.value);
  const clockSpec = { kind: "clock", value: Clock.now(), defaultFormat: "HH:mm" } as const;
  const context = TemplateContext.empty()
    .date("date", focus, "YYYY-MM-DD")
    .date("current_date", CalendarDate.today(), "YYYY-MM-DD", { invertible: false })
    .withSpec("time", clockSpec)
    .withSpec("current_time", clockSpec);
  return engine.renderString(rawTemplate.value, context);
});
```

- [ ] **Step 4: Drop the block-level flag**

In `src/views/blocks/markdown-template/markdown-template-block.ts`, reduce the schema (line 11) to:

```ts
const schema = v.object({ templatePath: v.optional(v.string(), "") });
```

and the `defaultConfig` (line 22) to `{ templatePath: "" }`.

In `src/views/blocks/markdown-template/ui/MarkdownTemplateBlockConfig.vue`, delete the `UiSettingRow` wrapping `m.view_block_config_follow_active_date_label()` and its `UiToggle` (lines 35-42).

- [ ] **Step 5: Retire the block-level message**

Delete the `"view_block_config_follow_active_date_label"` entry from `messages/en.json` and from each of `messages/de.json`, `messages/es.json`, `messages/fr.json`, `messages/it.json`, `messages/ja.json`, `messages/ko.json`, `messages/pt.json`, `messages/ru.json`, `messages/uk.json`.

Verify none remain: `grep -rn "view_block_config_follow_active_date_label" messages/ src/` must print nothing.

Then run: `npm run compile:i18n`

- [ ] **Step 6: Delete the superseded composable**

```bash
git rm src/notes-calendar/use-follow-active-date.ts src/notes-calendar/use-follow-active-date.test.ts
```

In `src/notes-calendar/index.ts`, delete line 7:

```ts
export { useFollowActiveDate, type FollowActiveDateOptions } from "./use-follow-active-date";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/views/blocks/markdown-template`
Expected: PASS.

- [ ] **Step 8: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass. Nothing should still import `useFollowActiveDate`.

- [ ] **Step 9: Commit**

```bash
git add src/views/blocks/markdown-template src/notes-calendar/index.ts src/notes-calendar/use-follow-active-date.ts src/notes-calendar/use-follow-active-date.test.ts messages/
git commit -m "refactor(views): render the markdown template from the view date"
```

---

### Task 6: Defined navigation falls back to the view's date

Today `referenceAnchor()` falls back to _today_ when no journal note is active, so after navigating the calendar to August "next note" still searches from today. With a single view date the correct fallback is that date.

**Files:**

- Modify: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue:47-51`
- Test: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`

**Interfaces:**

- Consumes: `ViewContext.refDate` as the view's selected date.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to the `describe("DefinedNavigationItem", …)` block in `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`:

```ts
it("searches from the view's date when no journal note is active", async () => {
  SCOPE.day = ["daily"];
  const { result, flows } = mountItem(
    { target: "day", direction: "next" },
    { active: null, entries: [{ journalName: "daily", anchor: "2026-06-10" }] },
    { refDate: ref("2026-06-01" as AnchorString) },
  );

  await userEvent.click(result.getByRole("button"));

  expect(flows.calls[0]?.parameters).toMatchObject({ anchor: "2026-06-10" });
});
```

The stub context's default `refDate` is `2026-01-01`; pinning it to `2026-06-01` and seeding a single later entry means the assertion only passes if the search started from the view's date rather than from today. Add `ref` to the `vue` import if it is not already there.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/views/toolbar-items/defined-navigation`
Expected: FAIL — the search starts from `CalendarDate.today()`, so the nearest later entry relative to today is not `2026-06-10` (and on a run after that date there is no next entry at all, producing a notice instead of a flow call).

- [ ] **Step 3: Change the fallback**

In `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue`:

```ts
function referenceAnchor(): AnchorString {
  const active = activeVM.active.value;
  if (active && candidates.value.includes(active.journalName)) return active.anchor;
  return context.refDate.value;
}
```

Delete the now-unused `import { CalendarDate } from "@/calendar";` (keep the `import type { AnchorString } from "@/calendar";` line).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/views/toolbar-items/defined-navigation`
Expected: PASS.

- [ ] **Step 5: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/toolbar-items/defined-navigation
git commit -m "fix(views): search defined navigation from the view date"
```

---

### Task 7: End-to-end proof that navigation steps from the opened note

The defect only appears in a real leaf where a note open and a toolbar click meet. This is the test that fails if any part of the change is reverted.

**Files:**

- Modify: `e2e/journeys/view.e2e.ts` (the `describe("toolbar", …)` block starting at line 329)

**Interfaces:**

- Consumes: the whole feature, end to end.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

In `e2e/journeys/view.e2e.ts`, add this helper next to `headerMonthAnchor` (line 62):

```ts
// The month grid's header cell carries the month's first day, so a month expectation is
// expressed as an anchor rather than a name.
const monthStartOf = (anchor: string, offset = 0): string => {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
};
```

and add this test at the end of the `describe("toolbar", …)` block:

```ts
// The regression this guards: the calendar used to keep a private focus for the opened
// note while the toolbar kept stepping the untouched reference date, so "next month"
// jumped from the followed month to (previous reference + 1) instead of stepping one
// month on from what was on screen.
it("steps a month on from the opened note's month rather than from the previous date", async () => {
  await openCalendarView();

  // ~4 months out, so the note's month differs both from today's and from today + 1
  // month; a passing assertion cannot be produced by the old behavior.
  const base = new Date(`${todayAnchor()}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + 120);
  const far = base.toISOString().slice(0, 10);
  const path = `day/${far}.md`;
  await seedNote(path, `---\njournal: daily\njournal-date: ${far}\n---\n`);
  await waitForJournalFrontmatter(path, { journal: "daily", date: far });

  await openNote(path);
  await waitForState(
    headerMonthAnchor,
    (anchor) => anchor === monthStartOf(far),
    "calendar did not move to the opened note's month",
  );

  await $(`${TOOLBAR} [aria-label="Next month"]`).click();

  await waitForState(
    headerMonthAnchor,
    (anchor) => anchor === monthStartOf(far, 1),
    "next month did not step on from the opened note's month",
  );
});
```

`seedNote`, `openNote`, `todayAnchor`, `waitForJournalFrontmatter`, `waitForState`, `$` and `TOOLBAR` are already imported by this file.

- [ ] **Step 2: Run the e2e suite to verify the new test fails on the pre-change build**

Run: `git stash && npm run test:e2e -- --spec ./e2e/journeys/view.e2e.ts; git stash pop`
Expected: the new test FAILS with "calendar did not move to the opened note's month" or "next month did not step on from the opened note's month". If it passes on the stashed build, the note is not far enough from today — widen the offset and repeat.

Note: `git stash` here stashes only the e2e edit, since Tasks 1-6 are already committed.

- [ ] **Step 3: Run the e2e suite against the implemented build**

Run: `npm run test:e2e -- --spec ./e2e/journeys/view.e2e.ts`
Expected: PASS, including the two pre-existing next/previous-month tests and the follow tests in `e2e/journeys/view-blocks.e2e.ts` (run that spec too: `npm run test:e2e -- --spec ./e2e/journeys/view-blocks.e2e.ts`).

- [ ] **Step 4: Run the full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/journeys/view.e2e.ts
git commit -m "test(e2e): step the calendar on from the opened note's month"
```

---

## Manual verification

After Task 7, open the plugin in a real vault and confirm the four symptoms from the spec's Problem section are gone:

1. Open a journal note several months from today, then press "next month" — the grid steps one month on from that note, not from the pre-open date.
2. Open a note in a past month, then press "Today" — the calendar returns to today.
3. Open a note in a past month, then open the date picker — it is pre-selected on that note's period.
4. In a view with a markdown-template block, open a journal note then navigate — `{{date}}` moves with the calendar.
5. Turn the view's new "Follow active note" toggle off, then open a journal note — the calendar does not move.
