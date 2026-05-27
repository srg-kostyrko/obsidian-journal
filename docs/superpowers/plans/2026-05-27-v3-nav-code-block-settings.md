# v3 Navigation Code Block — Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the per-journal `navBlock` settings editor under the existing journal edit subpage, so users can configure mode, decorate-whole-block, and rows for the navigation code block.

**Architecture:** New `src/code-blocks/nav/settings/` sub-feature wiring a `JournalEditSection` (collapsible with mode dropdown, decorate toggle, row list rendered via the runtime `NavBlockRow` with `preventNavigation=true`) plus a modal-launched flow (`EditNavBlockRowFlow`) that mutates `JournalsRepository`. Direct array mutation handles delete / move / "use defaults"; the flow handles add and edit. Mirrors the `DecorationsSection` / `EditDecorationFlow` precedent.

**Tech Stack:** Vue 3 SFC, vee-validate + valibot for forms, paraglide for i18n, `@testing-library/vue` + `user-event` + `vitest` for tests, in-house DI container with `useService`, host-side `ModalService`.

**Spec:** `docs/superpowers/specs/2026-05-27-v3-nav-code-block-settings-design.md`.

---

## File structure

Created:

- `src/code-blocks/nav/settings/module.ts` — DI module
- `src/code-blocks/nav/settings/errors.ts` — `UnknownNavRowError` + `toNavRowFlowError`
- `src/code-blocks/nav/settings/flows/edit-nav-row.flow.ts` (+ `.test.ts`)
- `src/code-blocks/nav/settings/ui/modals.ts` — `editNavBlockRowModal` definition
- `src/code-blocks/nav/settings/ui/EditNavBlockRowModal.vue` (+ `.test.ts`)
- `src/code-blocks/nav/settings/ui/NavBlockSection.vue` (+ `.test.ts`)
- `src/code-blocks/nav/settings/ui/use-shelf-mate-journals.ts` (+ `.test.ts`)

Modified:

- `src/code-blocks/module.ts` — register `navBlockSettingsModule`
- `src/journals/settings/ui/variable-context.ts` — add `"nav-row"`
- `src/journals/settings/ui/VariableReferenceModal.vue` — render `relative_date` and `index` rows when `context === "nav-row"`
- `src/journals/settings/ui/VariableReferenceModal.test.ts` (existing, augment if present; create if not)
- `messages/en.json` — new i18n keys

---

## Task 1: i18n keys

**Files:**

- Modify: `messages/en.json`

- [ ] **Step 1: Add the new keys**

Insert into `messages/en.json` (preserve alphabetical order — paraglide regenerates from this; merge into existing object literal):

```json
"nav_block_section_title": "Navigation block",
"nav_block_section_mode_label": "Mode",
"nav_block_section_mode_option": [
  {
    "declarations": ["input kind"],
    "selectors": ["kind"],
    "match": {
      "kind=create": "Create new note",
      "kind=existing": "Open existing note"
    }
  }
],
"nav_block_section_decorate_whole_label": "Decorate whole block",
"nav_block_section_use_defaults": "Use defaults for {writeType}",
"nav_block_section_empty": "No rows. Add one or use the defaults above.",
"nav_block_section_add_row": "Add row",
"nav_block_section_edit_tooltip": "Edit row",
"nav_block_section_delete_tooltip": "Delete row",
"nav_block_section_move_up_tooltip": "Move up",
"nav_block_section_move_down_tooltip": "Move down",
"nav_block_row_modal_title": [
  {
    "declarations": ["input mode"],
    "selectors": ["mode"],
    "match": {
      "mode=add": "Add nav block row",
      "mode=edit": "Edit nav block row"
    }
  }
],
"nav_block_row_field_template": "Template",
"nav_block_row_field_font_size": "Font size",
"nav_block_row_field_bold": "Bold",
"nav_block_row_field_italic": "Italic",
"nav_block_row_field_color": "Text color",
"nav_block_row_field_background": "Background color",
"nav_block_row_field_link": "Link",
"nav_block_row_field_journal": "Journal",
"nav_block_row_field_add_decorations": "Add decorations",
"nav_block_row_link_option": [
  {
    "declarations": ["input kind"],
    "selectors": ["kind"],
    "match": {
      "kind=none": "None",
      "kind=self": "Self",
      "kind=journal": "Journal",
      "kind=day": "Day",
      "kind=week": "Week",
      "kind=month": "Month",
      "kind=quarter": "Quarter",
      "kind=year": "Year"
    }
  }
],
"nav_block_row_template_required": "Template is required",
"nav_block_row_journal_required": "Please select a journal",
"nav_block_row_resolved_preview": "Resolved: {text}",
"journal_edit_variable_relative_date_description": "yesterday / today / tomorrow / N days ago for fixed-cycle journals; empty for custom journals.",
"journal_edit_variable_index_description": "Sequential number for the note when the journal has numbering enabled."
```

- [ ] **Step 2: Verify paraglide compiles and types are emitted**

