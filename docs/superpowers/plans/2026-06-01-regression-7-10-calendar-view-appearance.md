# Regressions #7–#10 — Calendar view placement & appearance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore v2 calendar placement (left/right/tab), today highlight, configurable today/active highlight colors, and week-number column position — re-homed into v3's per-view / per-block / global-slice architecture.

**Architecture:** Placement is a per-view `leaf` field honored by `ViewHostService`. The today marker is a property of the generic `NotesCalendarCell`. Highlight colors are a new global `appearance` settings slice applied as `body` CSS custom properties by a bridge. The week-number column is a per-block `weeks` setting on the month/week-calendar blocks.

**Tech Stack:** TypeScript, Vue 3 SFCs, valibot schemas, ts-pattern, vitest + @testing-library/vue, paraglide i18n, Obsidian API.

**Spec:** `docs/superpowers/specs/2026-06-01-regression-7-10-calendar-view-appearance-design.md`

**Conventions (this repo):**

- Every task ends by running `npm test`, `npm run check:types`, `npm run check:lint` (all must pass before commit).
- Colocate `*.test.ts` with implementation. No `eslint-disable`. No `Co-Authored-By` trailer. Commit to the current branch (`v3-ai`); never branch.
- ts-pattern `match().with().exhaustive()` over `switch`. Field-initializer `readonly #x = inject(...)` over constructor-body assignment.
- New i18n message keys go in `messages/en.json` (flat keys); run `npm run compile:i18n` to regenerate `src/i18n/paraglide`. Wiring-only UI (binding a field to a dropdown) is not unit-tested per repo convention.

---

## Task 1: #8 — Today marker on `NotesCalendarCell`

**Files:**

