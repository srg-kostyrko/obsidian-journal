# Open-note Button Journal Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pin the button toolbar item's `current` (open-note) and `pick-date` actions to a single journal, so clicking opens that one journal's note at its own granularity instead of every shelf-scoped journal for the toggled level.

**Architecture:** Add an optional `journal` field to the two period-action variants of the button schema. At runtime, when a journal is pinned, resolve the reference date (today for `current`, a picked day for `pick-date`) to the journal's own anchor via `CycleService.anchorOf`, then invoke `OpenDateFlow` with just that journal — a no-op if the journal name no longer resolves. In the config editor, add a journal dropdown (all vault journals) and hide the levels toggle while a journal is pinned.

**Tech Stack:** TypeScript, Vue 3 SFCs, valibot (schema), ts-pattern (union dispatch), vitest + @testing-library/vue + @testing-library/user-event (unit/component), wdio (e2e), paraglide messages in `messages/en.json`.

## Global Constraints

- Local quality gates (npm scripts, not pnpm): `npm run test`, `npm run check:types`, `npm run check:lint`. All must pass.
- Runtime-touching changes also carry a wdio e2e: `npm run test:e2e` (suite for view journeys).
- Never use `eslint-disable`; fix the code instead.
- Type assertions use `expectTypeOf`, never `@ts-expect-error`.
- Vue component tests use `@testing-library/vue` + `user-event`; no `@vue/test-utils` CSS-class queries, no test-only `data-*` attributes.
- Discriminated-union dispatch uses `match().with().exhaustive()` (ts-pattern), not `switch`.
- Toolbar-item schema/resolver/types live in `button-config.ts`; `.vue`-importing code stays in `button-item.ts` / `ui/*.vue`.
- One behavior per test; test names describe subject + behavior; assert observable outcomes (spies only when the side effect IS the contract — invoking `OpenDateFlow` with specific parameters IS the contract here).
- i18n: new UI copy is a message key in `messages/en.json`; inline `m.*()` in templates (no `computed()` wrapper unless args are reactive).
- Colocate `*.test.ts` beside the file under test (the existing test files already sit at `src/views/toolbar-items/button/`).

---

## File Structure

- `src/views/toolbar-items/button/button-config.ts` — MODIFY: add optional `journal` to the `current` and `pick-date` action variants (types re-infer).
- `src/views/toolbar-items/button/ui/ButtonItem.vue` — MODIFY: inject `CycleService`; refactor `applyMode` to take `journalNames`; add `fireJournal`; route pinned actions in `onClick`.
- `src/views/toolbar-items/button/ButtonItem.test.ts` — MODIFY: register a fake `CycleService` in the harness; add pinned-journal behavior tests.
- `src/views/toolbar-items/button/ui/ButtonItemConfig.vue` — MODIFY: inject `JournalsViewModel`; add a Journal dropdown; hide the levels toggle when a journal is pinned.
- `src/views/toolbar-items/button/ButtonItemConfig.test.ts` — MODIFY: register `JournalsRepository`/`JournalsViewModel` in the harness; disambiguate the mode-dropdown query; add journal-picker tests.
- `messages/en.json` — MODIFY: add `view_toolbar_button_config_journal_default`.
- `e2e/journeys/view.e2e.ts` — MODIFY: add a journey that pins a button to a journal and asserts it opens that journal's note.

---

## Task 1: Runtime — pinned journal opens via `anchorOf`

