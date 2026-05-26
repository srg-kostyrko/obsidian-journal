# Decoration Settings UI — v3 Port

**Date:** 2026-05-26
**Status:** Draft
**Scope:** Port the v2 calendar-decoration editor UI into v3, plugged into the existing journal edit subpage.

## Goal

In v2, each journal can carry a list of _calendar decorations_ — visual markers (background, color, shape, corner, icon, border) shown on calendar cells whose date matches a set of conditions (title/tag/property/date/weekday/offset/has-note/has-open-task/all-tasks-completed). v3 already has the engine, schema, runtime types, and rendering primitives (`src/decorations/`), and `journal.decorations` is part of `JournalConfig`. What's missing is the settings UI that lets users author and edit those decorations.

This spec covers the UI port only. The schema, engine, runtime decoration rendering, and config storage already exist and don't change.

## Non-goals

- No changes to `src/decorations/config.ts`, `engine.ts`, `derive-styles.ts`, `use-cell-decorations.ts`, or the `CellDecoration` SFC.
- No changes to `JournalConfig` shape or migrations.
- No new condition or style variants beyond v2.
- No bulk import/export, no copy-decoration-between-journals.

## v2-fidelity rule

Per `feedback_v2_fidelity_default`, every v2 variant/mode/option is preserved. Three deliberate UX additions on top of v2:

1. **Delete confirmation modal** (v2 deletes immediately).
2. **Submit-time schema validation** (v2 has none).
3. **Typed-field architecture** — leaf editors use `defineModel` / vee-validate field paths, removing the `emit("change", {prop, value})` indirection v2 used.

No v2 behavior is dropped.

## Architecture

A new sub-feature `src/decorations/settings/` mirrors `src/journals/settings/`. It exports `decorationsSettingsModule`, registered in `main.ts` after `journalsSettingsModule` so its `JournalEditSectionToken` multi-binding is picked up by `JournalEditSubpage`.

```
src/decorations/
  settings/
    module.ts
    ui/
      DecorationsSection.vue
      EditDecorationModal.vue
      DeleteDecorationModal.vue
      ConditionItem.vue
      ConditionTitle.vue
      ConditionTag.vue
      ConditionProperty.vue
      ConditionDate.vue
      ConditionWeekday.vue
      ConditionOffset.vue
      ConditionTypeOnly.vue
      StyleItem.vue
      StyleBackground.vue
      StyleColor.vue
      StyleBorder.vue
      StyleBorderSide.vue
      StyleShape.vue
      StyleCorner.vue
      StyleIcon.vue
      describe-condition.ts
      modals.ts
    flows/
      edit-decoration.flow.ts
      delete-decoration.flow.ts
  errors.ts                          // new: UnknownDecorationError
src/ui/
  UiColorSettingsPicker.vue          // new: shared, schema-agnostic primitive
```

Module registration:

```ts
// src/decorations/settings/module.ts
export const decorationsSettingsModule: Module = {
  register(c) {
    c.register(EditDecorationFlow).useClass(EditDecorationFlow).lifetime(Lifetime.Transient);
    c.register(DeleteDecorationFlow).useClass(DeleteDecorationFlow).lifetime(Lifetime.Transient);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({
        key: "decorations",
        order: 50,
        component: DecorationsSection,
      }),
    );
  },
};
```

`Container` is the default lifetime per `feedback_di_omit_default_lifetime`, so the section binding has no explicit lifetime.

`main.ts` adds:

```ts
import { decorationsSettingsModule } from "@/decorations/settings/module";
// ...
container.addModule(decorationsSettingsModule);
```

## Components

### `DecorationsSection.vue`

Plugged into `JournalEditSubpage` via `JournalEditSectionToken`. Reads the journal config through `JournalsViewModel.getJournal`. Renders a `UiCollapsibleBlock` with a `paintbrush` icon, the localized section title, and a count flair. Header `#controls` slot holds "Add decoration" (invokes `EditDecorationFlow` with no `index`). Body:

- Empty-state `UiSettingRow` when `decorations.length === 0`.
- One `UiSettingRow` per decoration; `#description` renders:
  - A `CellDecoration` preview using today's day-of-month and the decoration's `styles`.
  - The decoration's conditions: each one rendered via `describeCondition(condition)`, joined by the localized AND/OR word derived from `decoration.mode`.