- Modify: `src/notes-calendar/ui/NotesCalendarCell.vue`
- Test: `src/notes-calendar/ui/NotesCalendarCell.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block inside the top-level `describe("NotesCalendarCell", …)` in `src/notes-calendar/ui/NotesCalendarCell.test.ts`. Also add `CalendarDate` to the existing `@/calendar` import (`import { DayPeriod, CalendarDate } from "@/calendar";`).

```ts
describe("today marker", () => {
  it("renders data-today when the cell's period contains today", () => {
    vi.spyOn(CalendarDate, "today").mockReturnValue(date("2026-05-25"));
    const { container } = mount({ period: may25, cell: stubApi() });
    const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
    expect(cell?.dataset.today).toBe("true");
  });

  it("omits data-today when the cell's period does not contain today", () => {
    vi.spyOn(CalendarDate, "today").mockReturnValue(date("2026-01-01"));
    const { container } = mount({ period: may25, cell: stubApi() });
    const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
    expect(cell?.dataset.today).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/notes-calendar/ui/NotesCalendarCell.test.ts`
Expected: FAIL — `data-today` is never rendered (`dataset.today` is `undefined` in the first test).

- [ ] **Step 3: Implement the today computed + attribute**

In `src/notes-calendar/ui/NotesCalendarCell.vue`, add `CalendarDate` to the `@/calendar` import and a computed, then bind the attribute.

Script — add the import and computed (next to `isActive`/`isInactive`):

```ts
import type { Period } from "@/calendar";
import { CalendarDate } from "@/calendar";
```

```ts
const isToday = computed(() => rawPeriod.value.contains(CalendarDate.today()));
```

Template — add the attribute on the `<span class="notes-calendar-cell" …>` element, after `:data-inactive`:

```html
:data-today="isToday || null"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/notes-calendar/ui/NotesCalendarCell.test.ts`
Expected: PASS (all cell tests).

- [ ] **Step 5: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/notes-calendar/ui/NotesCalendarCell.vue src/notes-calendar/ui/NotesCalendarCell.test.ts
git commit -m "feat(notes-calendar): mark the cell covering today with data-today"
```

---

## Task 2: #7 — `leaf` placement field on the view schema

**Files:**

- Modify: `src/views/config.ts`
- Modify: `src/views/default-view.ts`
- Test: `src/views/config.test.ts`, `src/views/default-view.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/views/config.test.ts`, add a test asserting the collection factory defaults `leaf` to `"right"`. Match the file's existing import of `viewsCollection` (check the top of the file; it imports from `./config`). Add:

```ts
describe("viewsCollection factory", () => {
  it("defaults a new view's leaf placement to right", () => {
    const created = viewsCollection.create("11111111-1111-4111-8111-111111111111");
    expect(created.leaf).toBe("right");
  });
});
```

> If `viewsCollection.create` is not the factory accessor used elsewhere in this test file, mirror whatever accessor the existing tests use to build a default record; the assertion (`leaf === "right"`) is the point.

In `src/views/default-view.test.ts`, add:

```ts
it("seeds the default calendar view into the right sidebar", () => {
  expect(defaultCalendarView().leaf).toBe("right");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/views/config.test.ts src/views/default-view.test.ts`
Expected: FAIL — `leaf` is `undefined` (property does not exist yet; types will also complain).

- [ ] **Step 3: Add `leaf` to the schema, factory, and seed**

`src/views/config.ts` — add the field to `viewSchema` (after `showInRibbon`):

```ts
export const viewSchema = v.object({
  id: viewIdSchema,
  name: v.pipe(v.string(), v.minLength(1)),
  icon: v.pipe(v.string(), v.minLength(1)),
  defaultShelf: v.nullable(v.string()),
  showInRibbon: v.boolean(),
  leaf: v.optional(v.picklist(["left", "right", "tab"]), "right"),
  blocks: v.array(viewBlockInstanceSchema),
});
```

In the same file, add `leaf: "right"` to the `viewsCollection` factory default object (the third argument to `defineCollection`):

```ts
  (id) => ({
    id: id as ViewId,
    name: id,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    leaf: "right",
    blocks: [],
  }),
```

`src/views/default-view.ts` — add `leaf: "right"` to the returned object in `defaultCalendarView()` (after `showInRibbon: true,`):

```ts
    showInRibbon: true,
    leaf: "right",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/views/config.test.ts src/views/default-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass. (The `View` type now carries `leaf`; the `seedView` helper in `view-host.test.ts` omits it but that test file builds `View` literals — if `check:types` flags a missing `leaf`, add `leaf: "right"` to `seedView`'s default object in `src/views/view-host.test.ts`.)

- [ ] **Step 6: Commit**

```bash
git add src/views/config.ts src/views/default-view.ts src/views/config.test.ts src/views/default-view.test.ts src/views/view-host.test.ts
git commit -m "feat(views): add per-view leaf placement field (left/right/tab)"
```

---

## Task 3: #7 — `ViewHostService` honors `leaf` when opening

**Files:**

- Modify: `src/infrastructure/host/internal/testing.ts` (extend fake workspace)
- Modify: `src/views/view-host.ts`
- Test: `src/views/view-host.test.ts`

- [ ] **Step 1: Extend the fake workspace to support leaf placement**

In `src/infrastructure/host/internal/testing.ts`:

1a. Add three fields to the `FakeWorkspaceState` interface (after `detachedTypes: string[];`):

```ts
viewStateCalls: {
  type: string;
  placement: "left" | "right" | "tab";
}
[];
revealedLeaves: number;
sidebarLeafAvailable: boolean;
```

1b. Initialize them in the `workspaceState` literal (after `detachedTypes: [],`):

```ts
    viewStateCalls: [],
    revealedLeaves: 0,
    sidebarLeafAvailable: true,
```

1c. In `workspaceApi`, replace the existing `getLeaf` and add `getLeftLeaf`/`getRightLeaf`/`revealLeaf`. Add a `makeLeaf` helper just above `getLeaf` so all leaf getters return a leaf that records both `openFile` (existing behavior) and `setViewState` (new):

```ts
    getLeaf(_mode: PaneType | false) {
      return makeLeaf("tab");
    },
    getLeftLeaf(_split: boolean) {
      return workspaceState.sidebarLeafAvailable ? makeLeaf("left") : null;
    },
    getRightLeaf(_split: boolean) {
      return workspaceState.sidebarLeafAvailable ? makeLeaf("right") : null;
    },
    revealLeaf(_leaf: unknown): void {
      workspaceState.revealedLeaves++;
    },
```

Define `makeLeaf` as a local function inside `createFakeHost` (place it just before `const workspaceApi = {`):

```ts
function makeLeaf(placement: "left" | "right" | "tab") {
  return {
    async openFile(file: TFile): Promise<void> {
      workspaceState.openPaths.add(file.path);
      workspaceState.openCalls.push({ path: file.path, mode: placement === "tab" ? false : placement });
      workspaceState.activeFile = file;
    },
    async setViewState(state: { type: string }): Promise<void> {
      workspaceState.viewStateCalls.push({ type: state.type, placement });
    },
  };
}
```

> Note: the pre-existing `getLeaf` returned a leaf whose `openCalls` mode was the passed `mode`. `OpenJournalEntryFlow` calls `getLeaf(...).openFile(...)`; its tests assert on `openCalls[].path`, not `.mode`, so recording `false` for tab placement is compatible. If `check:types`/tests flag a mode mismatch, keep `openFile`'s `mode` as the original `_mode` param instead — only `setViewState` recording matters for this task.

- [ ] **Step 2: Write the failing tests**

Add a `describe("open placement", …)` block to `src/views/view-host.test.ts`. The service's `#open` is private; trigger it through the registered command's `execute` callback (the command descriptor's `execute` calls `#open`). Add a helper that pulls the command and invokes it:

```ts
describe("open placement", () => {
  function openVia(host: ReturnType<typeof build>["host"], id: string): void {
    host.commands.get(`journal:open-view:${id}`)?.callback?.();
  }

  it("opens a left-placed view via the left sidebar leaf", async () => {
    const { host } = build({ a: seedView("a", { leaf: "left" }) });
    openVia(host, "a");
    await Promise.resolve();
    expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "left" }]);
  });

  it("opens a right-placed view via the right sidebar leaf", async () => {
    const { host } = build({ a: seedView("a", { leaf: "right" }) });
    openVia(host, "a");
    await Promise.resolve();
    expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "right" }]);
  });

  it("opens a tab-placed view via a main-area tab", async () => {
    const { host } = build({ a: seedView("a", { leaf: "tab" }) });
    openVia(host, "a");
    await Promise.resolve();
    expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "tab" }]);
  });

  it("falls back to a main-area tab when the sidebar leaf is unavailable", async () => {
    const { host } = build({ a: seedView("a", { leaf: "right" }) });
    host.workspace.sidebarLeafAvailable = false;
    openVia(host, "a");
    await Promise.resolve();
    expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "tab" }]);
  });
});
```

> Verify the command descriptor field name used to invoke a command in this fake. `view-host.test.ts` reads `host.commands.get(...)?.name`; the `CommandService`/fake stores an Obsidian `Command` whose handler is `callback`. If the registered command exposes the handler under a different key (e.g. `checkCallback`), call that instead — the assertion on `viewStateCalls` is the contract.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/views/view-host.test.ts`
Expected: FAIL — `#open` calls `getLeaf(true)` unconditionally, so every case records `placement: "tab"` (left/right/fallback assertions fail).

- [ ] **Step 4: Implement placement in `ViewHostService`**

`src/views/view-host.ts`:

4a. Add the ts-pattern import at the top:

```ts
import { match } from "ts-pattern";
```

4b. Replace `#open` and add `#leafFor`:

```ts
  async #open(id: ViewId): Promise<void> {
    const view = this.#getView(id);
    const leaf = this.#leafFor(view?.leaf ?? "right");
    await leaf.setViewState({ type: viewTypeOf(id), active: true });
    this.#app.workspace.revealLeaf(leaf);
  }

  #leafFor(placement: "left" | "right" | "tab"): WorkspaceLeaf {
    const leaf = match(placement)
      .with("left", () => this.#app.workspace.getLeftLeaf(false))
      .with("right", () => this.#app.workspace.getRightLeaf(false))
      .with("tab", () => null)
      .exhaustive();
    return leaf ?? this.#app.workspace.getLeaf(true);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/views/view-host.test.ts`
Expected: PASS.

- [ ] **Step 6: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/views/view-host.ts src/views/view-host.test.ts src/infrastructure/host/internal/testing.ts
git commit -m "feat(views): open views in left/right sidebar or tab per leaf setting"
```

---

## Task 4: #7 — "Open in" dropdown in `ViewEditSubpage` (wiring + i18n)

**Files:**

- Modify: `messages/en.json`
- Modify: `src/views/ui/ViewEditSubpage.vue`

This is field-binding wiring (a dropdown writing `leaf` through `viewsService.update`), not unit-tested per repo convention. Verified manually.

- [ ] **Step 1: Add i18n messages**

Add these flat keys to `messages/en.json` (next to the other `view_edit_*` keys):

```json
  "view_edit_leaf_label": "Open in",
  "view_edit_leaf_left": "Left sidebar",
  "view_edit_leaf_right": "Right sidebar",
  "view_edit_leaf_tab": "New tab",
```

- [ ] **Step 2: Regenerate paraglide messages**

Run: `npm run compile:i18n`
Expected: `src/i18n/paraglide` updated; `m.view_edit_leaf_label` etc. now exist.

- [ ] **Step 3: Add the computed + dropdown row**

`src/views/ui/ViewEditSubpage.vue` — add a `leafValue` computed beside `ribbonValue`:

```ts
const leafValue = computed<string>({
  get: () => view.value?.leaf ?? "right",
  set: (next) => {
    void viewsService.update(viewId, { leaf: next as "left" | "right" | "tab" });
  },
});
```

Add a `UiSettingRow` after the "Show in ribbon" row (before the blocks `UiCollapsibleBlock`):

```html
<UiSettingRow :name="m.view_edit_leaf_label()">
  <UiDropdown v-model="leafValue">
    <option value="left">{{ m.view_edit_leaf_left() }}</option>
    <option value="right">{{ m.view_edit_leaf_right() }}</option>
    <option value="tab">{{ m.view_edit_leaf_tab() }}</option>
  </UiDropdown>
</UiSettingRow>
```

(`UiDropdown` is already imported in this file.)

- [ ] **Step 4: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json src/i18n/paraglide src/views/ui/ViewEditSubpage.vue
git commit -m "feat(views): add Open-in placement selector to the view editor"
```

---

## Task 5: #10 — `weeks` setting on month/week-calendar blocks (schema, defaults, config UI)

**Files:**

- Modify: `src/views/blocks/month-calendar/month-calendar-block.ts`
- Modify: `src/views/blocks/week-calendar/week-calendar-block.ts`
- Modify: `src/views/blocks/month-calendar/ui/MonthCalendarBlockConfig.vue`
- Modify: `src/views/blocks/week-calendar/ui/WeekCalendarBlockConfig.vue`
- Modify: `src/views/default-view.ts`
- Modify: `messages/en.json`
- Test: `src/views/blocks/month-calendar/month-calendar-block.test.ts`, `src/views/blocks/week-calendar/week-calendar-block.test.ts`

> If a `*-block.test.ts` does not exist for a block, create it next to the block file with the standard imports (`import { describe, expect, it } from "vitest";` and the block under test).

- [ ] **Step 1: Write the failing tests**

In `src/views/blocks/month-calendar/month-calendar-block.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { monthCalendarBlock } from "./month-calendar-block";

describe("monthCalendarBlock", () => {
  it("defaults the week-number column to left", () => {
    expect(monthCalendarBlock.defaultConfig.weeks).toBe("left");
  });

  it("parses a stored config missing weeks as left", () => {
    const parsed = v.parse(monthCalendarBlock.schema, { before: 0, after: 0, hideWeekends: false });
    expect(parsed.weeks).toBe("left");
  });

  it("rejects an unknown weeks value", () => {
    const result = v.safeParse(monthCalendarBlock.schema, {
      before: 0,
      after: 0,
      hideWeekends: false,
      weeks: "middle",
    });
    expect(result.success).toBe(false);
  });
});
```

Mirror the same three tests in `src/views/blocks/week-calendar/week-calendar-block.test.ts` against `weekCalendarBlock`.

> `defineViewBlock` returns the definition object including `schema` and `defaultConfig` — confirm these property names by reading `src/views/define-view-block.ts`; adjust the accessors if they differ (e.g. `.config.defaultConfig`). The contract (`weeks` defaults to `"left"`, unknown rejected) is the point.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/views/blocks/month-calendar/month-calendar-block.test.ts src/views/blocks/week-calendar/week-calendar-block.test.ts`
Expected: FAIL — `weeks` is absent from schema and `defaultConfig`.

- [ ] **Step 3: Add `weeks` to both block schemas + defaults**

`src/views/blocks/month-calendar/month-calendar-block.ts` — add to `schema` and `defaultConfig`:

```ts
const schema = v.object({
  before: v.pipe(v.number(), v.integer(), v.minValue(0)),
  after: v.pipe(v.number(), v.integer(), v.minValue(0)),
  hideWeekends: v.boolean(),
  weeks: v.optional(v.picklist(["none", "left", "right"]), "left"),
});
```

```ts
  defaultConfig: { before: 0, after: 0, hideWeekends: false, weeks: "left" },
```

Apply the identical two edits to `src/views/blocks/week-calendar/week-calendar-block.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/views/blocks/month-calendar/month-calendar-block.test.ts src/views/blocks/week-calendar/week-calendar-block.test.ts`
Expected: PASS.

- [ ] **Step 5: Seed `weeks` in the default view + add i18n**

`src/views/default-view.ts` — update the month-calendar block config in the seed:

```ts
{ id: MONTH_CALENDAR_BLOCK_ID, key: "month-calendar", config: { before: 0, after: 0, hideWeekends: false, weeks: "left" } },
```

Add i18n keys to `messages/en.json`:

```json
  "view_block_config_weeks_label": "Week numbers",
  "view_block_config_weeks_none": "Hidden",
  "view_block_config_weeks_left": "Before weekdays",
  "view_block_config_weeks_right": "After weekdays",
```

Run: `npm run compile:i18n`

- [ ] **Step 6: Add the config dropdown to both block config UIs**

`src/views/blocks/month-calendar/ui/MonthCalendarBlockConfig.vue` — add `UiDropdown` to the imports and a row at the end of the template:

```ts
import UiDropdown from "@/ui/UiDropdown.vue";
```

```html
<UiSettingRow>
  <template #name>{{ m.view_block_config_weeks_label() }}</template>
  <UiDropdown
    :model-value="config.weeks"
    @update:model-value="(v) => update({ weeks: v as 'none' | 'left' | 'right' })"
  >
    <option value="none">{{ m.view_block_config_weeks_none() }}</option>
    <option value="left">{{ m.view_block_config_weeks_left() }}</option>
    <option value="right">{{ m.view_block_config_weeks_right() }}</option>
  </UiDropdown>
</UiSettingRow>
```

Apply the same import + row to `src/views/blocks/week-calendar/ui/WeekCalendarBlockConfig.vue` (match that file's existing `update`/`config` prop shape — read it first; it mirrors the month config component).

- [ ] **Step 7: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/views/blocks/month-calendar src/views/blocks/week-calendar src/views/default-view.ts messages/en.json src/i18n/paraglide
git commit -m "feat(views): add per-block week-number column setting (none/left/right)"
```

---

## Task 6: #10 — `NotesMonthView` week-number position from the `weeks` prop

**Files:**

- Modify: `src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`
- Modify: `src/notes-calendar/ui/NotesMonthView.vue`
- Test: `src/notes-calendar/ui/NotesMonthView.test.ts`

- [ ] **Step 1: Update existing tests + add position tests**

In `src/notes-calendar/ui/NotesMonthView.test.ts`, the `mount` `props` type and the `"week-number column"` describe block encode the OLD contract (visibility derived from week journals). Replace them.

1a. Widen `mount`'s props type:

```ts
function mount(
  h: NotesCalendarHarness,
  props: { shelf: string | null; month: MonthPeriod; hideOutsideDates?: boolean; weeks?: "none" | "left" | "right" },
) {
```

1b. Replace the entire `describe("week-number column", …)` block with:

```ts
describe("week-number column", () => {
  it("renders one week-number cell per row when weeks is left", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, month, weeks: "left" });
    expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(6);
  });

  it("renders one week-number cell per row when weeks is right", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, month, weeks: "right" });
    expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(6);
  });

  it("omits the week-number column when weeks is none", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, month, weeks: "none" });
    expect(container.querySelectorAll('[data-testid="week-number-cell"]').length).toBe(0);
  });

  it("positions the column via data-weeks", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, month, weeks: "right" });
    expect(container.querySelector<HTMLElement>(".notes-month-view__grid")?.dataset.weeks).toBe("right");
  });

  it("shows the week number even without a week journal (inactive label)", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, month, weeks: "left" });
    const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]');
    expect(weekCell).toBeTruthy();
    expect(weekCell?.dataset.active).toBeUndefined();
  });

  it("defaults to a left-positioned column when weeks is omitted", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, month });
    expect(container.querySelector<HTMLElement>(".notes-month-view__grid")?.dataset.weeks).toBe("left");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/notes-calendar/ui/NotesMonthView.test.ts`
Expected: FAIL — `NotesMonthView` ignores a `weeks` prop and derives visibility from `scope.week`; `data-weeks` does not exist; the no-journal case currently renders 0 week cells.

- [ ] **Step 3: Drive visibility + position from the prop**

`src/notes-calendar/ui/NotesMonthView.vue`:

3a. Add `weeks` to props and a position computed; replace `showWeekNumber`:

```ts
const props = defineProps<{
  shelf: string | null;
  month: MonthPeriod;
  hideOutsideDates?: boolean;
  weeks?: "none" | "left" | "right";
}>();
```

```ts
const weeksPos = computed(() => props.weeks ?? "left");
const showWeekNumber = computed(() => weeksPos.value !== "none");
```

(`showQuarter` is unchanged.)

3b. Template — set `data-weeks` on the grid and render the week-number cell before the days for `left`, after for `right`:

```html
<div class="notes-month-view__grid" :data-weeks="showWeekNumber ? weeksPos : null">
  <template v-for="row in rows" :key="row.key">
    <NotesCalendarCell
      v-if="showWeekNumber && weeksPos === 'left'"
      data-testid="week-number-cell"
      class="notes-month-view__week-number"
      :period="row.weekPeriod"
      :cell="weekCell"
    />
    <NotesCalendarCell
      v-for="day in row.days"
      :key="day.period.anchor.toAnchor()"
      class="notes-month-view__day"
      :data-outside="day.isOutside || null"
      :period="day.period"
      :cell="hideOutsideDates && day.isOutside ? inactiveDay : dayCell"
    />
    <NotesCalendarCell
      v-if="showWeekNumber && weeksPos === 'right'"
      data-testid="week-number-cell"
      class="notes-month-view__week-number"
      :period="row.weekPeriod"
      :cell="weekCell"
    />
  </template>
</div>
```

3c. Style — replace the `[data-with-weeks]` rule with positional templates:

```css
.notes-month-view__grid[data-weeks="left"] {
  grid-template-columns: auto repeat(7, 1fr);
}
.notes-month-view__grid[data-weeks="right"] {
  grid-template-columns: repeat(7, 1fr) auto;
}
```

(Leave the base `grid-template-columns: repeat(7, 1fr)` rule for the `weeks: none` case.)

- [ ] **Step 4: Pass the prop from the block**

`src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue`:

4a. Widen the `config` prop type:

```ts
const props = defineProps<{
  instanceId: BlockInstanceId;
  config: { before: number; after: number; hideWeekends: boolean; weeks: "none" | "left" | "right" };
}>();
```

4b. Pass `:weeks` to `NotesMonthView`:

```html
<NotesMonthView
  v-for="month of months"
  :key="month.start.toAnchor()"
  :month="month"
  :shelf="viewContext.shelf.value"
  :weeks="config.weeks"
/>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/notes-calendar/ui/NotesMonthView.test.ts`
Expected: PASS.

- [ ] **Step 6: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/notes-calendar/ui/NotesMonthView.vue src/notes-calendar/ui/NotesMonthView.test.ts src/views/blocks/month-calendar/ui/MonthCalendarBlock.vue
git commit -m "feat(notes-calendar): position the month week-number column from the weeks setting"
```

---

## Task 7: #10 — `NotesWeekView` week-number position from the `weeks` prop

**Files:**

- Modify: `src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue`
- Modify: `src/notes-calendar/ui/NotesWeekView.vue`
- Test: `src/notes-calendar/ui/NotesWeekView.test.ts`

- [ ] **Step 1: Update existing tests + add position tests**

In `src/notes-calendar/ui/NotesWeekView.test.ts`, widen `mount`'s props type and replace the `describe("week-number cell", …)` block.

1a:

```ts
function mount(h: NotesCalendarHarness, props: { shelf: string | null; week: WeekPeriod; weeks?: "none" | "left" | "right" }) {
```

1b. Replace the `describe("week-number cell", …)` block with:

```ts
describe("week-number cell", () => {
  it("renders the week-number cell when weeks is left", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, week, weeks: "left" });
    expect(container.querySelector('[data-testid="week-number-cell"]')).toBeTruthy();
  });

  it("renders the week-number cell when weeks is right", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, week, weeks: "right" });
    expect(container.querySelector('[data-testid="week-number-cell"]')).toBeTruthy();
  });

  it("omits the week-number cell when weeks is none", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, week, weeks: "none" });
    expect(container.querySelector('[data-testid="week-number-cell"]')).toBeNull();
  });

  it("positions the cell via data-weeks", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, week, weeks: "right" });
    expect(container.querySelector<HTMLElement>(".notes-week-view__row")?.dataset.weeks).toBe("right");
  });

  it("shows the week number even without a week journal (inactive label)", () => {
    const h = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    const { container } = mount(h, { shelf: null, week, weeks: "left" });
    const weekCell = container.querySelector<HTMLElement>('[data-testid="week-number-cell"]');
    expect(weekCell).toBeTruthy();
    expect(weekCell?.dataset.active).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/notes-calendar/ui/NotesWeekView.test.ts`
Expected: FAIL — `weeks` prop unused; `data-weeks` absent; no-journal case currently renders nothing.

- [ ] **Step 3: Drive visibility + position from the prop**

`src/notes-calendar/ui/NotesWeekView.vue`:

3a. Add `weeks` to props and replace `showWeekNumber`:

```ts
const props = defineProps<{
  shelf: string | null;
  week: WeekPeriod;
  weeks?: "none" | "left" | "right";
}>();
```

```ts
const weeksPos = computed(() => props.weeks ?? "left");
const showWeekNumber = computed(() => weeksPos.value !== "none");
```

3b. Template — set `data-weeks` on the row and order the week-number cell first (`left`) or last (`right`):

```html
<div class="notes-week-view__row" :data-weeks="showWeekNumber ? weeksPos : null">
  <NotesCalendarCell
    v-if="showWeekNumber && weeksPos === 'left'"
    data-testid="week-number-cell"
    class="notes-week-view__week-number"
    :period="rawWeek"
    :cell="weekCell"
  />
  <NotesCalendarCell v-for="day in days" :key="day.anchor.toAnchor()" :period="day" :cell="dayCell" />
  <NotesCalendarCell
    v-if="showWeekNumber && weeksPos === 'right'"
    data-testid="week-number-cell"
    class="notes-week-view__week-number"
    :period="rawWeek"
    :cell="weekCell"
  />
</div>
```

(No CSS change needed — the flex row orders children by source position.)

- [ ] **Step 4: Pass the prop from the block**

`src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue` — pass `:weeks="config.weeks"` to `NotesWeekView` (the `config` prop is already typed via `WeekCalendarConfig`, which now includes `weeks`):

```html
<NotesWeekView
  v-for="week of weeks"
  :key="week.start.toAnchor()"
  :week="week"
  :shelf="viewContext.shelf.value"
  :weeks="config.weeks"
/>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/notes-calendar/ui/NotesWeekView.test.ts`
Expected: PASS.

- [ ] **Step 6: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/notes-calendar/ui/NotesWeekView.vue src/notes-calendar/ui/NotesWeekView.test.ts src/views/blocks/week-calendar/ui/WeekCalendarBlock.vue
git commit -m "feat(notes-calendar): position the week week-number cell from the weeks setting"
```

---

## Task 8: #9 — Appearance slice, bridge, and module wiring

**Files:**

- Create: `src/notes-calendar/appearance/slice.ts`
- Create: `src/notes-calendar/appearance/bridge.ts`
- Create: `src/notes-calendar/appearance/module.ts`
- Modify: `src/main.ts`
- Test: `src/notes-calendar/appearance/slice.test.ts`

- [ ] **Step 1: Write the failing slice test**

`src/notes-calendar/appearance/slice.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { appearanceSlice, appearanceSliceSchema } from "./slice";

describe("appearanceSlice", () => {
  it("defaults today to accent text on a transparent background", () => {
    expect(appearanceSlice.defaultState).toEqual({
      today: { color: { type: "theme", name: "text-accent" }, background: { type: "transparent" } },
      active: {
        color: { type: "theme", name: "text-on-accent" },
        background: { type: "theme", name: "interactive-accent" },
      },
    });
  });

  it("accepts a custom hex color for a highlight", () => {
    const parsed = v.parse(appearanceSliceSchema, {
      today: { color: { type: "custom", color: "#ff0000" }, background: { type: "transparent" } },
      active: { color: { type: "transparent" }, background: { type: "transparent" } },
    });
    expect(parsed.today.color).toEqual({ type: "custom", color: "#ff0000" });
  });
});
```

> `defineSlice`'s returned default accessor: confirm the property name by reading `src/calendar/settings/slice.ts` usage and `src/settings/schema.ts`. If the default is exposed as something other than `.defaultState` (e.g. `.fallback`/`.default`), adjust the first test's accessor accordingly.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/notes-calendar/appearance/slice.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the slice**

`src/notes-calendar/appearance/slice.ts`:

```ts
import * as v from "valibot";

import { colorSchema } from "@/decorations";
import { defineSlice } from "@/settings";

const styleSchema = v.object({ color: colorSchema, background: colorSchema });

export const appearanceSliceSchema = v.object({
  today: styleSchema,
  active: styleSchema,
});

export type AppearanceSliceState = v.InferOutput<typeof appearanceSliceSchema>;

export const appearanceSlice = defineSlice("appearance", appearanceSliceSchema, {
  today: { color: { type: "theme", name: "text-accent" }, background: { type: "transparent" } },
  active: {
    color: { type: "theme", name: "text-on-accent" },
    background: { type: "theme", name: "interactive-accent" },
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/notes-calendar/appearance/slice.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the bridge**

`src/notes-calendar/appearance/bridge.ts` (mirror `src/calendar/settings/bridge.ts`):

```ts
import { watchEffect, type WatchStopHandle } from "vue";

import { colorToString } from "@/decorations";
import { inject } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { appearanceSlice, type AppearanceSliceState } from "./slice";

const VARS = {
  todayColor: "--journal-cell-today-color",
  todayBg: "--journal-cell-today-bg",
  activeColor: "--journal-cell-active-color",
  activeBg: "--journal-cell-active-bg",
} as const;

export class CalendarAppearanceBridge {
  readonly #settings = inject(SettingsService);
  readonly #stop: WatchStopHandle;

  constructor() {
    const slice = this.#settings.getSlice(appearanceSlice);
    this.#stop = watchEffect(() => {
      this.#sync(slice.state);
    });
  }

  [Symbol.dispose](): void {
    this.#stop();
    for (const name of Object.values(VARS)) document.body.style.removeProperty(name);
  }

  #sync(state: AppearanceSliceState | undefined): void {
    if (state === undefined) return;
    const root = document.body.style;
    root.setProperty(VARS.todayColor, colorToString(state.today.color));
    root.setProperty(VARS.todayBg, colorToString(state.today.background));
    root.setProperty(VARS.activeColor, colorToString(state.active.color));
    root.setProperty(VARS.activeBg, colorToString(state.active.background));
  }
}
```

- [ ] **Step 6: Create the module**

`src/notes-calendar/appearance/module.ts` (mirror `src/calendar/settings/module.ts`; the dashboard block component is added in Task 9 — for now register slice + bridge, then add the block in Task 9):

```ts
import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { CalendarAppearanceBridge } from "./bridge";
import { appearanceSlice } from "./slice";

