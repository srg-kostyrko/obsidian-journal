# Defined-navigation active-journal target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `active` target to the defined-navigation toolbar item so its prev/next buttons walk only the journal that owns the currently-open note.

**Architecture:** The item already reads the active entry to compute its reference anchor. Add `active` to the target picklist, and branch the item's `candidates` computed so that for `active` the candidate set is `[active.journalName]` (or empty when no journal note is open) — bypassing shelf/write-type scope entirely. Everything else (reference anchor, disabled state, "no earlier/later note" notice) already works unchanged.

**Tech Stack:** TypeScript, Vue 3 SFC (`<script setup>`), valibot schemas, Paraglide i18n (`messages/en.json`), Vitest + @testing-library/vue + user-event.

## Global Constraints

- Tests colocate as `*.test.ts` beside the implementation; use `expectTypeOf` (never `@ts-expect-error`) for type assertions.
- No `eslint-disable` comments — fix the code instead.
- One behavior per test; test names are subject+verb behavior, no "and"/comma lists.
- Assert observable outcomes (which note/anchor gets opened), not flow-invocation wiring shape.
- Inline `m.*()` calls directly in templates; do not wrap in `computed()`.
- Quality gates for every task: `npm run test`, `npm run check:types`, `npm run check:lint` must pass.
- Commit to the current branch (`v3-ai`); never create a new branch. No `Co-Authored-By` trailer.
- Only `messages/en.json` exists as a locale file — add the new message there only.

---

### Task 1: Offer the `active` option in the config dropdown

**Files:**