- Trailing controls: pencil → `EditDecorationFlow({ journalName, index })`; trash → `DeleteDecorationFlow({ journalName, index })`.

The component never mutates `decorations` directly — all mutations go through flows, which write through `JournalsRepository.update`. The reactive config object the view-model returns updates in place, so the row list re-renders without manual refresh.

### `EditDecorationModal.vue`

Takes flow input `{ journalName: string; decoration?: JournalDecoration; writeType: JournalConfig["write"]["type"] }` via `useModal`. Emits the submitted `JournalDecoration` via `api.submit({ decoration })`.

Form state is a single vee-validate `useForm`:

```ts
const { values, errorBag, handleSubmit } = useForm({
  initialValues: decoration ?? { mode: "and", conditions: [], styles: [] },
  validationSchema: toTypedSchema(
    v.pipe(
      decorationSchema,
      v.check((d) => d.conditions.length > 0, m.decoration_no_conditions_error()),
      v.check((d) => d.styles.length > 0, m.decoration_no_styles_error()),
    ),
  ),
});
const conditions = useFieldArray<JournalDecorationCondition>("conditions");
const styles = useFieldArray<JournalDecorationStyle>("styles");
```

The reused valibot schema is `decorationSchema` from `src/decorations/config.ts` (`feedback_infer_from_valibot`).

Layout (matches v2):

- Mode selector: "Decorate elements in calendar when [all conditions are | any condition is] fulfilled".
- "Add condition" `UiButtonDropdown` whose options come from `availableConditionTypes` (see below).
- One `UiSettingRow` per condition; for `i > 0`, the row shows the AND/OR badge above. Body: `<ConditionItem :name="\`conditions.${i}\`" />` + trash icon.
- A horizontal separator.
- Two-column preview/styles grid:
  - Left column: centered `CellDecoration` preview bound to `values.styles` with today's day-of-month.
  - Right column: "Add style" `UiButtonDropdown`, then one `UiSettingRow` per style (`StyleItem :name="\`styles.${i}\`"`) preceded by a header row with the style's localized name and a trash icon. Per-style separators.
- Footer `UiSettingRow heading` with Cancel + Save.

`availableConditionTypes` filters by `writeType`, mirroring v2 exactly:

```ts
const common = ["title", "tag", "property", "has-note", "has-open-task", "all-tasks-completed"] as const;
const extras =
  writeType === "day" ? (["date", "weekday"] as const) : writeType === "custom" ? (["offset"] as const) : ([] as const);
const all = [...common, ...extras];
const used = new Set(values.conditions.map((c) => c.type));
return all.filter((t) => !used.has(t));
```

`availableStyleTypes` works the same way over the closed set `["background", "color", "shape", "corner", "icon", "border"]`.

Add/remove handlers:

- `conditions.push(defaultCondition(type))` / `styles.push(defaultStyle(type))` use the existing `defaultCondition` and `defaultStyle` factories from `src/decorations/defaults.ts`.
- Remove uses `useFieldArray.remove(index)`.

Submit:

```ts
const onSubmit = handleSubmit((decoration) => api.submit({ decoration }));
```

### `ConditionItem.vue` / `StyleItem.vue`

Pure dispatch components. Each takes a single `name: string` prop (the form field path prefix, e.g. `"conditions.3"`) plus the corresponding value (read from `useForm().values` by the parent and passed in). Uses `ts-pattern.match(value.type).with(...).exhaustive()` (per `feedback_ts_pattern_over_switch`) to pick the leaf and forwards `name`.

### Leaf editors

Each leaf takes only `{ name: string }` and uses `defineField(\`${name}.<sub-field>\`)` to bind individual inputs. No prop drilling of values, no emit-change indirection. Errors render in `UiSettingRow`'s `#description` slot via `errorBag[\`${name}.<sub-field>\`]`per`feedback_form_errors_in_description_slot`.