export const calendarAppearanceModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(appearanceSlice);
    c.register(CalendarAppearanceBridge).useClass(CalendarAppearanceBridge).eager();
  },
};
```

- [ ] **Step 7: Wire the module into `main.ts`**

In `src/main.ts`, add the import (next to the other notes-calendar import):

```ts
import { calendarAppearanceModule } from "@/notes-calendar/appearance/module";
```

Add the module registration right after `container.addModule(notesCalendarModule);`:

```ts
container.addModule(calendarAppearanceModule);
```

- [ ] **Step 8: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/notes-calendar/appearance/slice.ts src/notes-calendar/appearance/slice.test.ts src/notes-calendar/appearance/bridge.ts src/notes-calendar/appearance/module.ts src/main.ts
git commit -m "feat(notes-calendar): add global today/active highlight color slice + bridge"
```

---

## Task 9: #9 — Appearance dashboard block UI

**Files:**

- Create: `src/notes-calendar/appearance/ui/AppearanceBlock.vue`
- Modify: `src/notes-calendar/appearance/module.ts`
- Modify: `messages/en.json`
- Test: `src/notes-calendar/appearance/ui/AppearanceBlock.test.ts`

- [ ] **Step 1: Add i18n messages**

Add to `messages/en.json`:

```json
  "calendar_appearance_section_title": "Calendar highlighting",
  "calendar_appearance_today_text": "Today — text",
  "calendar_appearance_today_background": "Today — background",
  "calendar_appearance_active_text": "Active — text",
  "calendar_appearance_active_background": "Active — background",
```