Adds the schema field (scaffolding for this task's deliverable) and the runtime behavior together, so the field is exercised through observable note-opening rather than a trivial parse test.

**Files:**

- Modify: `src/views/toolbar-items/button/button-config.ts:12-21`
- Modify: `src/views/toolbar-items/button/ui/ButtonItem.vue`
- Test: `src/views/toolbar-items/button/ButtonItem.test.ts`

**Interfaces:**

- Consumes: `CycleService` from `@/journals` — `anchorOf(name: string, date: CalendarDate): Option<AnchorString>`; `Option` from `@/infrastructure/result` (`.isNone()`, `.value`); `CalendarDate.fromAnchor`, `CalendarDate.today` from `@/calendar`; existing `OpenDateFlow`, `Flows`, `ModalService`, `datePickerModal`.
- Produces: `ButtonAction` variants `current` / `pick-date` now carry `journal?: string`. Config editor (Task 2) reads/writes `action.journal`.

- [ ] **Step 1: Add the optional `journal` field to the schema**

In `src/views/toolbar-items/button/button-config.ts`, replace the `buttonActionSchema` variant list (lines 12-21) with:

```ts
export const buttonActionSchema = v.variant("type", [
  v.object({
    type: v.literal("pick-date"),
    mode: modeField,
    levels: levelsField,
    journal: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("current"),
    mode: modeField,
    levels: levelsField,
    journal: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("navigate-step"),
    direction: v.picklist(["prev", "next"] as const),
    unit: stepUnitField,
    amount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
]);
```

`ButtonAction` / `ButtonConfig` (inferred below, lines 30-31) update automatically. The field is optional, so stored configs without it still parse — no migration.

- [ ] **Step 2: Register a fake `CycleService` in the ButtonItem test harness**

In `src/views/toolbar-items/button/ButtonItem.test.ts`, add imports:

```ts
import { Option } from "@/infrastructure/result";
import { CycleService, OpenDateFlow } from "@/journals";
```

(`OpenDateFlow` is already imported — merge, don't duplicate.)

Add a fake near `FakeFlows` (after line 52):

```ts
class FakeCycle {
  constructor(
    private readonly resolve: (name: string, date: CalendarDate) => Option<AnchorString> = (_name, date) =>
      Option.some(date.toAnchor()),
  ) {}
  anchorOf(name: string, date: CalendarDate): Option<AnchorString> {
    return this.resolve(name, date);
  }
}
```

Change `mountItem` to accept and register a cycle resolver. Update the signature and body (lines 57-75):

```ts
function mountItem(
  config: ButtonConfig,
  contextOverride: Partial<ViewContext> = {},
  cycleResolve?: (name: string, date: CalendarDate) => Option<AnchorString>,
) {
  const container = new Container();
  const flows = new FakeFlows();
  const modals = new FakeModalService();
  const cycle = new FakeCycle(cycleResolve);
  container.register(Flows).useValue(flows as unknown as Flows);
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(CycleService).useValue(cycle as unknown as CycleService);
  const context = provideViewContextStub(contextOverride);
  const wrapperRender = (): ReturnType<typeof h> => renderRoot(config);
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return wrapperRender;
    },
  });
  const result = render(Wrapper, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { result, flows, modals, context };
}
```

- [ ] **Step 3: Write the failing tests for pinned-journal behavior**

Append a new `describe` block inside the top-level `describe("ButtonItem", ...)` in `ButtonItem.test.ts`:

```ts
describe("click — pinned journal", () => {
  it("opens only the pinned journal at its resolved anchor for current", async () => {
    const { result, flows } = mountItem(
      { action: { type: "current", mode: "create", levels: ["day"], journal: "weekly" } },
      {},
      () => Option.some("2026-06-08" as AnchorString),
    );
    await userEvent.click(result.getByText("Today"));
    expect(flows.calls).toHaveLength(1);
    expect(flows.calls[0]?.flow).toBe(OpenDateFlow);
    const parameters = flows.calls[0]?.parameters as { anchor: string; journalNames: string[] };
    expect(parameters.anchor).toBe("2026-06-08");
    expect(parameters.journalNames).toEqual(["weekly"]);
  });

  it("does nothing when the pinned journal cannot be resolved", async () => {
    const { result, flows } = mountItem(
      { action: { type: "current", mode: "create", levels: ["day"], journal: "gone" } },
      {},
      () => Option.none(),
    );
    await userEvent.click(result.getByText("Today"));
    expect(flows.calls).toHaveLength(0);
  });

  it("resolves the picked day through the pinned journal for pick-date", async () => {
    const { result, modals, flows } = mountItem(
      { action: { type: "pick-date", mode: "create", levels: ["day"], journal: "weekly" } },
      {},
      () => Option.some("2026-06-08" as AnchorString),
    );
    await userEvent.click(result.getByRole("button"));
    expect((modals.lastOpen().props as { picking: string }).picking).toBe("day");
    const picked = DayPeriod.containing(CalendarDate.fromAnchor("2026-06-10" as AnchorString));
    modals.lastOpen().submit(picked);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(flows.calls).toHaveLength(1);
    const parameters = flows.calls[0]?.parameters as { anchor: string; journalNames: string[] };
    expect(parameters.anchor).toBe("2026-06-08");
    expect(parameters.journalNames).toEqual(["weekly"]);
  });
});
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run: `npm run test -- src/views/toolbar-items/button/ButtonItem.test.ts`
Expected: the three new tests FAIL (pinned journal path not implemented — `current`/`pick-date` still open shelf-scoped journals; `journalNames` will be `["daily"]`/`[]` and `anchor` won't be `2026-06-08`).

- [ ] **Step 5: Implement the runtime path in `ButtonItem.vue`**

In `src/views/toolbar-items/button/ui/ButtonItem.vue`:

Add `CycleService` to the `@/journals` import (line 14):

```ts
import { CycleService, OpenDateFlow } from "@/journals";
```

Add the service after `flows` (near line 30):

```ts
const cycle = useService(CycleService);
```

Replace `applyMode` (lines 53-69) so it takes `journalNames` instead of `level`:

```ts
async function applyMode(
  mode: "select-only" | "navigate" | "create",
  anchor: AnchorString,
  journalNames: readonly string[],
  event: MouseEvent,
): Promise<void> {
  if (mode === "select-only") {
    context.setRefDate(anchor);
    return;
  }
  await flows.invoke(OpenDateFlow, {
    anchor,
    journalNames: [...journalNames],
    openMode: defineOpenMode(event),
    existingOnly: mode === "navigate",
  });
}
```

Update the two `applyMode` callers inside `fire` (lines 76 and 80) to pass `journalsFor(level)`:

```ts
await applyMode(action.mode, result.value.anchor.toAnchor(), journalsFor(level), event);
```

```ts
await applyMode(action.mode, period.anchor.toAnchor(), journalsFor(level), event);
```

Add `fireJournal` after `fire` (after line 92):

```ts
async function fireJournal(
  action: Extract<ButtonAction, { type: "current" | "pick-date" }>,
  event: MouseEvent,
): Promise<void> {
  const journal = action.journal;
  if (journal === undefined) return;
  let date: CalendarDate;
  if (action.type === "pick-date") {
    const result = await modals.open(datePickerModal, { picking: "day" });
    if (result.isErr()) return;
    date = CalendarDate.fromAnchor(result.value.anchor.toAnchor());
  } else {
    date = CalendarDate.today();
  }
  const anchor = cycle.anchorOf(journal, date);
  if (anchor.isNone()) return;
  await applyMode(action.mode, anchor.value, [journal], event);
}
```

Route pinned actions in `onClick` (insert after the `navigate-step` guard, before the `action.levels.length === 1` check, around line 111):

```ts
if (action.journal !== undefined) {
  void fireJournal(action, event);
  return;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- src/views/toolbar-items/button/ButtonItem.test.ts`
Expected: PASS (all pre-existing tests plus the three new ones).

- [ ] **Step 7: Type-check**

Run: `npm run check:types`
Expected: PASS (no errors from the new `journal` field or `fireJournal` narrowing).

- [ ] **Step 8: Commit**

```bash
git add src/views/toolbar-items/button/button-config.ts \
        src/views/toolbar-items/button/ui/ButtonItem.vue \
        src/views/toolbar-items/button/ButtonItem.test.ts
git commit -m "feat(views): open pinned journal from button current/pick-date actions"
```

---

## Task 2: Config UI — journal dropdown and hidden levels toggle

**Files:**

- Modify: `messages/en.json`
- Modify: `src/views/toolbar-items/button/ui/ButtonItemConfig.vue`
- Test: `src/views/toolbar-items/button/ButtonItemConfig.test.ts`

**Interfaces:**

- Consumes: `action.journal?: string` from Task 1; `JournalsViewModel` from `@/journals` (`journalOptions: ComputedRef<{ value: string; label: string }[]>`, built via `JournalsViewModel.fromRepository(repo)`); `JournalsRepository.fromParts`, `journalDefaultsFor` from `@/journals`; existing `m.common_label_journal()`.
- Produces: emits `onChange` with `action.journal` set (a journal name) or cleared (`undefined`).

- [ ] **Step 1: Add the i18n message**

In `messages/en.json`, add next to the other `view_toolbar_button_config_*` keys (near the `view_toolbar_button_config_levels_label` entry):

```json
  "view_toolbar_button_config_journal_default": "All journals on shelf",
```

- [ ] **Step 2: Update the config-test harness and add failing tests**

In `src/views/toolbar-items/button/ButtonItemConfig.test.ts`, add imports:

```ts
import { createNanoEvents } from "nanoevents";
import { reactive } from "vue";

import {
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
```

Replace `mountConfig` (lines 15-22) so it registers a journals view-model with two journals:

```ts
function mountConfig(config: ButtonConfig, onChange: ButtonConfigChange) {
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  const storage = reactive<Record<string, JournalConfig>>({
    daily: journalDefaultsFor({ type: "day" }, "daily"),
    weekly: journalDefaultsFor({ type: "week" }, "weekly"),
  });
  const repo = JournalsRepository.fromParts(storage, createNanoEvents<JournalsEvents>());
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  return render(ButtonItemConfig, {
    props: { config, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}
```

Fix the existing mode-dropdown test (lines 78-87) — a period action now renders two comboboxes (journal first, then mode), so `getByRole("combobox")` would match multiple. Replace that test body with an index-based selection:

```ts
describe("action mode", () => {
  it("emits onChange with the selected mode when the behavior dropdown changes", async () => {
    const onChange = vi.fn();
    mountConfig(baseConfig, onChange);
    const [, modeDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(modeDropdown, "navigate");
    expect(onChange).toHaveBeenLastCalledWith({
      action: { type: "current", mode: "navigate", levels: ["day"] },
    });
  });
});
```

Add a new `describe` block for the journal picker:

```ts
describe("journal selection", () => {
  it("hides the period-level toggles when a journal is pinned", () => {
    mountConfig({ action: { type: "current", mode: "create", levels: ["day"], journal: "weekly" } }, vi.fn());
    expect(screen.queryByRole("button", { name: "Week" })).toBeNull();
  });

  it("shows the period-level toggles when no journal is pinned", () => {
    mountConfig(baseConfig, vi.fn());
    expect(screen.getByRole("button", { name: "Week" })).toBeTruthy();
  });

  it("emits onChange with the pinned journal when one is selected", async () => {
    const onChange = vi.fn();
    mountConfig(baseConfig, onChange);
    await userEvent.selectOptions(screen.getByLabelText("Journal"), "weekly");
    expect(onChange).toHaveBeenLastCalledWith({
      action: { type: "current", mode: "create", levels: ["day"], journal: "weekly" },
    });
  });

  it("clears the pinned journal when the default option is chosen", async () => {
    const onChange = vi.fn();
    mountConfig({ action: { type: "current", mode: "create", levels: ["day"], journal: "weekly" } }, onChange);
    await userEvent.selectOptions(screen.getByLabelText("Journal"), "");
    expect(onChange).toHaveBeenLastCalledWith({
      action: { type: "current", mode: "create", levels: ["day"], journal: undefined },
    });
  });
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npm run test -- src/views/toolbar-items/button/ButtonItemConfig.test.ts`
Expected: the `journal selection` tests FAIL (no Journal dropdown yet; `getByLabelText("Journal")` throws, toggles still shown). The updated mode test should pass once the dropdown exists — it may currently pass or fail depending on combobox count; that's fine, it is corrected here.

- [ ] **Step 4: Implement the Journal dropdown and levels gating in `ButtonItemConfig.vue`**

In `src/views/toolbar-items/button/ui/ButtonItemConfig.vue`, add imports in the script block:

```ts
import { useService } from "@/infrastructure/di";
import { JournalsViewModel } from "@/journals";
```

Add the view-model and options (after the `props` definition, near line 22):

```ts
const journalsVM = useService(JournalsViewModel);
const journalOptions = journalsVM.journalOptions;
```

Add `setJournal` alongside the other setters (near line 60):

```ts
function setJournal(journal: string | undefined): void {
  const action = periodAction.value;
  if (!action) return;
  update({ action: { ...action, journal } });
}
```

In the template, inside the `<template v-if="periodAction">` block, add the Journal row as the FIRST row (before the mode row, currently lines 100-112):

```vue
<UiSettingRow>
      <template #name>{{ m.common_label_journal() }}</template>
      <UiDropdown
        :model-value="periodAction.journal ?? ''"
        :aria-label="m.common_label_journal()"
        @update:model-value="(value: string | undefined) => setJournal(value || undefined)"
      >
        <option value="">{{ m.view_toolbar_button_config_journal_default() }}</option>
        <option v-for="option of journalOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </UiDropdown>
    </UiSettingRow>
```

Gate the levels row so it disappears while a journal is pinned. Change its opening tag (currently line 113):

```vue
    <UiSettingRow v-if="!periodAction.journal">
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- src/views/toolbar-items/button/ButtonItemConfig.test.ts`
Expected: PASS (existing tests, corrected mode test, and the four journal-selection tests).

- [ ] **Step 6: Lint and type-check**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add messages/en.json \
        src/views/toolbar-items/button/ui/ButtonItemConfig.vue \
        src/views/toolbar-items/button/ButtonItemConfig.test.ts
git commit -m "feat(views): add journal picker to button period-action config"
```

---

## Task 3: e2e — pinned button opens the journal's note

Runtime note-opening changed, so add a wdio journey. Extend the existing view journey rather than creating a new suite.

**Files:**

- Modify: `e2e/journeys/view.e2e.ts`

**Interfaces:**

- Consumes: the shipped behavior from Tasks 1-2 (a button whose `action.journal` is set opens that journal's note on click).

- [ ] **Step 1: Read the existing view journey to reuse its fixtures and helpers**

Run: `sed -n '1,120p' e2e/journeys/view.e2e.ts`
Note how the spec builds a view with a toolbar, opens the plugin, and asserts an opened note's path. Reuse the same vault-setup and open helpers; do not invent new ones.

- [ ] **Step 2: Add a journey that pins a journal on a button and asserts the opened note**

Add a test that: seeds two journals (e.g. a `daily` and a `weekly`) with the `weekly` journal present on the shelf; configures a `current`-action button with `journal` set to the weekly journal (write the view config directly in the fixture/settings the same way the existing view tests seed toolbar items — follow the pattern already in the file); clicks the button; asserts the active note is the weekly journal's current-week note (path/basename), not a daily note.

If a physical WDIO click risks landing on a config-editor overlay (per the known `UiIconSuggest` overlay gotcha), click the button programmatically via `browser.execute`, matching the workaround already used elsewhere in the e2e suite.

- [ ] **Step 3: Run the e2e suite for the view journey**

Run: `npm run test:e2e`
Expected: the new journey PASSES (the weekly note opens). Existing journeys stay green.

- [ ] **Step 4: Commit**

```bash
git add e2e/journeys/view.e2e.ts
git commit -m "test(views): e2e for button journal-pinned open"
```

---

## Self-Review Notes

- **Spec coverage:** schema field (Task 1 Step 1), runtime `anchorOf` + no-op fallback (Task 1 Steps 3/5), both period actions (Task 1 pick-date test + `fireJournal`), all-vault-journals picker (Task 2 harness registers `journalOptions`), hide-levels-when-pinned (Task 2 Steps 2/4), level-based appearance untouched (no change to `resolveButtonAppearance`), tests + e2e (Tasks 1-3). All spec sections map to a task.
- **Off-shelf journals & `select-only` combo:** intended per spec; no special-casing added.
- **Type consistency:** `applyMode(mode, anchor, journalNames, event)` used identically at all three call sites (two in `fire`, one in `fireJournal`); `action.journal` name matches between schema, runtime, and config; `setJournal(journal: string | undefined)` matches the dropdown handler.