| Leaf                | Sub-fields bound                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `ConditionTitle`    | `.condition`, `.value`                                                                                 |
| `ConditionTag`      | `.condition`, `.value`                                                                                 |
| `ConditionProperty` | `.name`, `.valueType`, `.condition`, `.value` (input type switches on `valueType`)                     |
| `ConditionDate`     | `.day`, `.month`, `.year`                                                                              |
| `ConditionWeekday`  | `.weekdays` (checkbox group; names from `moment.localeData()` per `feedback_date_strings_from_moment`) |
| `ConditionOffset`   | `.offset`                                                                                              |
| `ConditionTypeOnly` | no fields (renders a localized description)                                                            |
| `StyleBackground`   | `.color` (via `UiColorSettingsPicker`)                                                                 |
| `StyleColor`        | `.color`                                                                                               |
| `StyleBorder`       | `.border`, plus four nested `StyleBorderSide` for left/right/top/bottom                                |
| `StyleBorderSide`   | `.show`, `.width`, `.color`, `.style`                                                                  |
| `StyleShape`        | `.shape`, `.size`, `.color`, `.placement_x`, `.placement_y`                                            |
| `StyleCorner`       | `.placement`, `.color`                                                                                 |
| `StyleIcon`         | `.icon` (via `UiIconSuggest`), `.size`, `.color`, `.placement_x`, `.placement_y`                       |

### `UiColorSettingsPicker.vue` (shared)

Promoted to `src/ui/`. Single `v-model: ColorSettings`. Schema-agnostic — no vee-validate inside.

- `UiDropdown` for kind (`transparent | theme | custom`).
- When `theme`: `UiInputSuggestInput` of CSS variable names (suggests `--text-*`, `--background-*`, etc.; the suggestion list is hard-coded for now).
- When `custom`: existing `UiColorPicker` bound to the `color` string.
- When `transparent`: no further inputs.

Switching kind emits the default shape for that kind:

- `transparent` → `{ type: "transparent" }`
- `theme` → `{ type: "theme", name: "" }`
- `custom` → `{ type: "custom", color: "#000000" }`

### `DeleteDecorationModal.vue`

One-paragraph warning (`m.decoration_delete_modal_warning()`) plus a `UiSettingRow heading` with Cancel + Delete. Delete calls `api.submit({ confirmed: true })`.

## Flows

### `EditDecorationFlow`

```ts
input:  { journalName: string; index?: number }
output: { decoration: JournalDecoration; index: number }
error:  FlowError
```

Pipeline (`attempt.in(this, async function* (this) { ... })`):

1. `yield* Option.fromNullable(this.#repository.get(journalName).getOr(undefined)).okOrElse(() => toJournalFlowError(new UnknownJournalError(journalName)))` — `toJournalFlowError` is the journals-feature `toFlowError`, aliased on import to avoid collision with the decorations one.
2. If `index !== undefined` and out of range → return `toDecorationFlowError(new UnknownDecorationError(journalName, index))`.
3. Pick `existing = index !== undefined ? config.decorations[index] : undefined`.
4. `submitted = yield* this.#modals.open(editDecorationModal, { journalName, decoration: existing, writeType: config.write.type }).mapErr(() => new UserAborted("edit-decoration-modal"))`.
5. Compute the new array:
   - Add: `decorations = [...config.decorations, submitted.decoration]`; new index = `config.decorations.length`.
   - Edit: replace at `index`.
6. `this.#repository.update(journalName, { decorations })`.
7. Return `{ decoration: submitted.decoration, index: newIndex }`.

### `DeleteDecorationFlow`

```ts
input: {
  journalName: string;
  index: number;
}
output: {
  deleted: JournalDecoration;
}
error: FlowError;
```

1. Same `UnknownJournalError` lookup via `toJournalFlowError`.
2. Out-of-range index → `toDecorationFlowError(new UnknownDecorationError(...))`.
3. `yield* this.#modals.open(deleteDecorationModal, { journalName }).mapErr(() => new UserAborted("delete-decoration-modal"))`.
4. `this.#repository.update(journalName, { decorations: config.decorations.filter((_, i) => i !== index) })`.
5. Return `{ deleted: config.decorations[index] }`.

### Errors

New file at the feature root `src/decorations/errors.ts` (per `feedback_errors_in_errors_ts` — errors belong in the feature's errors.ts, not the sub-feature's). The journals feature owns the `JournalLifecycleError` union and its own `toFlowError`; the decorations feature defines its own parallel pair so it doesn't have to extend journals' union (cross-feature coupling).

