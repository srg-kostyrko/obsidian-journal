# v3 Navigation Code Block — Settings UI

## Goal

Port v2's per-journal navigation-block editor to v3 under the v3 settings conventions. The runtime block already exists (`src/code-blocks/nav/`); this spec adds the journal-edit section that drives `journal.navBlock.{type, decorateWholeBlock, rows}` and the per-row editor modal.

## Background

In v2, `JournalSettingsEdit.vue` hosts a "Navigation block" collapsible block with:

- a **mode** dropdown (`create` / `existing`),
- a **decorate whole block** toggle,
- a **list of rows** with up / down / edit / delete controls and a live preview, and
- an "Add row" button that opens `EditNavBlockRow.modal.vue`, which carries a template field with live resolved-preview, font/style toggles, two color pickers, a link-kind dropdown, an optional journal dropdown gated on `link === "journal"`, and an "add decorations" toggle.

v3 already has the corresponding ports of every primitive: `JournalEditSectionToken` for plugin-registered subpage sections, `UiSettingRow` + `UiCollapsibleBlock` for layout, `UiColorSettingsPicker` for color settings, `vee-validate` + valibot for forms, the `Flow` + `ModalService` + `defineModal` pattern for modal-launched mutations (`EditDecorationFlow` is the closest twin), and `VariableReferenceHint`/`VariableReferenceModal` for template-variable docs.

The runtime spec landed `navBlockRowSchema`, `NavBlockRow`, `NavBlockRowLink`, and `journalDefaultsFor(write, name).navBlock.rows`. Those are the source of truth for this UI.

## Scope

In scope:

- `src/code-blocks/nav/settings/` — new sub-feature with its own module, one flow, one section component, one modal component, and an `errors.ts` for the one new error class.
- `src/code-blocks/module.ts` — `useModule(navBlockSettingsModule)`.
- `src/journals/settings/ui/variable-context.ts` + `VariableReferenceModal.vue` — extend with a `"nav-row"` context that lists the nav-row-specific variables (`relative_date`, `index`) alongside the shared ones.
- i18n: section labels, modal labels, link-kind option labels, variable-hint context label.

Out of scope:

- Any change to `navBlockSchema` or `NavBlockRow` (already defined).
- Drag-to-reorder (no v3 precedent yet; v2 used arrows).
- Confirmation modal on row delete (v2 had none; rows are trivial to recreate).
- A `calendarViewBlock` editor — obsolete in v3.

## Architecture

```
src/
  code-blocks/
    module.ts                                + useModule(navBlockSettingsModule)
    nav/
      settings/
        module.ts                            registers flow + JournalEditSection
        errors.ts                            UnknownNavRowError + toNavRowFlowError
        flows/
          edit-nav-row.flow.ts
          edit-nav-row.flow.test.ts
        ui/
          NavBlockSection.vue
          NavBlockSection.test.ts
          EditNavBlockRowModal.vue
          EditNavBlockRowModal.test.ts
          modals.ts                          editNavBlockRowModal definition
          use-shelf-mate-journals.ts         pure: shelf-mates excluding current
          use-shelf-mate-journals.test.ts
  journals/
    settings/
      ui/
        variable-context.ts                  + "nav-row"
        VariableReferenceModal.vue           + nav-row branch
```

The `navBlockSettingsModule` registers `EditNavBlockRowFlow` and a `JournalEditSection` with `key: "nav-block"`, `order: 40`. Order 40 sits between `shelf` (5) / `commands` (10) and `decorations` (50), grouping nav with other code-block-shape config above decorations.

## Section component — `NavBlockSection.vue`

Props: `{ journalName: string }` (matches every other `JournalEditSection`).