Run: `npm run check:types`
Expected: PASS (paraglide message file regenerates automatically on next build/check; if check:types fails because messages haven't been regenerated, run `npm run build` once or whatever the project uses — inspect `package.json` scripts).

- [ ] **Step 3: Commit**

```bash
git add messages/en.json
git commit -m "feat(i18n): nav-block settings + variable-hint nav-row keys"
```

---

## Task 2: extend `VariableModalContext` with `"nav-row"`

**Files:**

- Modify: `src/journals/settings/ui/variable-context.ts`
- Modify: `src/journals/settings/ui/VariableReferenceModal.vue`
- Test: `src/journals/settings/ui/VariableReferenceModal.test.ts` (likely exists; check first — if missing, create)

- [ ] **Step 1: Check whether the test file already exists**

Run: `ls src/journals/settings/ui/VariableReferenceModal.test.ts 2>/dev/null || echo MISSING`
Expected output: either the path or `MISSING`.

- [ ] **Step 2: Write the failing test (nav-row branch)**

If the file exists, append a new `describe` block; otherwise create the file with the minimum harness below. The test renders the modal with `context: "nav-row"` and asserts the two new variable rows render.

Append (or create) `src/journals/settings/ui/VariableReferenceModal.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";

import VariableReferenceModal from "./VariableReferenceModal.vue";

afterEach(() => cleanup());

describe("VariableReferenceModal nav-row context", () => {
  it("renders relative_date and index rows when context is nav-row", () => {
    render(VariableReferenceModal, {
      props: {
        context: "nav-row",
        journalName: "daily",
        dateFormat: "YYYY-MM-DD",
        hasCycle: true,
        numberingVariableNames: [],
        openModifications: () => undefined,
      },
    });
    expect(screen.getByText("relative_date")).toBeTruthy();
    expect(screen.getByText("index")).toBeTruthy();
    expect(screen.getByText(m.journal_edit_variable_relative_date_description())).toBeTruthy();
    expect(screen.getByText(m.journal_edit_variable_index_description())).toBeTruthy();
  });

  it("does not render relative_date when context is name-template", () => {
    render(VariableReferenceModal, {
      props: {
        context: "name-template",
        journalName: "daily",
        dateFormat: "YYYY-MM-DD",
        hasCycle: true,
        numberingVariableNames: [],
        openModifications: () => undefined,
      },
    });
    expect(screen.queryByText("relative_date")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify failure**

Run: `npx vitest run src/journals/settings/ui/VariableReferenceModal.test.ts`
Expected: FAIL — either type error on `context: "nav-row"` or missing-element assertions.

- [ ] **Step 4: Extend the context type**

Replace the entire contents of `src/journals/settings/ui/variable-context.ts`:

```ts
export type VariableModalContext = "name-template" | "folder-path" | "template-path" | "nav-row";
```

- [ ] **Step 5: Render the nav-row rows in the modal**

In `src/journals/settings/ui/VariableReferenceModal.vue`, in the `<script setup>` block add a derived flag:

```ts
const showNavRowVariables = computed(() => props.context === "nav-row");
```

In the template, insert two new rows in `<dl class="variable-reference__list">`, after the existing `journal_name` row and before the `<template v-if="hasCycle">` block:

```vue
<template v-if="showNavRowVariables">
  <div class="variable-reference__row">
    <dt><VariableChip name="relative_date" /></dt>
    <dd>{{ m.journal_edit_variable_relative_date_description() }}</dd>
  </div>
  <div class="variable-reference__row">
    <dt><VariableChip name="index" /></dt>
    <dd>{{ m.journal_edit_variable_index_description() }}</dd>
  </div>
</template>
```

- [ ] **Step 6: Run the test to verify pass**

Run: `npx vitest run src/journals/settings/ui/VariableReferenceModal.test.ts`
Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/journals/settings/ui/variable-context.ts src/journals/settings/ui/VariableReferenceModal.vue src/journals/settings/ui/VariableReferenceModal.test.ts
git commit -m "feat(journals): VariableReferenceModal nav-row context"
```

---

## Task 3: `errors.ts` — `UnknownNavRowError` + `toNavRowFlowError`

**Files:**

- Create: `src/code-blocks/nav/settings/errors.ts`
- Test: `src/code-blocks/nav/settings/errors.test.ts`

Memory says no instanceof-parent trivial tests and no tests for trivial error subclasses, but the `toNavRowFlowError` helper is a small piece of logic worth verifying once. Test only the helper.

- [ ] **Step 1: Write the failing test**

Create `src/code-blocks/nav/settings/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { toNavRowFlowError, UnknownNavRowError, NavRowLifecycleFlowError } from "./errors";

describe("toNavRowFlowError", () => {
  it("wraps an UnknownNavRowError in a NavRowLifecycleFlowError carrying the cause", () => {
    const cause = new UnknownNavRowError("daily", 3);
    const wrapped = toNavRowFlowError(cause);
    expect(wrapped).toBeInstanceOf(NavRowLifecycleFlowError);
    expect(wrapped.cause).toBe(cause);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npx vitest run src/code-blocks/nav/settings/errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/code-blocks/nav/settings/errors.ts`:

```ts
import { FlowError } from "@/infrastructure/flows";

export class UnknownNavRowError extends Error {
  readonly kind = "unknown-nav-row" as const;
  constructor(
    public readonly journalName: string,
    public readonly index: number,
  ) {
    super(`Nav block row not found: journal=${journalName} index=${index}`);
    this.name = "UnknownNavRowError";
  }
}

export type NavRowLifecycleError = UnknownNavRowError;

export class NavRowLifecycleFlowError extends FlowError {
  readonly kind = "nav-row-lifecycle" as const;
  constructor(public override readonly cause: NavRowLifecycleError) {
    super(cause.message);
    this.name = "NavRowLifecycleFlowError";
  }
}

export function toNavRowFlowError(cause: NavRowLifecycleError): NavRowLifecycleFlowError {
  return new NavRowLifecycleFlowError(cause);
}
```

- [ ] **Step 4: Run the test to verify pass**

Run: `npx vitest run src/code-blocks/nav/settings/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/settings/errors.ts src/code-blocks/nav/settings/errors.test.ts
git commit -m "feat(code-blocks): UnknownNavRowError + flow-error wrapper"
```

---

## Task 4: `useShelfMateJournals` composable

**Files:**

- Create: `src/code-blocks/nav/settings/ui/use-shelf-mate-journals.ts`
- Test: `src/code-blocks/nav/settings/ui/use-shelf-mate-journals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/code-blocks/nav/settings/ui/use-shelf-mate-journals.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { defineComponent, h } from "vue";
import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { reactive } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import {
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { ShelvesRepository, type ShelfConfig, type ShelvesEvents } from "@/shelves";

import { useShelfMateJournals } from "./use-shelf-mate-journals";

afterEach(() => cleanup());

function mount(opts: {
  journalName: string;
  journals: Record<string, JournalConfig>;
  shelves: Record<string, ShelfConfig>;
}) {
  const container = new Container();
  const journalsStorage = reactive(opts.journals);
  const shelvesStorage = reactive(opts.shelves);
  const repo = JournalsRepository.fromParts(journalsStorage, createNanoEvents<JournalsEvents>());
  const shelvesRepo = ShelvesRepository.fromParts(shelvesStorage, createNanoEvents<ShelvesEvents>());
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(ShelvesRepository).useValue(shelvesRepo);

  let result: readonly string[] = [];
  const Probe = defineComponent({
    setup() {
      const list = useShelfMateJournals(opts.journalName);
      return () => {
        result = list.value;
        return h("div");
      };
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
  return () => result;
}

const journal = (name: string): JournalConfig => journalDefaultsFor({ type: "day" }, name);

describe("useShelfMateJournals", () => {
  it("returns shelf-mates excluding the current journal", () => {
    const get = mount({
      journalName: "daily",
      journals: { daily: journal("daily"), weekly: journal("weekly"), other: journal("other") },
      shelves: { home: { name: "home", journals: ["daily", "weekly"] } },
    });
    expect(get()).toEqual(["weekly"]);
  });

  it("returns empty when the journal is not in any shelf", () => {
    const get = mount({
      journalName: "daily",
      journals: { daily: journal("daily"), weekly: journal("weekly") },
      shelves: { home: { name: "home", journals: ["weekly"] } },
    });
    expect(get()).toEqual([]);
  });

  it("returns empty when no shelves exist", () => {
    const get = mount({
      journalName: "daily",
      journals: { daily: journal("daily") },
      shelves: {},
    });
    expect(get()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npx vitest run src/code-blocks/nav/settings/ui/use-shelf-mate-journals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/code-blocks/nav/settings/ui/use-shelf-mate-journals.ts`:

```ts
import { computed, type ComputedRef } from "vue";

import { useService } from "@/infrastructure/di";
import { ShelvesRepository } from "@/shelves";

export function useShelfMateJournals(journalName: string): ComputedRef<readonly string[]> {
  const shelves = useService(ShelvesRepository);
  return computed(() => {
    const owning = [...shelves.find().list()].find((shelf) => shelf.journals.includes(journalName));
    if (!owning) return [];
    return owning.journals.filter((name) => name !== journalName);
  });
}
```

- [ ] **Step 4: Run the test to verify pass**

Run: `npx vitest run src/code-blocks/nav/settings/ui/use-shelf-mate-journals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/settings/ui/use-shelf-mate-journals.ts src/code-blocks/nav/settings/ui/use-shelf-mate-journals.test.ts
git commit -m "feat(code-blocks): useShelfMateJournals composable"
```

---

## Task 5: `EditNavBlockRowModal.vue`

**Files:**

- Create: `src/code-blocks/nav/settings/ui/EditNavBlockRowModal.vue`
- Test: `src/code-blocks/nav/settings/ui/EditNavBlockRowModal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/code-blocks/nav/settings/ui/EditNavBlockRowModal.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
  type NavBlockRow,
} from "@/journals";
import { ShelvesRepository, type ShelfConfig, type ShelvesEvents } from "@/shelves";
import { TemplateEngine } from "@/templates";

import EditNavBlockRowModal from "./EditNavBlockRowModal.vue";

afterEach(() => cleanup());

function mountModal(opts: {
  row?: NavBlockRow;
  journals?: Record<string, JournalConfig>;
  shelves?: Record<string, ShelfConfig>;
}) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ row: NavBlockRow }> = { submit, cancel };
  const container = new Container();
  const journalsStorage = reactive(opts.journals ?? { daily: journalDefaultsFor({ type: "day" }, "daily") });
  const shelvesStorage = reactive(opts.shelves ?? { home: { name: "home", journals: ["daily"] } });
  const repo = JournalsRepository.fromParts(journalsStorage, createNanoEvents<JournalsEvents>());
  const shelvesRepo = ShelvesRepository.fromParts(shelvesStorage, createNanoEvents<ShelvesEvents>());
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(ShelvesRepository).useValue(shelvesRepo);
  container.register(Calendar).useValue(new Calendar());
  container.register(TemplateEngine).useClass(TemplateEngine);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  render(EditNavBlockRowModal, {
    props: { journalName: "daily", row: opts.row },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel };
}

describe("EditNavBlockRowModal", () => {
  it("opens blank when row prop is undefined", () => {
    mountModal({});
    expect((screen.getByLabelText(m.nav_block_row_field_template()) as HTMLInputElement).value).toBe("");
  });

  it("opens with pre-filled values when a row is provided", () => {
    mountModal({
      row: {
        template: "{{date:YYYY}}",
        fontSize: 1.5,
        bold: true,
        italic: false,
        color: { type: "theme", name: "text-normal" },
        background: { type: "transparent" },
        link: "year",
        journal: "",
        addDecorations: true,
      },
    });
    expect((screen.getByLabelText(m.nav_block_row_field_template()) as HTMLInputElement).value).toBe("{{date:YYYY}}");
  });

  it("does not submit when template is empty", async () => {
    const { submit } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.nav_block_row_template_required())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits when template is present", async () => {
    const { submit } = mountModal({});
    await userEvent.type(screen.getByLabelText(m.nav_block_row_field_template()), "{{date:YYYY}}");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ row: { template: "{{date:YYYY}}" } });
  });

  it("does not submit when link=journal but journal is empty", async () => {
    const { submit } = mountModal({});
    await userEvent.type(screen.getByLabelText(m.nav_block_row_field_template()), "x");
    await userEvent.selectOptions(screen.getByLabelText(m.nav_block_row_field_link()), "journal");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.nav_block_row_journal_required())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("hides the journal dropdown when link is not 'journal'", () => {
    mountModal({});
    expect(screen.queryByLabelText(m.nav_block_row_field_journal())).toBeNull();
  });

  it("shows shelf-mates excluding the current journal in the journal dropdown", async () => {
    mountModal({
      journals: {
        daily: journalDefaultsFor({ type: "day" }, "daily"),
        weekly: journalDefaultsFor({ type: "week" }, "weekly"),
      },
      shelves: { home: { name: "home", journals: ["daily", "weekly"] } },
    });
    await userEvent.selectOptions(screen.getByLabelText(m.nav_block_row_field_link()), "journal");
    const dropdown = await screen.findByLabelText(m.nav_block_row_field_journal());
    const options = [...(dropdown as HTMLSelectElement).options].map((o) => o.value);
    expect(options).toContain("weekly");
    expect(options).not.toContain("daily");
  });

  it("cancels via api.cancel when the cancel button is clicked", async () => {
    const { cancel } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npx vitest run src/code-blocks/nav/settings/ui/EditNavBlockRowModal.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the modal**

Create `src/code-blocks/nav/settings/ui/EditNavBlockRowModal.vue`:

```vue
<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import { useField, useForm } from "vee-validate";
import { computed } from "vue";
import * as v from "valibot";

import { Clock, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import {
  CycleService,
  JournalsIndex,
  JournalsViewModel,
  navBlockRowSchema,
  type ColorSettings,
  type JournalConfig,
  type NavBlockRow,
  type NavBlockRowLink,
} from "@/journals";
import { TemplateEngine } from "@/templates";
import UiButton from "@/ui/UiButton.vue";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { buildNavRowContext } from "../../nav-row-context";

import { useShelfMateJournals } from "./use-shelf-mate-journals";

import VariableReferenceHint from "@/journals/settings/ui/VariableReferenceHint.vue";

const props = defineProps<{ journalName: string; row?: NavBlockRow }>();
const api = useModal<{ row: NavBlockRow }>();

const journalsVM = useService(JournalsViewModel);
const engine = useService(TemplateEngine);
const cycle = useService(CycleService);
const index = useService(JournalsIndex);

const config = computed<JournalConfig | undefined>(() =>
  journalsVM.getJournal(props.journalName).getOr(undefined as never),
);

const initial: NavBlockRow = props.row ?? {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  addDecorations: false,
};

const schema = v.pipe(
  navBlockRowSchema,
  v.forward(
    v.partialCheck([["template"]], ({ template }) => template.trim().length > 0, m.nav_block_row_template_required()),
    ["template"],
  ),
  v.forward(
    v.partialCheck(
      [["link"], ["journal"]],
      ({ link, journal }) => link !== "journal" || journal.length > 0,
      m.nav_block_row_journal_required(),
    ),
    ["journal"],
  ),
);

const { errorBag, handleSubmit } = useForm<NavBlockRow>({
  initialValues: JSON.parse(JSON.stringify(initial)) as NavBlockRow,
  validationSchema: toTypedSchema(schema),
});

const { value: template } = useField<string>("template");
const { value: fontSize } = useField<number>("fontSize");
const { value: bold } = useField<boolean>("bold");
const { value: italic } = useField<boolean>("italic");
const { value: color } = useField<ColorSettings>("color");
const { value: background } = useField<ColorSettings>("background");
const { value: link } = useField<NavBlockRowLink>("link");
const { value: journal } = useField<string>("journal");
const { value: addDecorations } = useField<boolean>("addDecorations");

const shelfMates = useShelfMateJournals(props.journalName);

const numberingVariableNames = computed<readonly string[]>(() =>
  config.value?.numbering.enabled ? config.value.numbering.sources.map((s) => s.variable) : [],
);

const hasCycle = computed(() => config.value !== undefined && config.value.write.type !== "day");

const resolved = computed(() => {
  if (!config.value) return "";
  const today = Clock.now().format("YYYY-MM-DD") as AnchorString;
  return engine.renderString(
    template.value ?? "",
    buildNavRowContext({
      journal: config.value,
      refDate: today,
      entry: index.entryByAnchor(config.value.name, today),
      cycle,
      today,
    }),
  );
});

const linkOptions = ["none", "self", "journal", "day", "week", "month", "quarter", "year"] as const;

const onSubmit = handleSubmit((row) => {
  api.submit({ row });
});
</script>

<template>
  <form v-if="config" @submit.prevent="onSubmit">
    <UiSettingRow :name="m.nav_block_row_field_template()">
      <template #description>
        <VariableReferenceHint
          context="nav-row"
          :journal-name="journalName"
          :date-format="config.dateFormat"
          :has-cycle="hasCycle"
          :numbering-variable-names="numberingVariableNames"
        />
        <div>{{ m.nav_block_row_resolved_preview({ text: resolved }) }}</div>
        <span v-for="error of errorBag.template ?? []" :key="error" class="form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="template" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_font_size()">
      <UiNumberInput v-model="fontSize" :min="0.5" :step="0.1" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_bold()">
      <UiToggle v-model="bold" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_italic()">
      <UiToggle v-model="italic" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_color()">
      <UiColorSettingsPicker v-model="color" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_background()">
      <UiColorSettingsPicker v-model="background" />
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_link()">
      <UiDropdown v-model="link">
        <option v-for="kind of linkOptions" :key="kind" :value="kind">
          {{ m.nav_block_row_link_option({ kind }) }}
        </option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow v-if="link === 'journal'" :name="m.nav_block_row_field_journal()">
      <template #description>
        <span v-for="error of errorBag.journal ?? []" :key="error" class="form-error">{{ error }}</span>
      </template>
      <UiDropdown v-model="journal">
        <option value="" disabled>—</option>
        <option v-for="name of shelfMates" :key="name" :value="name">{{ name }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_row_field_add_decorations()">
      <UiToggle v-model="addDecorations" />
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.form-error {
  color: var(--text-error);
  display: block;
}
</style>
```

If `UiTextInput` does not auto-bind a label-derived `id`, the test's `getByLabelText` lookups need `<UiTextInput v-model="template" :id="..." />`-style wiring; first run the tests to verify which controls expose labels correctly. If a control needs explicit id wiring, add `<label :for=...>` rows or switch the test to `getByRole`/`getByDisplayValue`. The decoration modal's tests are the precedent — use the same lookup strategy if these differ.

- [ ] **Step 4: Run the test to verify pass**

Run: `npx vitest run src/code-blocks/nav/settings/ui/EditNavBlockRowModal.test.ts`
Expected: PASS.

If lookups fail because `UiTextInput`/`UiDropdown` don't link labels, adjust the test to use `getByRole("textbox")` / `getByRole("combobox")` with `screen.getAllByRole(...)` indices — preserve the _behavioral_ assertions (template empty blocks submit, journal-required when link=journal, etc.).

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/settings/ui/EditNavBlockRowModal.vue src/code-blocks/nav/settings/ui/EditNavBlockRowModal.test.ts
git commit -m "feat(code-blocks): EditNavBlockRowModal"
```

---

## Task 6: `modals.ts` — `editNavBlockRowModal` definition

**Files:**

- Create: `src/code-blocks/nav/settings/ui/modals.ts`

No tests for this file ([[no_wiring_tests]] / [[no_trivial_tests]] — `defineModal` values are wiring).

- [ ] **Step 1: Create the file**

```ts
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";
import type { NavBlockRow } from "@/journals";

import EditNavBlockRowModal from "./EditNavBlockRowModal.vue";

export interface EditNavBlockRowModalProps {
  journalName: string;
  row?: NavBlockRow;
}

export const editNavBlockRowModal = defineModal<{ row: NavBlockRow }>()({
  component: EditNavBlockRowModal,
  title: ({ row }: EditNavBlockRowModalProps) => m.nav_block_row_modal_title({ mode: row ? "edit" : "add" }),
});
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/code-blocks/nav/settings/ui/modals.ts
git commit -m "feat(code-blocks): editNavBlockRowModal definition"
```

---

## Task 7: `EditNavBlockRowFlow`

**Files:**

- Create: `src/code-blocks/nav/settings/flows/edit-nav-row.flow.ts`
- Test: `src/code-blocks/nav/settings/flows/edit-nav-row.flow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/code-blocks/nav/settings/flows/edit-nav-row.flow.test.ts`:

```ts
import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import {
  JournalLifecycleFlowError,
  JournalsRepository,
  UnknownJournalError,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
  type NavBlockRow,
} from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { NavRowLifecycleFlowError, UnknownNavRowError } from "../errors";

import { EditNavBlockRowFlow } from "./edit-nav-row.flow";

function buildJournal(name: string, rows: NavBlockRow[]): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, name);
  return { ...base, navBlock: { ...base.navBlock, rows } };
}

function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(Flows).useClass(Flows);
  container.register(EditNavBlockRowFlow).useClass(EditNavBlockRowFlow);
  return { storage, modals, flows: container.resolve(Flows) };
}

const sampleRow: NavBlockRow = {
  template: "{{date:YYYY}}",
  fontSize: 1,
  bold: false,
  italic: false,
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  link: "none",
  journal: "",
  addDecorations: false,
};

describe("EditNavBlockRowFlow", () => {
  it("returns UnknownJournalError when the journal does not exist", async () => {
    const { flows } = build();
    const result = await flows.invoke(EditNavBlockRowFlow, { journalName: "missing" });
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });

  it("returns UnknownNavRowError when rowIndex is out of range", async () => {
    const { flows } = build({ daily: buildJournal("daily", []) });
    const result = await flows.invoke(EditNavBlockRowFlow, { journalName: "daily", rowIndex: 5 });
    expect(result.kind === "err" && result.error).toBeInstanceOf(NavRowLifecycleFlowError);
    expect(result.kind === "err" && (result.error as NavRowLifecycleFlowError).cause).toBeInstanceOf(
      UnknownNavRowError,
    );
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = build({ daily: buildJournal("daily", []) });
    const promise = flows.invoke(EditNavBlockRowFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("appends and returns the new index when no rowIndex is provided", async () => {
    const { flows, modals, storage } = build({ daily: buildJournal("daily", [sampleRow]) });
    const promise = flows.invoke(EditNavBlockRowFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { row: NavBlockRow }>().submit({ row: sampleRow });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(1);
    expect(storage.daily?.navBlock.rows.length).toBe(2);
  });

  it("replaces the row at rowIndex when a rowIndex is provided", async () => {
    const updated: NavBlockRow = { ...sampleRow, template: "x" };
    const { flows, modals, storage } = build({ daily: buildJournal("daily", [sampleRow]) });
    const promise = flows.invoke(EditNavBlockRowFlow, { journalName: "daily", rowIndex: 0 });
    modals.lastOpen<{ journalName: string }, { row: NavBlockRow }>().submit({ row: updated });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(0);
    expect(storage.daily?.navBlock.rows[0]).toEqual(updated);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npx vitest run src/code-blocks/nav/settings/flows/edit-nav-row.flow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the flow**

Create `src/code-blocks/nav/settings/flows/edit-nav-row.flow.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult, attempt } from "@/infrastructure/result";
import { JournalsRepository, UnknownJournalError, toJournalFlowError, type NavBlockRow } from "@/journals";

import { UnknownNavRowError, toNavRowFlowError } from "../errors";

import { editNavBlockRowModal } from "../ui/modals";

export interface EditNavBlockRowParameters {
  journalName: string;
  rowIndex?: number;
}

export interface EditNavBlockRowResult {
  row: NavBlockRow;
  index: number;
}

export class EditNavBlockRowFlow implements Flow<EditNavBlockRowParameters, EditNavBlockRowResult, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #repository = inject(JournalsRepository);

  execute(parameters: EditNavBlockRowParameters): AsyncResult<EditNavBlockRowResult, FlowError> {
    const configOption = this.#repository.get(parameters.journalName);
    if (configOption.isNone()) {
      return AsyncResult.err(toJournalFlowError(new UnknownJournalError(parameters.journalName)));
    }
    const config = configOption.getOr(undefined as never);
    const rowIndex = parameters.rowIndex;
    const isEdit = rowIndex !== undefined;
    if (isEdit && (rowIndex < 0 || rowIndex >= config.navBlock.rows.length)) {
      return AsyncResult.err(toNavRowFlowError(new UnknownNavRowError(parameters.journalName, rowIndex)));
    }
    const existing = isEdit ? config.navBlock.rows[rowIndex] : undefined;
    return attempt.in(this, async function* (this: EditNavBlockRowFlow) {
      const submitted = yield* this.#modals
        .open(editNavBlockRowModal, { journalName: parameters.journalName, row: existing })
        .mapErr(() => new UserAborted("edit-nav-block-row-modal"));
      const nextRows = isEdit
        ? config.navBlock.rows.map((r, i) => (i === rowIndex ? submitted.row : r))
        : [...config.navBlock.rows, submitted.row];
      this.#repository.update(parameters.journalName, {
        navBlock: { ...config.navBlock, rows: nextRows },
      });
      const newIndex = isEdit ? rowIndex : config.navBlock.rows.length;
      return { row: submitted.row, index: newIndex };
    });
  }
}
```

(The barrel re-exports `toFlowError` as `toJournalFlowError`; this matches `EditDecorationFlow`'s import style.)

- [ ] **Step 4: Run the test to verify pass**

Run: `npx vitest run src/code-blocks/nav/settings/flows/edit-nav-row.flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/settings/flows/edit-nav-row.flow.ts src/code-blocks/nav/settings/flows/edit-nav-row.flow.test.ts
git commit -m "feat(code-blocks): EditNavBlockRowFlow"
```

---

## Task 8: `NavBlockSection.vue`

**Files:**

- Create: `src/code-blocks/nav/settings/ui/NavBlockSection.vue`
- Test: `src/code-blocks/nav/settings/ui/NavBlockSection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/code-blocks/nav/settings/ui/NavBlockSection.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
  type NavBlockRow,
} from "@/journals";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import { TemplateEngine } from "@/templates";