Run: `npm run compile:i18n`

- [ ] **Step 2: Write the failing component test**

`src/notes-calendar/appearance/ui/AppearanceBlock.test.ts` (mirror `src/calendar/settings/ui/CalendarWeekBlock.test.ts`'s harness):

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { initLocale, m } from "@/i18n";
import { provideInjectorOnApp, type Container } from "@/infrastructure/di";
import { createSettingsService } from "@/settings/testing";

import { appearanceSlice, type AppearanceSliceState } from "../slice";

import AppearanceBlock from "./AppearanceBlock.vue";

function setup(initial?: AppearanceSliceState) {
  const raw = initial ? { version: 3, appearance: initial } : undefined;
  const created = createSettingsService({ slices: [appearanceSlice], raw });
  return { container: created.container, settings: created.service };
}

function mount(container: Container) {
  return render(AppearanceBlock, {
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

beforeAll(() => initLocale("en"));
afterEach(() => cleanup());

describe("AppearanceBlock", () => {
  it("reveals the highlight color rows once expanded", async () => {
    const { container, settings } = setup();
    await settings.initialize();
    mount(container);
    await userEvent.click(screen.getByText(m.calendar_appearance_section_title()));
    expect(screen.getByText(m.calendar_appearance_today_text())).toBeTruthy();
  });

  it("writes a today text color change back to the slice", async () => {
    const { container, settings } = setup();
    await settings.initialize();
    mount(container);
    await userEvent.click(screen.getByText(m.calendar_appearance_section_title()));
    const slice = settings.getSlice(appearanceSlice);
    slice.state = { ...slice.state, today: { ...slice.state.today, color: { type: "custom", color: "#abcdef" } } };
    expect(settings.getSlice(appearanceSlice).state.today.color).toEqual({ type: "custom", color: "#abcdef" });
  });
});
```

> The second test asserts the slice round-trips a color edit (the picker writes through `slice.state`). If `UiColorSettingsPicker` exposes an accessible control you can drive via `user-event` directly, prefer asserting through the rendered control; otherwise this slice-level assertion documents the binding contract. Confirm the `raw` shape key (`appearance`) and `version` against `createSettingsService`/`CalendarWeekBlock.test.ts`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/notes-calendar/appearance/ui/AppearanceBlock.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 4: Create the dashboard block component**

`src/notes-calendar/appearance/ui/AppearanceBlock.vue`:

```html
<script setup lang="ts">
  import { ref } from "vue";

  import { m } from "@/i18n";
  import { useService } from "@/infrastructure/di";
  import { SettingsService } from "@/settings";
  import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
  import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
  import UiIconedRow from "@/ui/UiIconedRow.vue";
  import UiSettingRow from "@/ui/UiSettingRow.vue";

  import { appearanceSlice } from "../slice";

  import type { ColorSettings } from "@/decorations";

  const settings = useService(SettingsService);
  const slice = settings.getSlice(appearanceSlice);
  const expanded = ref(false);

  function setTodayColor(color: ColorSettings): void {
    slice.state = { ...slice.state, today: { ...slice.state.today, color } };
  }
  function setTodayBackground(background: ColorSettings): void {
    slice.state = { ...slice.state, today: { ...slice.state.today, background } };
  }
  function setActiveColor(color: ColorSettings): void {
    slice.state = { ...slice.state, active: { ...slice.state.active, color } };
  }
  function setActiveBackground(background: ColorSettings): void {
    slice.state = { ...slice.state, active: { ...slice.state.active, background } };
  }
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow icon="palette">{{ m.calendar_appearance_section_title() }}</UiIconedRow>
    </template>
    <UiSettingRow :name="m.calendar_appearance_today_text()">
      <UiColorSettingsPicker :model-value="slice.state.today.color" @update:model-value="setTodayColor" />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_appearance_today_background()">
      <UiColorSettingsPicker :model-value="slice.state.today.background" @update:model-value="setTodayBackground" />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_appearance_active_text()">
      <UiColorSettingsPicker :model-value="slice.state.active.color" @update:model-value="setActiveColor" />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_appearance_active_background()">
      <UiColorSettingsPicker :model-value="slice.state.active.background" @update:model-value="setActiveBackground" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>
```

> Confirm `UiColorSettingsPicker`'s model API (it uses `defineModel<ColorSettings>({ required: true })`, so `:model-value` + `@update:model-value` is correct). Confirm `UiIconedRow` accepts an `icon` prop (used in `ViewEditSubpage.vue`); if the dashboard trigger pattern in `CalendarWeekBlock.vue` differs, match that instead.

- [ ] **Step 5: Register the dashboard block in the module**

`src/notes-calendar/appearance/module.ts` — add the block registration:

```ts
import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SliceDefinitionToken, defineDashboardBlock } from "@/settings";

import { CalendarAppearanceBridge } from "./bridge";
import { appearanceSlice } from "./slice";
import AppearanceBlock from "./ui/AppearanceBlock.vue";

export const calendarAppearanceModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(appearanceSlice);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "calendar-appearance", component: AppearanceBlock, order: 20 }),
    );
    c.register(CalendarAppearanceBridge).useClass(CalendarAppearanceBridge).eager();
  },
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/notes-calendar/appearance/ui/AppearanceBlock.test.ts`
Expected: PASS.

- [ ] **Step 7: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/notes-calendar/appearance/ui/AppearanceBlock.vue src/notes-calendar/appearance/ui/AppearanceBlock.test.ts src/notes-calendar/appearance/module.ts messages/en.json src/i18n/paraglide
git commit -m "feat(notes-calendar): add calendar highlighting settings dashboard block"
```

