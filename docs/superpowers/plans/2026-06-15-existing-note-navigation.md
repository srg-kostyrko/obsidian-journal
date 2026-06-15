# Existing-note navigation (#150, #215) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "open the nearest note that actually exists" navigation — as two new command types (#150) and a calendar toolbar item (#215) — without ever creating a note.

**Architecture:** One new finder, `JournalsIndex.findNearestExisting(journalNames, from, direction)`, returns the nearest indexed anchor (max for previous, min for next) across candidate journals by reusing the per-journal `findPrevious`/`findNext`. Two thin surfaces consume it: new `previous_available`/`next_available` command types in `DynamicCommandRegistry`, and a new `defined-navigation` view toolbar item.

**Tech Stack:** TypeScript, `Option`/`Result`, ts-pattern `match`, valibot config, DI via `inject()`/`useService()`, Vue 3 SFC toolbar items (`defineToolbarItem`), Vitest + `@testing-library/vue`, paraglide i18n (`m.*`), wdio e2e.

**Spec:** `docs/superpowers/specs/2026-06-15-existing-note-navigation-design.md`.

---

## File Structure

- `src/journals/journals-index.ts` (modify) — add `findNearestExisting`.
- `src/journals/journals-index.test.ts` (modify) — finder tests.
- `src/commands/config.ts` (modify) — add the two types to `commandTypeSchema`.
- `src/commands/resolve.ts` (modify) — add the two types to `supportedTypes` (all write types) + `isAvailableType` helper.
- `src/commands/resolve.test.ts` (modify) — coverage for the new types + helper.
- `src/commands/command-registry.ts` (modify) — finder branch in `#anchor`, `#listable`, `existingOnly` + notice in `#run`, inject `NoticeService`.
- `src/commands/command-registry.test.ts` (modify) — available-type plan/run/notice/visibility tests.
- `src/commands/ui/EditCommandModal.vue` (modify) — add the two types to the form's `type` picklist.
- `messages/en.json` (modify) — `command_type_label` cases for the two types + toolbar item strings.
- `src/views/toolbar-items/defined-navigation/defined-navigation-item.ts` (create) — `defineToolbarItem`.
- `src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts` (create) — definition/schema/defaultConfig tests.
- `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue` (create) — the prev/next arrows.
- `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts` (create) — component tests.
- `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue` (create) — config editor.
- `src/views/module.ts` (modify) — register the item under `ToolbarItemDefinitionToken`.
- `e2e/journeys/available-navigation.e2e.ts` (create) — #150 command e2e.
- `e2e/journeys/view-blocks.e2e.ts` (modify) or new — #215 toolbar e2e (see Task 9).

---

## Phase 1 — The finder

### Task 1: `JournalsIndex.findNearestExisting`

**Files:**

- Modify: `src/journals/journals-index.ts`
- Test: `src/journals/journals-index.test.ts`