import { EditNavBlockRowFlow } from "../flows/edit-nav-row.flow";

import NavBlockSection from "./NavBlockSection.vue";

afterEach(() => cleanup());

function buildJournal(name: string, rows: NavBlockRow[]): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, name);
  return { ...base, navBlock: { ...base.navBlock, rows } };
}

function mount(rows: NavBlockRow[]) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({ daily: buildJournal("daily", rows) });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const shelvesRepo = ShelvesRepository.fromParts(
    reactive({ home: { name: "home", journals: ["daily"] } }),
    createNanoEvents<ShelvesEvents>(),
  );
  const invoke = vi.fn();
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(ShelvesRepository).useValue(shelvesRepo);
  container.register(Flows).useValue({ invoke } as unknown as Flows);
  container.register(Calendar).useValue(new Calendar());
  container.register(TemplateEngine).useClass(TemplateEngine);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(WorkspaceService).useValue({} as WorkspaceService);
  render(NavBlockSection, {
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
  return { storage, invoke };
}

const sampleRow: NavBlockRow = {
  template: "{{date:YYYY}}",
  fontSize: 1,
  bold: false,
  italic: false,
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  link: "none",
  journal: "",
  addDecorations: false,
};

describe("NavBlockSection", () => {
  it("shows the empty-state message and 'use defaults' button when rows are empty", async () => {
    mount([]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getByText(m.nav_block_section_empty())).toBeTruthy();
    expect(screen.getByText(m.nav_block_section_use_defaults({ writeType: "day" }))).toBeTruthy();
  });

  it("populates the rows with write-type defaults when 'use defaults' is clicked", async () => {
    const { storage } = mount([]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByText(m.nav_block_section_use_defaults({ writeType: "day" })));
    expect(storage.daily?.navBlock.rows.length).toBeGreaterThan(0);
  });

  it("invokes the flow with rowIndex when an edit button is clicked", async () => {
    const { invoke } = mount([sampleRow]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByLabelText(m.nav_block_section_edit_tooltip()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockRowFlow, { journalName: "daily", rowIndex: 0 });
  });

  it("invokes the flow without rowIndex when 'add row' is clicked", async () => {
    const { invoke } = mount([sampleRow]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByText(m.nav_block_section_add_row()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockRowFlow, { journalName: "daily" });
  });

  it("removes a row when its delete button is clicked", async () => {
    const { storage } = mount([sampleRow, { ...sampleRow, template: "{{date:MM}}" }]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    const deleteButtons = screen.getAllByLabelText(m.nav_block_section_delete_tooltip());
    await userEvent.click(deleteButtons[0]!);
    expect(storage.daily?.navBlock.rows.length).toBe(1);
    expect(storage.daily?.navBlock.rows[0]?.template).toBe("{{date:MM}}");
  });

  it("swaps a row up when the up button is clicked on the second row", async () => {
    const a = { ...sampleRow, template: "A" };
    const b = { ...sampleRow, template: "B" };
    const { storage } = mount([a, b]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    const ups = screen.getAllByLabelText(m.nav_block_section_move_up_tooltip());
    await userEvent.click(ups[0]!); // only second row has up button → first up-button refers to row index 1
    expect(storage.daily?.navBlock.rows.map((r) => r.template)).toEqual(["B", "A"]);
  });

  it("hides up arrow on first row and down arrow on last row", async () => {
    mount([
      { ...sampleRow, template: "A" },
      { ...sampleRow, template: "B" },
    ]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getAllByLabelText(m.nav_block_section_move_up_tooltip()).length).toBe(1);
    expect(screen.getAllByLabelText(m.nav_block_section_move_down_tooltip()).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npx vitest run src/code-blocks/nav/settings/ui/NavBlockSection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the section**

Create `src/code-blocks/nav/settings/ui/NavBlockSection.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { Clock, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { JournalsViewModel, journalDefaultsFor, type JournalConfig, type NavBlockRow } from "@/journals";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import NavBlockRow from "../../ui/NavBlockRow.vue";
import { periodForJournal } from "../../period-for-journal";

import { EditNavBlockRowFlow } from "../flows/edit-nav-row.flow";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);

const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));
const expanded = ref(false);

const todayAnchor = computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString);
const previewPeriod = computed(() =>
  config.value ? periodForJournal(config.value.write, todayAnchor.value) : undefined,
);

function useDefaults(): void {
  if (!config.value) return;
  config.value.navBlock.rows = journalDefaultsFor(config.value.write, config.value.name).navBlock.rows;
}

function add(): void {
  void flows.invoke(EditNavBlockRowFlow, { journalName });
}
function edit(index: number): void {
  void flows.invoke(EditNavBlockRowFlow, { journalName, rowIndex: index });
}
function remove(index: number): void {
  config.value?.navBlock.rows.splice(index, 1);
}
function moveUp(index: number): void {
  const rows = config.value?.navBlock.rows;
  if (!rows || index <= 0) return;
  [rows[index - 1], rows[index]] = [rows[index]!, rows[index - 1]!];
}
function moveDown(index: number): void {
  const rows = config.value?.navBlock.rows;
  if (!rows || index >= rows.length - 1) return;
  [rows[index], rows[index + 1]] = [rows[index + 1]!, rows[index]!];
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <span class="journal-section-heading">
        <UiIcon name="signpost-big" />
        <span>{{ m.nav_block_section_title() }}</span>
        <span class="count">{{ config.navBlock.rows.length }}</span>
      </span>
    </template>
    <template #controls>
      <UiButton @click="add">{{ m.nav_block_section_add_row() }}</UiButton>
    </template>

    <UiSettingRow :name="m.nav_block_section_mode_label()">
      <UiDropdown v-model="config.navBlock.type">
        <option value="create">{{ m.nav_block_section_mode_option({ kind: "create" }) }}</option>
        <option value="existing">{{ m.nav_block_section_mode_option({ kind: "existing" }) }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.nav_block_section_decorate_whole_label()">
      <UiToggle v-model="config.navBlock.decorateWholeBlock" />
    </UiSettingRow>

    <UiSettingRow v-if="config.navBlock.rows.length === 0" controls-only>
      <UiButton @click="useDefaults">
        {{ m.nav_block_section_use_defaults({ writeType: config.write.type }) }}
      </UiButton>
    </UiSettingRow>

    <UiSettingRow v-if="config.navBlock.rows.length === 0" no-controls>
      <template #description>{{ m.nav_block_section_empty() }}</template>
    </UiSettingRow>

    <UiSettingRow v-for="(row, index) of config.navBlock.rows" :key="index">
      <template #description>
        <div class="nav-row-preview">
          <NavBlockRow
            :journal="config"
            :row="row"
            :ref-date="todayAnchor"
            :period="previewPeriod!"
            :prevent-navigation="true"
          />
        </div>
      </template>
      <UiIconButton
        v-if="index > 0"
        icon="arrow-up"
        :tooltip="m.nav_block_section_move_up_tooltip()"
        :aria-label="m.nav_block_section_move_up_tooltip()"
        @click="moveUp(index)"
      />
      <UiIconButton
        v-if="index < config.navBlock.rows.length - 1"
        icon="arrow-down"
        :tooltip="m.nav_block_section_move_down_tooltip()"
        :aria-label="m.nav_block_section_move_down_tooltip()"
        @click="moveDown(index)"
      />
      <UiIconButton
        icon="pencil"
        :tooltip="m.nav_block_section_edit_tooltip()"
        :aria-label="m.nav_block_section_edit_tooltip()"
        @click="edit(index)"
      />
      <UiIconButton
        icon="trash"
        :tooltip="m.nav_block_section_delete_tooltip()"
        :aria-label="m.nav_block_section_delete_tooltip()"
        @click="remove(index)"
      />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
.count {
  font-weight: normal;
  color: var(--text-muted);
}
.nav-row-preview {
  display: flex;
  justify-content: center;
  max-width: 240px;
  margin: 0 auto;
}
</style>
```

The `aria-label` on each `UiIconButton` is what the test's `getByLabelText` lookups bind to. If `UiIconButton` already forwards `aria-label` from `tooltip` (check first), drop the duplicate `aria-label` prop and adjust if needed.

- [ ] **Step 4: Run the test to verify pass**

Run: `npx vitest run src/code-blocks/nav/settings/ui/NavBlockSection.test.ts`
Expected: PASS.

If lookups by label fail because `UiIconButton` does not propagate aria-label, fall back to `getAllByRole("button")` filtered by the matching `title`/`tooltip` attribute, or query by icon name via `[data-icon="..."]`.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks/nav/settings/ui/NavBlockSection.vue src/code-blocks/nav/settings/ui/NavBlockSection.test.ts
git commit -m "feat(code-blocks): NavBlockSection"
```

---

## Task 9: module wiring

**Files:**

- Create: `src/code-blocks/nav/settings/module.ts`
- Modify: `src/main.ts`

No tests (per [[no_wiring_tests]]).

The precedent: `decorationsSettingsModule` is registered in `src/main.ts` via `container.addModule(...)`, NOT inside the parent feature module. Follow that pattern.

- [ ] **Step 1: Create the settings module**

Create `src/code-blocks/nav/settings/module.ts`:

```ts
import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";

import { EditNavBlockRowFlow } from "./flows/edit-nav-row.flow";
import NavBlockSection from "./ui/NavBlockSection.vue";

export const navBlockSettingsModule: Module = {
  register(c) {
    c.register(EditNavBlockRowFlow).useClass(EditNavBlockRowFlow);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "nav-block", order: 40, component: NavBlockSection }),
    );
  },
};
```

- [ ] **Step 2: Register it in main.ts**

In `src/main.ts`, add the import next to the other `*/settings/module` imports:

```ts
import { navBlockSettingsModule } from "@/code-blocks/nav/settings/module";
```

And add the registration line in `onload()` directly after `container.addModule(codeBlocksModule);`:

```ts
container.addModule(codeBlocksModule);
container.addModule(navBlockSettingsModule);
```

- [ ] **Step 3: Run full typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/code-blocks/nav/settings/module.ts src/main.ts
git commit -m "feat(code-blocks): register nav-block settings module"
```

---

## Task 10: full verification

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Typecheck**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run check:lint`
Expected: PASS — no `eslint-disable`, no missing-modal warnings (per `[[modals_consolidation]]` eslint rule).

- [ ] **Step 4: If any of the above fails, fix the underlying cause**

Do not silence lint errors with disables ([[no_lint_silence]]). Do not commit if a check fails.

- [ ] **Step 5: Final commit (only if any fix-ups were needed)**

```bash
git add -p   # stage only the fix-up changes
git commit -m "fix(code-blocks): <what the verification revealed>"
```

---

## Self-review checklist (for the implementer)

After all tasks complete, verify against the spec:

- [ ] Section renders at order 40 between commands (10) and decorations (50).
- [ ] Mode dropdown two-ways to `config.navBlock.type`.
- [ ] Decorate-whole toggle two-ways to `config.navBlock.decorateWholeBlock`.
- [ ] "Use defaults" button appears only when `rows.length === 0`.
- [ ] Live preview renders via `NavBlockRow` with `preventNavigation=true`.
- [ ] Add row launches `EditNavBlockRowFlow`; edit launches it with `rowIndex`.
- [ ] Modal: template required; journal required when `link === "journal"`; journal dropdown hidden otherwise; shelf-mates list excludes current journal.
- [ ] Resolved-preview line reflects template input.
- [ ] `UnknownNavRowError` returned on out-of-range `rowIndex`.
- [ ] `VariableReferenceModal` shows `relative_date` and `index` rows for `context="nav-row"`.
- [ ] No `eslint-disable`, no `@ts-expect-error`, all tests use `expectTypeOf` where type assertions are needed.
- [ ] No spec-reference comments in source ([[no_spec_refs_in_source]]); no WHAT-comments ([[no_what_comments]]).