- Modify: `src/views/toolbar-items/defined-navigation/defined-navigation-targets.ts:1`
- Modify: `messages/en.json` (near `view_toolbar_defined_navigation_target`, ~line 826)
- Modify: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue:30-32`
- Test: `src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts`

**Interfaces:**

- Produces: `DEFINED_NAVIGATION_TARGETS` now includes `"active"`, so `DefinedNavigationConfig["target"]` is `"day" | "week" | "month" | "quarter" | "year" | "custom" | "active"`. Later tasks branch on `target === "active"`.
- Produces: i18n key `view_toolbar_defined_navigation_target_active()` → `"Active journal's notes"`.

- [ ] **Step 1: Write the failing test**

Add to `DefinedNavigationItemConfig.test.ts` inside the existing `describe("DefinedNavigationItemConfig", ...)` block:

```ts
it("emits onChange with the active target when active is selected", async () => {
  const onChange = vi.fn();
  mountConfig({ target: "day", direction: "next" }, onChange);
  const [targetDropdown] = screen.getAllByRole("combobox");
  await userEvent.selectOptions(targetDropdown, "active");
  expect(onChange).toHaveBeenCalledWith({ target: "active", direction: "next" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts`
Expected: FAIL — `selectOptions` cannot find an option with value `"active"` (option does not exist yet).

- [ ] **Step 3: Add `active` to the targets constant**

In `src/views/toolbar-items/defined-navigation/defined-navigation-targets.ts`, replace line 1:

```ts
export const DEFINED_NAVIGATION_TARGETS = ["day", "week", "month", "quarter", "year", "custom", "active"] as const;
```

- [ ] **Step 4: Add the i18n message**

In `messages/en.json`, add the new key directly after `"view_toolbar_defined_navigation_target"`:

```json
  "view_toolbar_defined_navigation_target": "Walk which notes",
  "view_toolbar_defined_navigation_target_active": "Active journal's notes",
  "view_toolbar_defined_navigation_direction": "Direction",
```

- [ ] **Step 5: Branch the option label in the config template**

In `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue`, replace the `<option>` (lines 30-32) inside the target dropdown:

```html
<option v-for="target of targets" :key="target" :value="target">
  {{ target === "active" ? m.view_toolbar_defined_navigation_target_active() : m.command_write_type_option({ writeType:
  target }) }}
</option>
```

(The ternary is required for both display and types: `command_write_type_option` has no `active` case, and in the false branch TS narrows `target` to the write-type union.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts`
Expected: PASS (new test + the three existing config tests).

- [ ] **Step 7: Run type and lint gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS. (If vue-tsc reports that `target` is not narrowed in the template ternary, extract a `function targetLabel(target: DefinedNavigationConfig["target"]): string` into `<script setup>` returning the same ternary and call `{{ targetLabel(target) }}` — a plain function, not a `computed`.)

- [ ] **Step 8: Commit**

```bash
git add src/views/toolbar-items/defined-navigation/defined-navigation-targets.ts \
        messages/en.json \
        src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue \
        src/views/toolbar-items/defined-navigation/DefinedNavigationItemConfig.test.ts
git commit -m "feat(views): offer active-journal target in defined-navigation config"
```

---

### Task 2: Scope navigation to the active journal

**Files:**

- Modify: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue:32`
- Test: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`

**Interfaces:**

- Consumes: `DefinedNavigationConfig["target"]` including `"active"` (Task 1); `activeVM.active.value: ActiveEntryRef | null` where `ActiveEntryRef = { journalName: string; anchor: AnchorString }`.
- Produces: no new exports; behavior change only.

- [ ] **Step 1: Write the failing tests**

Add to `DefinedNavigationItem.test.ts` inside the existing `describe("DefinedNavigationItem", ...)` block. The `mountItem` helper already supports `options.active` and `options.entries` across multiple journals.

```ts
it("navigates within only the active journal when the target is active", async () => {
  const { result, flows } = mountItem(
    { target: "active", direction: "next" },
    {
      active: { journalName: "daily", anchor: "2030-03-10" as AnchorString },
      entries: [
        { journalName: "daily", anchor: "2030-03-10" },
        { journalName: "daily", anchor: "2030-03-14" },
        { journalName: "work", anchor: "2030-03-11" },
      ],
    },
  );
  const button = result.container.querySelector<HTMLElement>("[data-direction='next']");
  expect(button).not.toBeNull();
  await userEvent.click(button!);
  const parameters = flows.calls[0]?.parameters as { anchor: string };
  expect(parameters.anchor).toBe("2030-03-14");
});

it("disables the button when the target is active and no journal note is open", () => {
  const { result } = mountItem({ target: "active", direction: "next" });
  const button = result.container.querySelector<HTMLButtonElement>("[data-direction='next']");
  expect(button?.disabled).toBe(true);
});
```

The first test's `"work"` entry at `2030-03-14`'s side (`2030-03-11` is nearer than daily's `2030-03-14` in the "next" direction) proves scoping: landing on `2030-03-14` means the nearer off-journal `work` note was ignored.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`
Expected: FAIL — with `target: "active"`, `scope["active"]` is `undefined` so `candidates` throws / the button is not correctly disabled.

- [ ] **Step 3: Branch the `candidates` computed**

In `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue`, replace line 32:

```ts
const candidates = computed<readonly string[]>(() => {
  const target = props.config.target;
  if (target === "active") {
    const active = activeVM.active.value;
    return active ? [active.journalName] : [];
  }
  return scope[target].value;
});
```

`referenceAnchor()` needs no change: for `active`, `candidates` is `[active.journalName]`, so its `candidates.value.includes(active.journalName)` branch already returns `active.anchor`. When no note is open, `candidates` is empty, so the existing `:disabled="candidates.length === 0"` disables the button.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`
Expected: PASS (both new tests + the five existing item tests).

- [ ] **Step 5: Run type and lint gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS. (`scope[target]` type-checks because after the `target === "active"` early return, `target` narrows to the write-type union, which are exactly the `ShelfScope` keys used here.)

- [ ] **Step 6: Commit**

```bash
git add src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue \
        src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts
git commit -m "feat(views): scope defined-navigation to the active journal"
```

---

## Notes

**No e2e task.** The new logic is candidate narrowing — pure reactive Vue logic fully covered by the Task 2 component tests. The only leaf-mounted seam it reuses (`referenceAnchor()` reading the real `ActiveEntryViewModel` + existing-only open against a live leaf) is already exercised by `e2e/journeys/defined-navigation.e2e.ts`. A new e2e for the `active` target would re-run already-covered seams, so it is intentionally omitted (avoids a tautological guard spec).

**Full suite before done.** After Task 2, run the complete gates once more:

```bash
npm run test && npm run check:types && npm run check:lint
```