- [ ] **Step 1: Write the failing tests.** Add this `describe` block to `journals-index.test.ts` (reuses the file's existing `a`, `p`, `entry` helpers):

```ts
describe("findNearestExisting", () => {
  it("returns the closest earlier anchor across journals for previous", () => {
    const index = new JournalsIndex();
    index.register(entry("daily", "2022-01-01", "d/2022-01-01.md"));
    index.register(entry("work", "2022-01-05", "w/2022-01-05.md"));
    const result = index.findNearestExisting(["daily", "work"], a("2022-01-08"), "previous");
    assert(result.isSome());
    expect(result.value).toBe(a("2022-01-05"));
  });

  it("returns the closest later anchor across journals for next", () => {
    const index = new JournalsIndex();
    index.register(entry("daily", "2022-01-10", "d/2022-01-10.md"));
    index.register(entry("work", "2022-01-05", "w/2022-01-05.md"));
    const result = index.findNearestExisting(["daily", "work"], a("2022-01-01"), "next");
    assert(result.isSome());
    expect(result.value).toBe(a("2022-01-05"));
  });

  it("excludes the reference anchor itself (strictly before/after)", () => {
    const index = new JournalsIndex();
    index.register(entry("daily", "2022-01-05", "d/2022-01-05.md"));
    index.register(entry("daily", "2022-01-02", "d/2022-01-02.md"));
    const result = index.findNearestExisting(["daily"], a("2022-01-05"), "previous");
    assert(result.isSome());
    expect(result.value).toBe(a("2022-01-02"));
  });

  it("returns none when no entry exists in the direction", () => {
    const index = new JournalsIndex();
    index.register(entry("daily", "2022-01-05", "d/2022-01-05.md"));
    expect(index.findNearestExisting(["daily"], a("2022-01-01"), "previous").isNone()).toBe(true);
  });

  it("ignores journals with no index", () => {
    const index = new JournalsIndex();
    index.register(entry("daily", "2022-01-02", "d/2022-01-02.md"));
    const result = index.findNearestExisting(["daily", "missing"], a("2022-01-05"), "previous");
    assert(result.isSome());
    expect(result.value).toBe(a("2022-01-02"));
  });
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test -- src/journals/journals-index.test.ts`. Expected: FAIL — `findNearestExisting` is not a function.

- [ ] **Step 3: Implement the finder.** Add this method to `JournalsIndex` (after `findPrevious`, before `findClosestAnchor`):

```ts
findNearestExisting(
  journalNames: readonly string[],
  from: AnchorString,
  direction: "previous" | "next",
): Option<AnchorString> {
  let best: AnchorString | undefined;
  for (const name of journalNames) {
    const path = direction === "previous" ? this.findPrevious(name, from) : this.findNext(name, from);
    const anchor = path.flatMap((found) => this.entryByPath(found)).map((found) => found.anchor);
    if (anchor.isNone()) continue;
    const candidate = anchor.value;
    if (best === undefined || (direction === "previous" ? candidate > best : candidate < best)) {
      best = candidate;
    }
  }
  return Option.fromNullable(best);
}
```

- [ ] **Step 4: Run to verify pass.** Run: `npm test -- src/journals/journals-index.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/journals/journals-index.ts src/journals/journals-index.test.ts
git commit -m "feat(journals): add findNearestExisting to JournalsIndex (#150, #215)"
```

---

## Phase 2 — Command surface (#150)

### Task 2: New command types + `supportedTypes` + `isAvailableType`

**Files:**

- Modify: `src/commands/config.ts`, `src/commands/resolve.ts`
- Test: `src/commands/resolve.test.ts`

- [ ] **Step 1: Add the two types to the schema.** In `src/commands/config.ts`, extend `commandTypeSchema`:

```ts
const commandTypeSchema = v.picklist([
  "same",
  "next",
  "previous",
  "previous_available",
  "next_available",
  "same_next_week",
  "same_previous_week",
  "same_next_month",
  "same_previous_month",
  "same_next_year",
  "same_previous_year",
]);
```

- [ ] **Step 2: Write failing tests** in `src/commands/resolve.test.ts`:

```ts
import { isAvailableType, supportedTypes } from "./resolve";

describe("supportedTypes", () => {
  it("offers available types for every write type", () => {
    for (const write of ["day", "week", "month", "quarter", "year", "custom"] as const) {
      expect(supportedTypes(write)).toContain("previous_available");
      expect(supportedTypes(write)).toContain("next_available");
    }
  });
});

describe("isAvailableType", () => {
  it("is true only for the available types", () => {
    expect(isAvailableType("previous_available")).toBe(true);
    expect(isAvailableType("next_available")).toBe(true);
    expect(isAvailableType("previous")).toBe(false);
    expect(isAvailableType("same")).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure.** Run: `npm test -- src/commands/resolve.test.ts`. Expected: FAIL — `isAvailableType` not exported / available types absent.

- [ ] **Step 4: Implement.** In `src/commands/resolve.ts`, add `previous_available` and `next_available` to **every** branch of `supportedTypes` (after `"previous"` in each array), and add the helper:

```ts
// day branch:
.with("day", () => [
  "same",
  "next",
  "previous",
  "previous_available",
  "next_available",
  "same_next_week",
  "same_previous_week",
  "same_next_month",
  "same_previous_month",
  "same_next_year",
  "same_previous_year",
])
// month/quarter branch:
.with("month", "quarter", () => [
  "same",
  "next",
  "previous",
  "previous_available",
  "next_available",
  "same_next_year",
  "same_previous_year",
])
// week/year/custom branch:
.with("week", "year", "custom", () => [
  "same",
  "next",
  "previous",
  "previous_available",
  "next_available",
])
```

```ts
export function isAvailableType(type: CommandType): boolean {
  return type === "previous_available" || type === "next_available";
}
```

- [ ] **Step 5: Run to verify pass.** Run: `npm test -- src/commands/resolve.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/commands/config.ts src/commands/resolve.ts src/commands/resolve.test.ts
git commit -m "feat(commands): add available command types to schema and supportedTypes (#150)"
```

### Task 3: `DynamicCommandRegistry` resolves available types via the finder

**Files:**

- Modify: `src/commands/command-registry.ts`
- Test: `src/commands/command-registry.test.ts`

- [ ] **Step 1: Write failing tests** using the file's existing `build()` / `makeCommand()` harness. Add a `describe("available types")` block:

```ts
describe("available types", () => {
  it("opens the nearest earlier existing note and never creates", async () => {
    const h = await build();
    h.addJournal("daily", { write: { type: "day" } });
    h.seedEntry("daily", "2030-03-10", "day/2030-03-10.md");
    h.seedEntry("daily", "2030-03-12", "day/2030-03-12.md");
    h.setActiveEntry("daily", "2030-03-12", "day/2030-03-12.md");
    const id = h.addCommand(makeCommand({ type: "previous_available", context: "open_note" }));
    await h.run(id);
    expect(h.openDateCalls).toContainEqual(expect.objectContaining({ anchor: "2030-03-10", existingOnly: true }));
  });

  it("shows a notice and opens nothing when no earlier note exists", async () => {
    const h = await build();
    h.addJournal("daily", { write: { type: "day" } });
    h.seedEntry("daily", "2030-03-10", "day/2030-03-10.md");
    h.setActiveEntry("daily", "2030-03-10", "day/2030-03-10.md");
    const id = h.addCommand(makeCommand({ type: "previous_available", context: "open_note" }));
    await h.run(id);
    expect(h.openDateCalls).toHaveLength(0);
    expect(h.noticeMessages.length).toBe(1);
  });

  it("stays listed even when no note is found, as long as the target has a journal", async () => {
    const h = await build();
    h.addJournal("daily", { write: { type: "day" } });
    const id = h.addCommand(makeCommand({ type: "next_available", context: "today" }));
    expect(h.isListed(id)).toBe(true);
  });
});
```

> If `build()` does not yet expose `seedEntry`, `setActiveEntry`, `noticeMessages`, `isListed`, or `openDateCalls`, extend the harness in this test file to surface them (register a `JournalEntry` into `JournalsIndex`, drive `FakeWorkspaceService` active note, capture the injected `NoticeService` via the fake host, read `commands.check(id)`, and record `OpenDateFlow` invocations). These mirror existing capabilities already used by the file's other tests.

- [ ] **Step 2: Run to verify failure.** Run: `npm test -- src/commands/command-registry.test.ts`. Expected: FAIL — available types fall through / no notice / not listed.

- [ ] **Step 3: Implement registry changes** in `src/commands/command-registry.ts`:

Add imports:

```ts
import { m } from "@/i18n";
import { CommandService, NoticeService, WorkspaceService } from "@/infrastructure/host";
import { isAvailableType, supportedTypes } from "./resolve";
```

Add the field:

```ts
readonly #notices = inject(NoticeService);
```

Change `#anchor`'s signature to accept the candidates and add the branch:

```ts
#anchor(
  command: CommandConfig,
  journalName: string,
  reference: CalendarDate,
  journalNames: readonly string[],
): Option<AnchorString> {
  return match(command.type)
    .with("same", () => this.#cycle.anchorOf(journalName, reference))
    .with("next", () =>
      this.#cycle.anchorOf(journalName, reference).flatMap((a) => this.#cycle.nextAnchor(journalName, a)),
    )
    .with("previous", () =>
      this.#cycle.anchorOf(journalName, reference).flatMap((a) => this.#cycle.previousAnchor(journalName, a)),
    )
    .with("previous_available", "next_available", (type) =>
      this.#index.findNearestExisting(
        journalNames,
        reference.toAnchor(),
        type === "previous_available" ? "previous" : "next",
      ),
    )
    .with(
      "same_next_week",
      "same_previous_week",
      "same_next_month",
      "same_previous_month",
      "same_next_year",
      "same_previous_year",
      (type) => {
        const shift = compoundShift(type);
        if (shift === null) return Option.none<AnchorString>();
        return this.#cycle.anchorOf(journalName, reference.shift(shift.amount, shift.unit));
      },
    )
    .exhaustive();
}
```

Update the `#plan` call site to pass `journalNames`:

```ts
this.#anchor(command, rep, reference, journalNames).map((resolved) => ({ anchor: resolved, journalNames })),
```

Add `#listable` and switch `check` to it:

```ts
check: () => this.#listable(command),
```

```ts
#listable(command: CommandConfig): boolean {
  if (!isAvailableType(command.type)) return this.#plan(command).isSome();
  const journalNames = this.#candidates(command);
  const [rep] = journalNames;
  if (rep === undefined) return false;
  return this.#journalsRepo
    .get(rep)
    .map(
      (config) =>
        supportedTypes(config.write.type).includes(command.type) &&
        this.#reference(command, journalNames).isSome(),
    )
    .getOr(false);
}
```

Update `#run` to notice-on-empty for available types and never create:

```ts
async #run(command: CommandConfig): Promise<void> {
  const plan = this.#plan(command);
  if (!plan.isSome()) {
    if (isAvailableType(command.type) && this.#listable(command)) {
      this.#notices.show(
        command.type === "previous_available" ? m.command_open_no_previous() : m.command_open_no_next(),
      );
    }
    return;
  }
  const result = await this.#flows.invoke(OpenDateFlow, {
    anchor: plan.value.anchor,
    journalNames: plan.value.journalNames,
    openMode: command.openMode,
    existingOnly: isAvailableType(command.type),
  });
  if (result.kind === "err") {
    const { error } = result;
    if (error instanceof UserAborted || error instanceof NoApplicableJournals) return;
    this.#logger.error("dynamic command failed", { command: command.name, error });
  }
}
```

- [ ] **Step 4: Run to verify pass.** Run: `npm test -- src/commands/command-registry.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/commands/command-registry.ts src/commands/command-registry.test.ts
git commit -m "feat(commands): open nearest existing note for available types, notice when none (#150)"
```

### Task 4: Command-management UI accepts the new types

**Files:**

- Modify: `src/commands/ui/EditCommandModal.vue`, `messages/en.json`

- [ ] **Step 1: Add the types to the modal's validation picklist.** In `EditCommandModal.vue`, the `type` `v.picklist([...])` (around line 66) must list the new values, or selecting them fails validation:

```ts
type: v.picklist([
  "same",
  "next",
  "previous",
  "previous_available",
  "next_available",
  "same_next_week",
  "same_previous_week",
  "same_next_month",
  "same_previous_month",
  "same_next_year",
  "same_previous_year",
]),
```

(The select itself is populated from `supportedTypes`, already updated in Task 2, and labelled via `commandTypeLabel` → `m.command_type_label`.)

- [ ] **Step 2: Add the label cases.** In `messages/en.json`, the `command_type_label` message's `match` object enumerates every type and has no catch-all — add two entries:

```json
"type=previous_available": "Open last available {writeType}'s note",
"type=next_available": "Open next available {writeType}'s note",
```

- [ ] **Step 3: Verify build + types.** Run: `npm run check:types`. Expected: PASS (paraglide regenerates `m.command_type_label`; the exhaustive `match` in `command-type-label.ts` still compiles because it only references `m`).

- [ ] **Step 4: Run command UI tests.** Run: `npm test -- src/commands/ui`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/commands/ui/EditCommandModal.vue messages/en.json
git commit -m "feat(commands): surface available command types in the editor (#150)"
```

---

## Phase 3 — Toolbar item (#215)

### Task 5: `defined-navigation` toolbar item definition

**Files:**

- Create: `src/views/toolbar-items/defined-navigation/defined-navigation-item.ts`
- Test: `src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`
- Modify: `messages/en.json`

- [ ] **Step 1: Add i18n strings** to `messages/en.json`:

```json
"view_toolbar_defined_navigation_label": "Defined-note navigation",
"view_toolbar_defined_navigation_description": "Buttons that jump to the previous/next note that already exists.",
"view_toolbar_defined_navigation_target": "Walk which notes",
"view_toolbar_defined_navigation_previous": "Show previous button",
"view_toolbar_defined_navigation_next": "Show next button"
```

- [ ] **Step 2: Write the failing test** `defined-navigation-item.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as v from "valibot";

import { definedNavigationItem } from "./defined-navigation-item";

describe("definedNavigationItem", () => {
  it("defaults to a day target showing both arrows", () => {
    expect(definedNavigationItem.defaultConfig).toEqual({ target: "day", previous: true, next: true });
  });

  it("accepts a valid config", () => {
    const parsed = v.parse(definedNavigationItem.schema, { target: "week", previous: true, next: false });
    expect(parsed.target).toBe("week");
  });

  it("rejects an unknown target", () => {
    expect(() => v.parse(definedNavigationItem.schema, { target: "decade", previous: true, next: true })).toThrow();
  });
});
```

- [ ] **Step 3: Run to verify failure.** Run: `npm test -- src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`. Expected: FAIL — module not found.

- [ ] **Step 4: Implement the definition:**

```ts
import * as v from "valibot";

import { m } from "@/i18n";

import { defineToolbarItem } from "../../define-toolbar-item";

import DefinedNavigationItem from "./ui/DefinedNavigationItem.vue";
import DefinedNavigationItemConfig from "./ui/DefinedNavigationItemConfig.vue";

const schema = v.object({
  target: v.picklist(["day", "week", "month", "quarter", "year", "custom"]),
  previous: v.boolean(),
  next: v.boolean(),
});

export type DefinedNavigationConfig = v.InferOutput<typeof schema>;
export type DefinedNavigationConfigChange = (next: DefinedNavigationConfig) => void;

export const definedNavigationItem = defineToolbarItem<DefinedNavigationConfig>({
  key: "defined-navigation",
  label: m.view_toolbar_defined_navigation_label(),
  description: m.view_toolbar_defined_navigation_description(),
  icon: "chevrons-left-right",
  schema,
  defaultConfig: { target: "day", previous: true, next: true },
  component: DefinedNavigationItem,
  configComponent: DefinedNavigationItemConfig,
});
```

(The two `.vue` imports are created in Tasks 6 and 7; create empty `<template></template>` SFC stubs first so this compiles, then fill them in.)

- [ ] **Step 5: Run to verify pass.** Run: `npm test -- src/views/toolbar-items/defined-navigation/defined-navigation-item.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/views/toolbar-items/defined-navigation/ messages/en.json
git commit -m "feat(views): define the defined-navigation toolbar item (#215)"
```

### Task 6: `DefinedNavigationItem.vue` renders and navigates

**Files:**

- Create: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue`
- Test: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`

- [ ] **Step 1: Write the failing component test** (mirror the harness in `period-buttons/ui/PeriodButtonsItem.test.ts` — DI container + `view-context` provider + seeded `JournalsIndex`):

```ts
// Using the period-buttons component-test harness as the model:
// - provide a view context with shelf=null and refDate=today
// - register two daily entries (2030-03-10, 2030-03-12) in JournalsIndex
// - set the active note to 2030-03-12

it("opens the nearest earlier existing note when previous is clicked", async () => {
  const { findByRole, openDateCalls } = renderItem(
    { target: "day", previous: true, next: true },
    { active: "2030-03-12" },
  );
  await userEvent.click(await findByRole("button", { name: /previous/i }));
  expect(openDateCalls).toContainEqual(expect.objectContaining({ anchor: "2030-03-10", existingOnly: true }));
});

it("disables the buttons when the target resolves no journals", async () => {
  const { findByRole } = renderItem({ target: "week", previous: true, next: true }, { active: null });
  expect((await findByRole("button", { name: /previous/i })).hasAttribute("disabled")).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test -- src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`. Expected: FAIL — component empty.

- [ ] **Step 3: Implement the component:**

```vue
<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, NoticeService } from "@/infrastructure/host";
import { JournalsIndex, OpenDateFlow } from "@/journals";
import { m } from "@/i18n";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import UiButton from "@/ui/UiButton.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";
import type { DefinedNavigationConfig } from "../defined-navigation-item";

const props = defineProps<{ instanceId: BlockInstanceId; config: DefinedNavigationConfig }>();

const context = useViewContext();
const flows = useService(Flows);
const index = useService(JournalsIndex);
const notices = useService(NoticeService);
const activeVM = useService(ActiveEntryViewModel);
const scope = useShelfScope(() => context.shelf.value);

const candidates = computed<readonly string[]>(() => scope[props.config.target].value);

function referenceAnchor(): AnchorString {
  const active = activeVM.active.value;
  if (active && candidates.value.includes(active.journalName)) return active.anchor;
  return CalendarDate.today().toAnchor();
}

function navigate(direction: "previous" | "next", event: MouseEvent): void {
  const found = index.findNearestExisting(candidates.value, referenceAnchor(), direction);
  if (found.isNone()) {
    notices.show(direction === "previous" ? m.command_open_no_previous() : m.command_open_no_next());
    return;
  }
  void flows.invoke(OpenDateFlow, {
    anchor: found.value,
    journalNames: [...candidates.value],
    openMode: defineOpenMode(event),
    existingOnly: true,
  });
}
</script>

<template>
  <UiButton
    v-if="config.previous"
    flat
    :aria-label="m.command_open_previous()"
    :disabled="candidates.length === 0"
    data-direction="previous"
    @click="(event: MouseEvent) => navigate('previous', event)"
    @auxclick.middle.prevent="(event: MouseEvent) => navigate('previous', event)"
  >
    ‹
  </UiButton>
  <UiButton
    v-if="config.next"
    flat
    :aria-label="m.command_open_next()"
    :disabled="candidates.length === 0"
    data-direction="next"
    @click="(event: MouseEvent) => navigate('next', event)"
    @auxclick.middle.prevent="(event: MouseEvent) => navigate('next', event)"
  >
    ›
  </UiButton>
</template>
```

- [ ] **Step 4: Run to verify pass.** Run: `npm test -- src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.vue src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItem.test.ts
git commit -m "feat(views): defined-navigation arrows open nearest existing note (#215)"
```

### Task 7: Config editor + registration

**Files:**

- Create: `src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue`
- Modify: `src/views/module.ts`

- [ ] **Step 1: Implement the config editor** (mirrors `PeriodButtonsItemConfig.vue`; target is a native select, the two arrows are toggles):

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import type { DefinedNavigationConfig, DefinedNavigationConfigChange } from "../defined-navigation-item";

const props = defineProps<{ config: DefinedNavigationConfig; onChange: DefinedNavigationConfigChange }>();

const targets = ["day", "week", "month", "quarter", "year", "custom"] as const;
const update = (patch: Partial<DefinedNavigationConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_defined_navigation_target() }}</template>
    <select
      :value="config.target"
      @change="
        (event) => update({ target: (event.target as HTMLSelectElement).value as DefinedNavigationConfig['target'] })
      "
    >
      <option v-for="target of targets" :key="target" :value="target">{{ target }}</option>
    </select>
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_defined_navigation_previous() }}</template>
    <UiToggle
      :model-value="config.previous"
      @update:model-value="(value: boolean | undefined) => update({ previous: value ?? false })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_defined_navigation_next() }}</template>
    <UiToggle
      :model-value="config.next"
      @update:model-value="(value: boolean | undefined) => update({ next: value ?? false })"
    />
  </UiSettingRow>
</template>
```

- [ ] **Step 2: Register the item.** In `src/views/module.ts`, import and register beside the others:

```ts
import { definedNavigationItem } from "./toolbar-items/defined-navigation/defined-navigation-item";
// ...
c.register(ToolbarItemDefinitionToken).useValue(definedNavigationItem);
```

- [ ] **Step 3: Verify.** Run: `npm run check:types && npm test -- src/views`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/views/toolbar-items/defined-navigation/ui/DefinedNavigationItemConfig.vue src/views/module.ts
git commit -m "feat(views): register defined-navigation item with config editor (#215)"
```

---

## Phase 4 — End-to-end coverage

### Task 8: #150 command e2e

**Files:**

- Create: `e2e/journeys/available-navigation.e2e.ts`

- [ ] **Step 1: Write the e2e** (reuse the `e2e-commands` or `e2e-journeys` daily journal; seed gap notes; add a command of type `previous_available` to the commands collection in the fixture or via settings, then run it from the palette). Model the palette run on `commands.e2e.ts`:

```ts
import { browser, expect } from "@wdio/globals";

import { openPalette, paletteLists, promptChoose } from "../support/commands.js";
import {
  activeNotePath,
  frontmatterOf,
  openNote,
  seedNote,
  waitForActiveNote,
  waitForJournalFrontmatter,
} from "../support/vault.js";

const PREV_AVAILABLE = "Open last available day's note"; // command name seeded in the fixture

describe("available-note navigation", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-commands", plugins: ["journals"] });
    await seedNote("day/2030-03-10.md", "---\njournal: daily\njournal-date: 2030-03-10\n---\n");
    await seedNote("day/2030-03-12.md", "---\njournal: daily\njournal-date: 2030-03-12\n---\n");
    await waitForJournalFrontmatter("day/2030-03-10.md", { journal: "daily", date: "2030-03-10" });
    await waitForJournalFrontmatter("day/2030-03-12.md", { journal: "daily", date: "2030-03-12" });
  });

  it("opens the nearest earlier existing note and creates nothing", async () => {
    await openNote("day/2030-03-12.md");
    await openPalette();
    await promptChoose(PREV_AVAILABLE);
    await waitForActiveNote("day/2030-03-10.md");
    // a gap day between them was never created
    expect(await frontmatterOf("day/2030-03-11.md")).toBeUndefined();
  });
});
```

> The `e2e-commands` fixture must carry a `previous_available` command (target all-day, context open_note) named "Open last available day's note". Add it to that fixture's `data.json` `commands` map. If `e2e-commands` lacks a daily journal at `day/`, use `e2e-journeys` instead and adjust the command name accordingly.

- [ ] **Step 2: Build + run.** Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/journeys/available-navigation.e2e.ts`. Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add e2e/journeys/available-navigation.e2e.ts e2e/fixtures/e2e-commands
git commit -m "test(e2e): cover open-last-available command (#150)"
```

### Task 9: #215 toolbar e2e

**Files:**

- Modify/create: `e2e/journeys/view-blocks.e2e.ts` (or a new `e2e/journeys/defined-navigation.e2e.ts` with a view fixture that includes the item)

- [ ] **Step 1: Write the e2e.** Use a view fixture whose toolbar contains a `defined-navigation` item (target `day`). Seed two daily notes with a gap, open the later one, click the `[data-direction="previous"]` button (native DOM click, mirroring `clickNavNext` in `code-blocks.ts` for reading-mode buttons), assert the earlier note opens:

```ts
it("opens the nearest earlier defined note from the toolbar", async () => {
  // boot a fixture whose default view toolbar has a defined-navigation (target: day) item
  await seedNote("day/2030-03-10.md", "---\njournal: daily\njournal-date: 2030-03-10\n---\n");
  await seedNote("day/2030-03-12.md", "---\njournal: daily\njournal-date: 2030-03-12\n---\n");
  await waitForJournalFrontmatter("day/2030-03-12.md", { journal: "daily", date: "2030-03-12" });
  await openNote("day/2030-03-12.md");
  // open the journal view, then click the previous-defined arrow
  await browser.execute(() => document.querySelector<HTMLElement>('[data-direction="previous"]')?.click());
  await waitForActiveNote("day/2030-03-10.md");
});
```

> Add the `defined-navigation` item to the `e2e-views` fixture's default view toolbar (its `data.json` views entry), or create a dedicated `e2e-defined-nav` fixture. Confirm the view leaf is open before querying the toolbar button.

- [ ] **Step 2: Build + run.** Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/journeys/<spec>.e2e.ts`. Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add e2e/journeys/ e2e/fixtures/
git commit -m "test(e2e): cover defined-navigation toolbar buttons (#215)"
```

---

## Final verification

- [ ] **Run the full gates.** Run: `npm test && npm run check:types && npm run check:lint`. Expected: all PASS.
- [ ] **Run the e2e suites that touch commands/views.** Run: `npm run build && npx wdio run ./wdio.conf.mts --spec ./e2e/journeys/commands.e2e.ts --spec ./e2e/journeys/available-navigation.e2e.ts`. Expected: PASS.
- [ ] **Update the milestone notes** if you track #150/#215 elsewhere (e.g. a feature-gap or milestone doc).