Services: `JournalsViewModel`, `Flows`, `Calendar` (for today's anchor).

Reactive state (mirrors `DecorationsSection` / `JournalEditSubpage`):

- `config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never))`. The underlying object is the live reactive storage entry; mutating `config.value.navBlock.*` flows back through settings.
- Template guards the body with `v-if="config"` (matches `JournalEditSubpage`); inside the guard, `config` is non-null and reactive.
- `todayAnchor = computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString)`.
- `previewPeriod = computed(() => config.value ? periodForJournal(config.value.write, todayAnchor.value) : undefined)` — reuses the helper at `src/code-blocks/nav/period-for-journal.ts` (already module-scoped, so the settings UI can import it without reaching into `nav/ui/`).

Layout (top to bottom inside a `UiCollapsibleBlock`):

1. `UiSettingRow` — **Mode**. `UiDropdown` two-way to `navBlock.type`, options `create` / `existing` via `m.nav_block_section_mode_option({ kind })`.
2. `UiSettingRow` — **Decorate whole block**. `UiToggle` two-way to `navBlock.decorateWholeBlock`.
3. `UiSettingRow` (controls-only) shown **only when `navBlock.rows.length === 0`** — `UiButton` "Use defaults for {writeType}" → assigns `journalDefaultsFor(config.write, config.name).navBlock.rows` to `navBlock.rows` (one-shot; the button disappears as soon as a row exists).
4. `UiSettingRow v-if="navBlock.rows.length === 0"` (no-controls) showing `m.nav_block_section_empty()` ("No rows. Add one or use the defaults above.").
5. `UiSettingRow` per row — `#description` slot renders the live preview, controls slot holds the four `UiIconButton`s.

Section trigger uses `signpost-big` icon + `m.nav_block_section_title()`; header controls slot has the `Add row` `UiButton`. Row count flair (`<span class="count">{{ navBlock.rows.length }}</span>`) matches `DecorationsSection`.

### Preview cell per row

```vue
<UiSettingRow v-for="(row, index) of navBlock.rows" :key="index">
  <template #description>
    <div class="nav-row-preview">
      <NavBlockRow
        :journal="config"
        :row="row"
        :ref-date="todayAnchor"
        :period="previewPeriod"
        :prevent-navigation="true"
      />
    </div>
  </template>
  <UiIconButton v-if="index > 0"                       icon="arrow-up"   @click="moveUp(index)" />
  <UiIconButton v-if="index < navBlock.rows.length - 1" icon="arrow-down" @click="moveDown(index)" />
  <UiIconButton                                         icon="pencil"    @click="edit(index)" />
  <UiIconButton                                         icon="trash"     @click="remove(index)" />
</UiSettingRow>
```

`prevent-navigation` is already wired on `NavBlockRow` for exactly this case (handlers no-op when true). Today's anchor is the v2 default. The preview wraps the row in a centered max-width container (style scoped) so long templates don't blow out the row layout.

### Mutations

| Action          | Implementation                                                                        |
| --------------- | ------------------------------------------------------------------------------------- |
| Mode dropdown   | Two-way to `config.navBlock.type` (`v-model`).                                        |
| Decorate toggle | Two-way to `config.navBlock.decorateWholeBlock`.                                      |
| Use defaults    | `config.navBlock.rows = journalDefaultsFor(config.write, config.name).navBlock.rows`. |
| Add row         | `flows.invoke(EditNavBlockRowFlow, { journalName })`.                                 |
| Edit row        | `flows.invoke(EditNavBlockRowFlow, { journalName, rowIndex: i })`.                    |
| Move up         | `[rows[i-1], rows[i]] = [rows[i], rows[i-1]]`.                                        |
| Move down       | `[rows[i], rows[i+1]] = [rows[i+1], rows[i]]`.                                        |
| Delete          | `rows.splice(i, 1)`.                                                                  |

The split between flow-driven (modal actions) and direct-mutation (pure array shuffles, simple toggles) matches the templates list in `JournalEditSubpage.vue` and the decorations section: anything with a modal goes through a flow; pure list manipulation mutates the reactive config directly.

## Flow — `EditNavBlockRowFlow`

Mirrors `EditDecorationFlow` shape.

```ts
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

  execute(input: EditNavBlockRowParameters): AsyncResult<EditNavBlockRowResult, FlowError> {
    const configOption = this.#repository.get(input.journalName);
    if (configOption.isNone()) {
      return AsyncResult.err(toJournalFlowError(new UnknownJournalError(input.journalName)));
    }
    const config = configOption.getOr(undefined as never);
    const rowIndex = input.rowIndex;
    const isEdit = rowIndex !== undefined;
    if (isEdit && (rowIndex < 0 || rowIndex >= config.navBlock.rows.length)) {
      return AsyncResult.err(toNavRowFlowError(new UnknownNavRowError(input.journalName, rowIndex)));
    }
    const existing = isEdit ? config.navBlock.rows[rowIndex] : undefined;
    return attempt.in(this, async function* (this: EditNavBlockRowFlow) {
      const submitted = yield* this.#modals
        .open(editNavBlockRowModal, { journalName: input.journalName, row: existing })
        .mapErr(() => new UserAborted("edit-nav-block-row-modal"));
      const nextRows = isEdit
        ? config.navBlock.rows.map((r, i) => (i === rowIndex ? submitted.row : r))
        : [...config.navBlock.rows, submitted.row];
      this.#repository.update(input.journalName, {
        navBlock: { ...config.navBlock, rows: nextRows },
      });
      const newIndex = isEdit ? rowIndex : config.navBlock.rows.length;
      return { row: submitted.row, index: newIndex };
    });
  }
}
```

`UnknownNavRowError` + `toNavRowFlowError` mirror `UnknownDecorationError` + `toDecorationFlowError` in `src/decorations/errors.ts` — same constructor shape (`journalName`, `index`), same `FlowError` mapping helper. No other new error classes.

## Modal — `EditNavBlockRowModal.vue`

`useModal<{ row: NavBlockRow }>()` for the contract.

Initial values:

```ts
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
```

(Same shape as `emptyNavRow` in `src/journals/config.ts`. Inline here rather than exporting `emptyNavRow` — the constant is internal to the defaults helper and this modal is its only other reader.)

Validation schema:

```ts
const schema = v.pipe(
  navBlockRowSchema, // imported from @/journals/config
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
```

`navBlockRowSchema` itself accepts an empty string as a valid `template` (it's just `v.string()` in the runtime spec); the `partialCheck` adds the non-empty constraint at the form layer where the user-facing error fits. Reusing `navBlockRowSchema` keeps the structural types in sync with the runtime even when form-only constraints layer on top.

Field rows, in order, each in a `UiSettingRow` with errors in `#description` slot via `errorBag.<field>`:

| Field            | Control                 | Description slot extras                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `template`       | `UiTextInput`           | `<VariableReferenceHint context="nav-row" :journal-name :date-format="config.dateFormat" :has-cycle="config.write.type !== 'day'" :numbering-variable-names />` and a resolved-preview line; v2-style `WrongWeekWarning` for `{{date:...W...}}` templates is **deferred** (v3 has no port yet — leave a `[[wrong-week-warning]]` link memory for follow-up). |
| `fontSize`       | `UiNumberInput`         | `:min="0.5" :step="0.1"`                                                                                                                                                                                                                                                                                                                                     |
| `bold`           | `UiToggle`              | —                                                                                                                                                                                                                                                                                                                                                            |
| `italic`         | `UiToggle`              | —                                                                                                                                                                                                                                                                                                                                                            |
| `color`          | `UiColorSettingsPicker` | Reused from decorations.                                                                                                                                                                                                                                                                                                                                     |
| `background`     | `UiColorSettingsPicker` | —                                                                                                                                                                                                                                                                                                                                                            |
| `link`           | `UiDropdown`            | Options: `none`, `self`, `journal`, `day`, `week`, `month`, `quarter`, `year` — labels via `m.nav_block_row_link_option({ kind })`.                                                                                                                                                                                                                          |
| `journal`        | `UiDropdown`            | `v-if="link === 'journal'"`; options come from `useShelfMateJournals(journalName)`.                                                                                                                                                                                                                                                                          |
| `addDecorations` | `UiToggle`              | —                                                                                                                                                                                                                                                                                                                                                            |

Bottom row: `UiSettingRow controls-only` with Cancel (`api.cancel()`) and Save (`type="submit"` → `handleSubmit` → `api.submit({ row: values })`).

### Resolved-preview line

```ts
const engine = useService(TemplateEngine);
const cycle = useService(CycleService);
const index = useService(JournalsIndex);
const clock = useService(Clock);

const resolved = computed(() => {
  const today = clock.now().format("YYYY-MM-DD") as AnchorString;
  return engine.renderString(
    template.value ?? "",
    buildNavRowContext({
      journal: config,
      refDate: today,
      entry: index.entryByAnchor(config.name, today),
      cycle,
      today,
    }),
  );
});
```

Renders below the `VariableReferenceHint` as `m.nav_block_row_resolved_preview({ text: resolved })`. The `engine.renderString` call is total — failed lookups yield empty strings, no try/catch needed.

`buildNavRowContext` already lives in `src/code-blocks/nav/nav-row-context.ts` from the runtime spec — re-use it.

### Shelf-mate journals — `use-shelf-mate-journals.ts`

```ts
export function useShelfMateJournals(journalName: string): ComputedRef<readonly string[]> {
  const shelves = useService(ShelvesRepository);
  const journals = useService(JournalsViewModel);
  return computed(() => {
    const config = journals.getJournal(journalName).getOr(undefined as never);
    if (!config) return [];
    const shelfName = shelves
      .find()
      .list()
      .find((s) => s.journals.includes(journalName))?.name;
    return shelves
      .find()
      .list()
      .filter((s) => s.name === shelfName)
      .flatMap((s) => s.journals)
      .filter((name) => name !== journalName);
  });
}
```

Pure composable, deterministic for tests, hides the shelf lookup from the modal component. v2 used a `useShelfProvider` + `useShelf` pair; v3 has neither yet, and this is the only consumer that needs it, so inline composition wins over a new shared abstraction.

## i18n keys (new)

| Key                                                                                                           | Wording                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `nav_block_section_title`                                                                                     | `"Navigation block"`                                                                        |
| `nav_block_section_mode_label`                                                                                | `"Mode"`                                                                                    |
| `nav_block_section_mode_option({ kind })`                                                                     | `"Create new note"` / `"Open existing note"`                                                |
| `nav_block_section_decorate_whole_label`                                                                      | `"Decorate whole block"`                                                                    |
| `nav_block_section_use_defaults({ writeType })`                                                               | `"Use defaults for {writeType}"`                                                            |
| `nav_block_section_empty`                                                                                     | `"No rows. Add one or use the defaults above."`                                             |
| `nav_block_section_add_row`                                                                                   | `"Add row"`                                                                                 |
| `nav_block_section_edit_tooltip` / `_delete_tooltip` / `_move_up` / `_move_down`                              | tooltips for the four row buttons                                                           |
| `nav_block_row_modal_title({ mode })`                                                                         | `"Add nav block row"` / `"Edit nav block row"`                                              |
| `nav_block_row_field_template`                                                                                | `"Template"`                                                                                |
| `nav_block_row_field_font_size`                                                                               | `"Font size"`                                                                               |
| `nav_block_row_field_bold` / `_italic` / `_color` / `_background` / `_link` / `_journal` / `_add_decorations` | matching labels                                                                             |
| `nav_block_row_link_option({ kind })`                                                                         | `"None"` / `"Self"` / `"Journal"` / `"Day"` / `"Week"` / `"Month"` / `"Quarter"` / `"Year"` |
| `nav_block_row_template_required`                                                                             | `"Template is required"`                                                                    |
| `nav_block_row_journal_required`                                                                              | `"Please select a journal"`                                                                 |
| `nav_block_row_resolved_preview({ text })`                                                                    | `"Resolved: {text}"`                                                                        |

Existing `m.journal_edit_variable_reference_link()` is reused by `VariableReferenceHint`. The `VariableReferenceModal` gets one new branch (see below); no new label key for that — the existing modal title is generic.

## Variable-reference extension

`src/journals/settings/ui/variable-context.ts`:

```ts
export type VariableModalContext = "name-template" | "folder-path" | "template-path" | "nav-row";
```

`VariableReferenceModal.vue` adds, for `context === "nav-row"`, two more rows:

- `relative_date` → `m.journal_edit_variable_relative_date_description()` ("`yesterday` / `today` / `tomorrow` / `N days ago` for fixed-cycle journals; empty for custom journals.")
- `index` → `m.journal_edit_variable_index_description()` ("Sequential number when the journal has numbering enabled.")

`NON_INVERTIBLE_CONTEXTS` is unchanged (`nav-row` is not invertible-relevant — there's no path round-trip). `start_date`/`end_date`/numbering rows are shown when `hasCycle` is true and numbering names are present, same as today.

The `JournalEditSubpage` itself never opens this with `"nav-row"`; only the modal opens it. The existing five context-aware behaviors stay intact for the three existing contexts.

## Module wiring

`src/code-blocks/nav/settings/module.ts`:

```ts
export const navBlockSettingsModule: Module = {
  register(c) {
    c.register(EditNavBlockRowFlow).useClass(EditNavBlockRowFlow);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "nav-block", order: 40, component: NavBlockSection }),
    );
  },
};
```

`src/code-blocks/module.ts` (existing) adds `useModule(navBlockSettingsModule)` alongside the runtime block registrations.

## Testing

| Subject                                 | File                                                                         | Style                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EditNavBlockRowFlow`                   | `code-blocks/nav/settings/flows/edit-nav-row.flow.test.ts`                   | Container fixture + fake `ModalService` + real `JournalsRepository` (in-memory). Cases: missing journal → `UnknownJournalError` via flow err; out-of-range `rowIndex` → `UnknownNavRowError` via flow err; cancel → no mutation; add → `repository.update` called with rows-plus-new and original mode/decorate preserved; edit → rows-with-replacement; result `index` correct for both add and edit.                                                                                                                                                                                                                                                        |
| `useShelfMateJournals`                  | `code-blocks/nav/settings/ui/use-shelf-mate-journals.test.ts`                | Pure: shelf membership lookup; excludes current journal; returns empty when journal is not in any shelf; reactive to shelf changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `EditNavBlockRowModal`                  | `code-blocks/nav/settings/ui/EditNavBlockRowModal.test.ts`                   | `@testing-library/vue` + `user-event` + container fixture. Cases: opens blank when `row` undefined; opens with values pre-filled when `row` given; submit returns full `NavBlockRow`; cancel returns cancelled; empty template → submit blocked + error visible; `link=journal` with empty journal → submit blocked + error visible; journal dropdown hidden when `link !== "journal"`; journal dropdown lists shelf-mates and excludes current; resolved-preview reflects template input including `{{date:YYYY}}` / `{{journal_name}}`; color/background pickers two-way bind.                                                                              |
| `NavBlockSection`                       | `code-blocks/nav/settings/ui/NavBlockSection.test.ts`                        | testing-library/vue + container fixture with fakes for `Flows` (assert invocations), `Clock` (stable today). Cases: empty rows → renders "Use defaults" button and empty-state copy; clicking "Use defaults" populates the row array with the write-type defaults; non-empty rows → renders one preview per row, no defaults button; mode dropdown writes through to `config.navBlock.type`; decorate toggle writes through; first row hides ↑, last row hides ↓; move-up swaps with previous; move-down with next; delete splices; add button invokes `EditNavBlockRowFlow` with `{ journalName }`; edit button invokes it with `{ journalName, rowIndex }`. |
| `VariableReferenceModal` nav-row branch | `journals/settings/ui/VariableReferenceModal.test.ts` (existing — add cases) | New cases: `context="nav-row"` renders `relative_date` and `index` rows; existing contexts still don't.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Explicitly not tested: `navBlockSettingsModule` shape, `editNavBlockRowModal` `defineModal` value, the `NavBlockRow` component itself (covered by the runtime spec), `journalDefaultsFor` row shape (covered by `journals/config.test.ts`).

Verification gates before completion: `npm test`, `npm run check:types`, `npm run check:lint`.

## Error handling

| Surface                             | Behavior                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journal disappears mid-flow         | `EditNavBlockRowFlow` returns `UnknownJournalError` via `toJournalFlowError` — same path as `EditDecorationFlow`. UI: standard flow-error notice. |
| `rowIndex` drifts (concurrent edit) | `UnknownNavRowError` via `toNavRowFlowError` — parallel to `UnknownDecorationError`.                                                              |
| Modal cancelled                     | `ModalService.open` rejects → `mapErr` to `UserAborted("edit-nav-block-row-modal")`.                                                              |
| Template render in resolved-preview | `TemplateEngine.renderString` is total; bad input yields a partial string, never throws.                                                          |
| Schema validation                   | `vee-validate` keeps invalid values in form state but blocks submit. `partialCheck` failures show in `errorBag.template` / `errorBag.journal`.    |

New errors: `UnknownNavRowError`. Reused: `UnknownJournalError`, `UserAborted`.
