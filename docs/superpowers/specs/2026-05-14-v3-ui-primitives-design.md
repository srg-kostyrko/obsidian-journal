# v3 UI primitives — design

## Goal

Port the thin Obsidian-styled Vue primitives from v2 (`src/_old-code/components/`) into v3 as a shared, dependency-light UI layer at `src/ui/`. Consumers (settings dashboard, modals, future calendar views) compose features from these primitives without each reimplementing native Obsidian styling or re-importing `obsidian` directly.

## Non-goals

- Porting feature-level composites (`ColorPicker.vue`, `IconSelector`, `FolderInput`, `TemplateInput`, `DatePicker`, `CalendarWeekSettings`, suggesters, conditions, modals). These move with the features that own them.
- Adding a `setIcon` helper. v2 only used `getIcon`; the equivalent v3 entry point covers the same surface.
- Adding new CSS or theming. Primitives reuse Obsidian's native classes and the existing scoped styles ported verbatim from v2.
- An accessibility audit. v2's `aria-label`/`tooltip` mapping is preserved; tightening is out of scope.
- A `src/ui/index.ts` barrel. Consumers import each SFC directly.

## Scope

Port 13 primitives from v2, plus one Obsidian-host helper used by `UiIcon`.

| v3 name              | v2 source                          | v3 refinement                                                                                                                                                            |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UiButton`           | `obsidian/ObsidianButton.vue`      | none                                                                                                                                                                     |
| `UiTextInput`        | `obsidian/ObsidianTextInput.vue`   | none                                                                                                                                                                     |
| `UiNumberInput`      | `obsidian/ObsidianNumberInput.vue` | none                                                                                                                                                                     |
| `UiToggle`           | `obsidian/ObsidianToggle.vue`      | none                                                                                                                                                                     |
| `UiDropdown`         | `obsidian/ObsidianDropdown.vue`    | none                                                                                                                                                                     |
| `UiColorPicker`      | `obsidian/ObsidianColorPicker.vue` | none                                                                                                                                                                     |
| `UiIcon`             | `obsidian/ObsidianIcon.vue`        | reaches Obsidian via `renderIcon` re-export instead of importing `getIcon` directly                                                                                      |
| `UiIconButton`       | `obsidian/ObsidianIconButton.vue`  | composes `UiButton` + `UiIcon`                                                                                                                                           |
| `UiSettingRow`       | `obsidian/ObsidianSetting.vue`     | `description` becomes a named slot; the `description` prop is dropped                                                                                                    |
| `UiFormErrors`       | `FormErrors.vue`                   | none                                                                                                                                                                     |
| `UiIconedRow`        | `IconedRow.vue`                    | uses `UiIcon`                                                                                                                                                            |
| `UiCollapsibleBlock` | `CollapsibleBlock.vue`             | uses `UiIcon`; `defaultExpanded` is dropped — the component is purely controlled via `v-model:expanded` (parents that want an initial-expanded state seed their own ref) |
| `UiButtonDropdown`   | `ButtonDropdown.vue`               | uses `UiButton`; unused `popoutPosition` ref dropped                                                                                                                     |

## Architecture

### Location and layout

- All primitives live in `src/ui/`, flat. No subfolders, no `index.ts` barrel.
- Tests are colocated as `<Name>.test.ts` alongside the SFC.
- Consumers import each SFC by path (e.g. `import UiSettingRow from "@/ui/UiSettingRow.vue"`).

### Obsidian boundary

Only `src/infrastructure/host/**` may import from `"obsidian"`. `src/ui/` is bound by that same rule.

`UiIcon` therefore reaches `getIcon` through a thin re-export:

- `src/infrastructure/host/internal/icons.ts` declares `export function renderIcon(name: string): SVGSVGElement | null { return getIcon(name); }`.
- `src/infrastructure/host/index.ts` re-exports `renderIcon`.
- `UiIcon` imports `renderIcon` from `@/infrastructure/host`.

This adds one chokepoint without introducing a DI token, container binding, or composable for a stateless one-line function.

### Styling

Each primitive renders Obsidian's native CSS classes (`.setting-item`, `.checkbox-container`, `.mod-cta`, `.dropdown`, `.clickable-icon`, etc.) and ports v2's scoped `<style>` blocks verbatim where present. No new stylesheets are introduced.

## Component APIs

### `UiButton`

```ts
defineProps<{
  disabled?: boolean;
  cta?: boolean;
  warning?: boolean;
  flat?: boolean;
  type?: "button" | "submit" | "reset";
  tooltip?: string;
}>();
```

Slot: default (button label/contents). Class bindings: `mod-cta`, `mod-warning`, `clickable-icon` (only when `flat && !cta`). `tooltip` maps to `aria-label`. Default `type` is `"button"`.

### `UiTextInput`

```ts
defineProps<{ placeholder?: string; disabled?: boolean }>();
const model = defineModel<string>();
```

Renders `<input type="text" spellcheck="false">`.

### `UiNumberInput`

```ts
defineProps<{
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  narrow?: boolean;
}>();
const model = defineModel<number>();
```

Renders `<input type="number">`. `narrow` toggles the `.narrow-input` class (width 60px).

### `UiToggle`

```ts
defineProps<{ disabled?: boolean; tooltip?: string }>();
const model = defineModel<boolean>();
```

Renders Obsidian's `.checkbox-container`. Clicking the container flips the model when not disabled. `tooltip` maps to `aria-label`. Container classes: `is-enabled` when the model is true, `is-disabled` when `disabled` is true.

### `UiDropdown`

```ts
defineProps<{ disabled?: boolean }>();
const model = defineModel<string>();
```

Renders `<select class="dropdown">`. Caller provides `<option>` elements via the default slot.

### `UiColorPicker`

```ts
defineProps<{ disabled?: boolean }>();
const model = defineModel<string>();
```

Renders `<input type="color">`.

### `UiIcon`

```ts
defineProps<{ name: string; tooltip?: string }>();
```

On mount, watches `name` (immediate) and replaces a `<span>`'s children with the SVG element from `renderIcon(name)`. Clears children when `name` is empty. `tooltip` maps to `aria-label`. Uses `el.empty()` (Obsidian's `HTMLElement` extension) to clear, matching v2.

### `UiIconButton`

```ts
defineProps<{ icon: string; tooltip?: string }>();
```

Renders `<UiButton flat :tooltip class="icon-button"><UiIcon :name="icon"/></UiButton>`. Adds padding via scoped CSS (ported verbatim).

### `UiSettingRow`

```ts
defineProps<{
  name?: string;
  heading?: boolean;
  controlsOnly?: boolean;
  noControls?: boolean;
}>();
```

Slots:

- `name` — renders inside `.setting-item-name`; falls back to `{{ name ?? "" }}` text from the prop.
- `description` — renders inside `.setting-item-description`. **There is no `description` prop**; pass an inline string or use a child component (typically `UiFormErrors`) inside the slot.
- default — renders inside `.setting-item-control`, suppressed when `noControls` is true.

`controlsOnly` hides the `.setting-item-info` wrapper. `heading` toggles a `setting-item--heading` class. The slot-only `description` shape is what callers in the modal spec already assume (errors bound directly into the slot without `?? []` wrapping).

### `UiFormErrors`

```ts
defineProps<{ errors?: string[] }>();
```

Renders `<ul class="journal-errors"><li v-for="…">` when `errors` is non-empty; nothing otherwise.

### `UiIconedRow`

```ts
defineProps<{ icon: string }>();
```

Renders `<UiIcon :name="icon"/>` plus a default slot in a flex container with `gap: var(--size-2-2)`.

### `UiCollapsibleBlock`

```ts
const expanded = defineModel<boolean>("expanded");
```

Purely controlled — the parent owns the expanded state via `v-model:expanded`. v2's `defaultExpanded` prop is dropped: trying to make `defaultExpanded` coexist with `v-model` runs into Vue's Boolean-prop coercion (a missing `expanded` prop becomes `false`, indistinguishable from an explicit `false`), and every working v2 caller used either `v-model` or `defaultExpanded` but never both, so callers that want an initially-expanded block simply seed their own ref (`const open = ref(true)` then `<UiCollapsibleBlock v-model:expanded="open">`).

Slots: `trigger` (label/title row), `controls` (right-aligned controls; click events are stopped from propagating to the toggle), default (renders only while `expanded` is true). The chevron icon (`chevron-down` / `chevron-right`) is rendered via `UiIcon` based on `expanded`.

### `UiButtonDropdown`

```ts
defineProps<{ options: { value: string; label: string }[] }>();
const emit = defineEmits<(event: "select", value: string) => void>();
```

Slot: default (trigger button label). Behavior:

- An `isOpen` ref toggles via clicking the trigger button.
- `onClickOutside(popoutRef, () => isOpen.value = false)` via `@vueuse/core` (already a dep).
- Selecting an option calls `select(value)` which emits `select` with the value and closes the popout.
- Renders trigger as `<UiButton>` and each option as `<UiButton flat>`. The dead `popoutPosition` ref from v2 is omitted; positioning is pure CSS.

## Testing

Test files use `@testing-library/vue` + `@testing-library/user-event`, per the v3 testing memory. One behavior per test, nested `describe()` blocks for scope. Black-box assertions; no `data-test-*` attributes; no whole-object `.toEqual` on render output.

Test files are created for primitives with real behavior beyond the template:

### `UiIcon.test.ts`

- renders the named icon on mount
- replaces the icon when `name` changes
- clears the slot when `name` becomes empty

Setup: `vi.mocked(renderIcon).mockReturnValue(svg)` against the host re-export (or against `getIcon` via the existing `__mocks__/obsidian.ts`).

### `UiToggle.test.ts`

- clicking the container flips a `false` model to `true`
- clicking the container flips a `true` model to `false`
- clicking does not change the model when `disabled` is true

### `UiSettingRow.test.ts`

- the `name` prop renders inside `.setting-item-name`
- the `name` slot overrides the `name` prop
- the `description` slot renders inside `.setting-item-description`
- `controlsOnly` hides the info block
- `noControls` hides the control area

### `UiCollapsibleBlock.test.ts`

- default slot is not rendered when `expanded` is false
- default slot is rendered when `expanded` is true
- clicking the trigger emits `update:expanded(true)` while collapsed
- clicking the trigger emits `update:expanded(false)` while expanded
- clicking inside the `controls` slot does not emit `update:expanded`

### `UiButtonDropdown.test.ts`

- clicking the trigger opens the popout
- clicking an option emits `select` with the option's `value`
- clicking an option closes the popout
- clicking outside the popout closes it without emitting

### Intentionally untested

`UiButton`, `UiTextInput`, `UiNumberInput`, `UiDropdown`, `UiColorPicker`, `UiIconButton`, `UiFormErrors`, `UiIconedRow`. Each is either a `defineModel` passthrough or a pure layout template; per the "no trivial tests" and "don't test the wiring" memories, dedicated specs would assert Vue itself.

## Files added

```
src/infrastructure/host/internal/icons.ts
src/infrastructure/host/index.ts                 (export added)

src/ui/UiButton.vue
src/ui/UiTextInput.vue
src/ui/UiNumberInput.vue
src/ui/UiToggle.vue
src/ui/UiToggle.test.ts
src/ui/UiDropdown.vue
src/ui/UiColorPicker.vue
src/ui/UiIcon.vue
src/ui/UiIcon.test.ts
src/ui/UiIconButton.vue
src/ui/UiSettingRow.vue
src/ui/UiSettingRow.test.ts
src/ui/UiFormErrors.vue
src/ui/UiIconedRow.vue
src/ui/UiCollapsibleBlock.vue
src/ui/UiCollapsibleBlock.test.ts
src/ui/UiButtonDropdown.vue
src/ui/UiButtonDropdown.test.ts
```

18 new files in `src/ui/`, 1 new file under `src/infrastructure/host/internal/`, 1 modified file (`src/infrastructure/host/index.ts`).