---

## Task 10: #9 — Apply the highlight CSS variables on the cell

**Files:**

- Modify: `src/notes-calendar/ui/NotesCalendarCell.vue`

Presentational CSS (consumes the `body` custom properties set by the bridge). Not unit-tested; verified manually in the app.

- [ ] **Step 1: Add the scoped style block to `NotesCalendarCell.vue`**

Append a `<style scoped>` block. `[data-today]` is placed after `[data-active]` so a cell that is both resolves to the today colors:

```html
<style scoped>
  .notes-calendar-cell[data-active] {
    color: var(--journal-cell-active-color);
    background-color: var(--journal-cell-active-bg);
  }
  .notes-calendar-cell[data-today] {
    color: var(--journal-cell-today-color);
    background-color: var(--journal-cell-today-bg);
  }
</style>
```

- [ ] **Step 2: Manual verification**

Run the app (`npm run dev` / reload the plugin in the Obsidian test vault). Open a calendar view, confirm:

- Today's cell is highlighted with the accent default.
- A cell with an existing note shows the active default.
- Editing the colors in Settings → Calendar highlighting updates the calendar live.

- [ ] **Step 3: Quality gates**

Run: `npm test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/notes-calendar/ui/NotesCalendarCell.vue
git commit -m "feat(notes-calendar): style today/active cells from the highlight color variables"
```