```ts
import { FlowError } from "@/infrastructure/flows";

export class UnknownDecorationError extends Error {
  readonly kind = "unknown-decoration" as const;
  constructor(
    public readonly journalName: string,
    public readonly index: number,
  ) {
    super(`Decoration not found: journal=${journalName} index=${index}`);
    this.name = "UnknownDecorationError";
  }
}

export type DecorationLifecycleError = UnknownDecorationError;

export class DecorationLifecycleFlowError extends FlowError {
  readonly kind = "decoration-lifecycle" as const;
  constructor(public override readonly cause: DecorationLifecycleError) {
    super(cause.message);
    this.name = "DecorationLifecycleFlowError";
  }
}

export function toDecorationFlowError(cause: DecorationLifecycleError): DecorationLifecycleFlowError {
  return new DecorationLifecycleFlowError(cause);
}
```

The "unknown journal" case in both flows reuses `UnknownJournalError` + `toFlowError` from `src/journals/errors.ts` — that's already a public, cross-feature error contract. `UserAborted` comes from `src/infrastructure/flows`.

### Modal registration

```ts
// src/decorations/settings/ui/modals.ts
export const editDecorationModal = defineModal<{ decoration: JournalDecoration }>()({
  component: EditDecorationModal,
  title: ({
    decoration,
  }: {
    journalName: string;
    decoration?: JournalDecoration;
    writeType: JournalConfig["write"]["type"];
  }) => (decoration ? m.decoration_edit_modal_title() : m.decoration_add_modal_title()),
});

export const deleteDecorationModal = defineModal<{ confirmed: true }>()({
  component: DeleteDecorationModal,
  title: (_: { journalName: string }) => m.decoration_delete_modal_title(),
});
```

## Helpers

### `describe-condition.ts`

Pure function `(condition: JournalDecorationCondition) => string`. Uses `ts-pattern.match` to dispatch on `condition.type` and returns a localized string via the `m.decoration_condition_*_describe` messages. Weekday names come from `moment.localeData()` (`feedback_date_strings_from_moment`). Used by `DecorationsSection` to render the conditions sentence beneath each row.

Not a composable — no reactivity, just localization.

## i18n

All new messages live in `messages/en.json`. Names use the `decoration_*` prefix; the shared color picker uses `ui_color_*`. See the full list in the design discussion above; only the canonical names are repeated here for the spec:

- Section: `decoration_section_title`, `decoration_section_description`, `decoration_section_empty`, `decoration_add_button`, `decoration_edit_tooltip`, `decoration_delete_tooltip`.
- Row description: `decoration_describe_when`, `decoration_describe_mode({ kind })`, and one `decoration_condition_*_describe` per condition type with its relevant args.
- Modal titles: `decoration_add_modal_title`, `decoration_edit_modal_title`, `decoration_delete_modal_title`, `decoration_delete_modal_warning`.
- Modal body — conditions: `decoration_modal_mode_prefix`, `decoration_modal_mode_option({ kind })`, `decoration_modal_mode_suffix`, `decoration_modal_add_condition`, `decoration_modal_no_conditions`, `decoration_no_conditions_error`, `decoration_condition_type_label({ type })`, plus per-condition field labels.
- Modal body — styles: `decoration_modal_add_style`, `decoration_modal_no_styles`, `decoration_no_styles_error`, `decoration_style_type_label({ type })`, `decoration_style_header({ type })`, plus per-style field labels and parametric option-labels (`decoration_placement_x_label`, `decoration_shape_label`, `decoration_corner_placement_label`, `decoration_border_mode_label`, `decoration_border_style_label`).
- String operator label: `decoration_string_op_label({ op })`.
- Shared picker: `ui_color_kind_label({ kind })`, `ui_color_theme_variable_label`, `ui_color_custom_label`.

All `m.*()` calls are inlined directly in templates (`feedback_no_computed_around_i18n`).

## Testing

Tests are colocated next to source per `feedback_test_hygiene`; components use `@testing-library/vue` + `user-event` per `feedback_testing_library_for_components`. Each test names a behavior subject + verb per `feedback_test_descriptions` and asserts one behavior per test per `feedback_one_behavior_per_test`. Scope hierarchies use nested `describe` per `feedback_nested_describes`.

### Pure-function tests

- `describe-condition.test.ts` — one `describe` per condition variant; one assertion per test. Verifies localized string for representative inputs. The weekday case verifies moment-supplied names appear.