---

## Task 11: Mark regressions resolved in the gap audit

**Files:**

- Modify: `docs/2026-06-01-v2-v3-feature-gaps.md`

- [ ] **Step 1: Flip items #7–#10 to resolved**

In `docs/2026-06-01-v2-v3-feature-gaps.md`, change `- [ ]` to `- [x]` for items **7, 8, 9, 10**, and append a one-line resolution note to each (mirroring the style of items #1–#6), e.g.:

- #7 — "ported: per-view `leaf` (left/right/tab) honored by `ViewHostService.#open`; editor dropdown."
- #8 — "ported: `NotesCalendarCell` marks any cell whose period contains today with `data-today`."
- #9 — "ported: global `appearance` slice (today/active color+background) applied via `CalendarAppearanceBridge` body CSS vars; dashboard block."
- #10 — "ported: per-block `weeks: none|left|right` on month/week-calendar blocks; superseded the journal-presence auto-hide."

- [ ] **Step 2: Commit**

```bash
git add docs/2026-06-01-v2-v3-feature-gaps.md
git commit -m "docs(views): mark gaps #7-#10 resolved"
```

---

## Self-Review

**Spec coverage:**

- #7 placement → Tasks 2 (schema/seed), 3 (host `#open`), 4 (editor dropdown). ✓
- #8 today highlight → Task 1. ✓
- #9 colors → Tasks 8 (slice/bridge/module), 9 (dashboard UI), 10 (cell CSS). ✓
- #10 week column → Tasks 5 (schema/defaults/config UI), 6 (month view), 7 (week view). ✓
- Spec "deltas" (placement on open; today not midnight-reactive; colors scoped to calendar cells) are inherent to the implementations above — no extra task needed. ✓
- Gap-doc bookkeeping → Task 11. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Each code step shows the code. The flagged `>` notes are _verification hints_ (confirm an accessor/prop name against an existing sibling), each with a concrete fallback — not deferred work.

**Type consistency:** `leaf: "left" | "right" | "tab"` and `weeks: "none" | "left" | "right"` are spelled identically across schema, props, blocks, and tests. `appearanceSlice` / `appearanceSliceSchema` / `AppearanceSliceState` names match across slice, bridge, module, and tests. CSS var names (`--journal-cell-today-color`, `--journal-cell-today-bg`, `--journal-cell-active-color`, `--journal-cell-active-bg`) match between bridge (Task 8) and cell CSS (Task 10). `weeksPos`/`showWeekNumber` consistent across Tasks 6–7.

**Known coupling to confirm during execution (each has a fallback in-task):** `defineViewBlock` accessor names (`.schema`/`.defaultConfig`), `defineSlice` default accessor (`.defaultState`), the fake command handler key (`callback`), and `createSettingsService` `raw` shape. These are read-then-match against the cited sibling files; they do not change the contract being tested.