### Leaf editor tests

One file per leaf. Each renders inside a host that drives `useForm` with a starting decoration value and binds the leaf to a known path. Tests drive inputs via `user-event` and assert observable form state (`values`, not DOM internals).

### Dispatcher tests

`ConditionItem.test.ts` and `StyleItem.test.ts` — one test per variant, asserting that the right leaf renders. Identified by a label/role the leaf shows, not by component identity.

### `EditDecorationModal.test.ts`

- Submit is blocked when conditions array is empty (no `api.submit` call).
- Submit is blocked when styles array is empty.
- Successful submit calls `api.submit` with the assembled decoration.
- "Add condition" dropdown options for `writeType: "day"` include `date` and `weekday` but not `offset`.
- "Add condition" dropdown options for `writeType: "custom"` include `offset` but not `date`/`weekday`.
- "Add condition" dropdown options for other write types include common types only.
- Mode toggle is reflected in the submitted decoration.
- Removing the last condition disables submit.
- Removing the last style disables submit.

### `DeleteDecorationModal.test.ts`

- Confirm calls `api.submit({ confirmed: true })`.
- Cancel calls `api.cancel()`.

### `DecorationsSection.test.ts`

- Empty state renders when the journal has no decorations.
- Each decoration row renders the description string from `describe-condition`.
- "Add decoration" invokes `EditDecorationFlow` with `{ journalName }` and no `index`.
- Pencil click invokes `EditDecorationFlow` with the correct `{ journalName, index }`.
- Trash click invokes `DeleteDecorationFlow` with the correct `{ journalName, index }`.
- A new row appears after the add flow resolves (driven by the repository update).

`Flows` is mocked using the same fake pattern used by existing journal-section tests.

### `edit-decoration.flow.test.ts`

- Unknown journal returns `UnknownJournalError` wrapped in a `FlowError`.
- Out-of-range index on edit returns `UnknownDecorationError`.
- User cancels the modal → `UserAborted("edit-decoration-modal")`.
- Add path: repository receives `{ decorations: [...prev, submitted] }` and the flow returns `index === prev.length`.
- Edit path: repository receives an array with `index` replaced; flow returns the same `index`.

Errors injected via `vi.spyOn` on the modal service per `feedback_no_baked_in_error_simulation`.

### `delete-decoration.flow.test.ts`

- Unknown journal → `UnknownJournalError`.
- Out-of-range index → `UnknownDecorationError`.
- User cancels → `UserAborted("delete-decoration-modal")`.
- Confirm path: repository receives the array with `index` filtered out; flow returns the deleted decoration.

### `UiColorSettingsPicker.test.ts`

- Switching kind to `transparent` emits `{ type: "transparent" }`.
- Switching kind to `theme` emits `{ type: "theme", name: "" }`.
- Switching kind to `custom` emits `{ type: "custom", color: "#000000" }`.
- Typing into the theme-variable input updates `name`.
- Picking a custom color updates `color`.

### Explicitly skipped

- No barrel/wiring/module-shape tests (`feedback_no_wiring_tests`, `feedback_no_mock_fake_tests`).
- No tests for the `defineJournalEditSection` pass-through.
- No `instanceof Error` test for `UnknownDecorationError` (`feedback_no_trivial_tests`).
- No standalone `errors.ts` tests beyond what the flow tests exercise.

## Risks & open questions

- **Field-path typing through dispatchers.** vee-validate field paths are stringly-typed. The leaves accept `name: string` and pass it through to `defineField(\`${name}.value\`)`. There's no compile-time guarantee the leaf and the dispatched variant agree. The `ts-pattern.match(...).exhaustive()` in the dispatcher gates which leaf is rendered per variant, so a wrong leaf is unreachable in practice; if this proves fragile, tighten the leaves' `name` to a branded template type like `\`conditions.${number}\`` and let the dispatcher narrow via overloads. Not blocking for the port.
- **Theme variable suggestions** are hard-coded. A future change could scrape them from the live stylesheet; out of scope here.

## Out of scope (deferred)

- A bulk "copy decorations from another journal" action.
- Drag-to-reorder decorations.
- Drag-to-reorder styles within a decoration.
- Per-decoration enable/disable toggle.
- Localization beyond `en`.
