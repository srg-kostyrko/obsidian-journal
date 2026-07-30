# Theme color variables by role

## Problem

`UiColorSettingsPicker` offers the same flat list of 32 Obsidian CSS variables at every
call site. A text-color field lists `background-primary`; a background field lists
`text-faint`. The user scans a list where most entries are wrong for the field they are
filling, and the list is long enough that `theme-colors.ts` carries a CSS note about the
longest label stretching the settings row.

Two entries are not colors at all. `--background-modifier-error-rgb` and
`--background-modifier-success-rgb` hold bare RGB triples (`255, 82, 82`). The picker
emits `var(--name)` unconditionally, so selecting either produces `color: 255, 82, 82` —
invalid CSS in every field, and an invisible swatch in the picker's own preview.

## Scope

Each color field declares what it is for; the dropdown offers only variables suited to
it. Filtering is hard: an out-of-role variable is not offered, not demoted to an "other"
group.

This narrows v2, which showed every variable everywhere. That is the point of the change
and was chosen explicitly. Previously stored values are never rewritten — see
[Values outside a field's role](#values-outside-a-fields-role).

Out of scope: rewording the 32 existing labels, adding variables Obsidian has gained
since v2, and per-field default values.

## Variables gain a role tag

`theme-colors.ts` replaces the flat `THEME_COLOR_NAMES` array with a tagged list. Three
tags:

| Tag          | Variables                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background` | `background-primary`, `background-primary-alt`, `background-secondary`, `background-secondary-alt`, `background-modifier-hover`, `background-modifier-active-hover`, `background-modifier-error`, `background-modifier-error-hover`, `background-modifier-success`, `background-modifier-message`, `interactive-normal`, `interactive-hover`, `interactive-accent`, `interactive-accent-hover`, **`text-selection`**, **`text-highlight-bg`** |
| `border`     | **`background-modifier-border`**, **`background-modifier-border-hover`**, **`background-modifier-border-focus`**                                                                                                                                                                                                                                                                                                                              |
| `text`       | `text-normal`, `text-muted`, `text-faint`, `text-on-accent`, `text-on-accent-inverted`, `text-success`, `text-warning`, `text-error`, `text-accent`, `text-accent-hover`, `caret-color`                                                                                                                                                                                                                                                       |

The tag is hand-assigned per variable, not derived from the name prefix, because the
prefixes lie in both directions. The bolded entries are where they lie:
`--text-selection` and `--text-highlight-bg` are the fills behind selected and
highlighted text, and the three `--background-modifier-border*` variables are strokes.
Their existing labels already say so — "Selected text background", "Border color" — so
the tagging agrees with the copy the user reads.

`background-modifier-error-rgb` and `background-modifier-success-rgb` are dropped. They
cannot be tagged because they are not colors.

16 + 3 + 11 + 2 dropped accounts for all 32 of today's entries.

## Fields declare a role

Four field roles, each allowing tags in the order they are displayed:

| Field role   | Tags allowed         | Options | Group headings |
| ------------ | -------------------- | ------- | -------------- |
| `text`       | `text`               | 11      | no             |
| `background` | `background`         | 16      | no             |
| `border`     | `border`, `text`     | 14      | yes            |
| `fill`       | `text`, `background` | 27      | yes            |

Only `border` and `fill` span two tags. A single heading over an entire list says
nothing, so headings render only when the field's result has more than one group.

`border` admits text variables because accent and status text colors — `--text-accent`,
`--text-error`, `--text-success` — read well as strokes. Because a variable carries exactly
one tag, the interactive-accent backgrounds cannot be offered as border colors;
`--text-accent` is the reachable equivalent, and Obsidian defaults both to
`var(--color-accent)` so they match unless a theme overrides them independently. `fill`
admits everything except border-only variables, because a decorative mark on a calendar
cell has no inherent ink-or-surface nature and `text-accent` is the likeliest choice for a
colored dot.

### Call sites

| Component                  | Field                             | Role                        |
| -------------------------- | --------------------------------- | --------------------------- |
| `StyleColor.vue`           | text color                        | `text`                      |
| `StyleIcon.vue`            | icon color                        | `text`                      |
| `StyleBackground.vue`      | background color                  | `background`                |
| `StyleBorderSide.vue`      | border color                      | `border`                    |
| `StyleShape.vue`           | shape color                       | `fill`                      |
| `StyleCorner.vue`          | corner color                      | `fill`                      |
| `EditNavBlockRowModal.vue` | color / background                | `text` / `background`       |
| `AppearanceBlock.vue`      | today + active color / background | `text` ×2 / `background` ×2 |

The rule is the CSS property the value lands in, where that property reflects intent.
`StyleIcon` renders `color:` on a glyph, so it is `text`. `StyleShape` and `StyleCorner`
use `background-color` and `border-*` as rendering tricks — `DecorationShape.vue` feeds
one stored value to `background-color` for circles and squares but to `border-*` for the
four triangles — so there the property says nothing about intent and the role is `fill`.

## Picker API

`UiColorSettingsPicker` gains a required `role` prop:

```ts
const { role } = defineProps<{ role: ThemeColorFieldRole }>();
```

Required rather than defaulted, so no call site can silently inherit the wrong list, and
adding a ninth call site is a type error until it declares its role.

`theme-colors.ts` exports `themeColorGroupsFor(role)`, returning
`{ tag, names }[]` in the field role's declared tag order, with names in the order they
are declared in the tagged list (today's list order, preserved). The picker renders a
flat `<option>` run for a one-group result and `<optgroup>`s for a two-group result.
`UiDropdown` passes its default slot straight into `<select>`, so `<optgroup>` needs no
component change.

`themeColorLabel(name)` is unchanged, including its fall back to the raw name for an
unrecognized variable.

## Values outside a field's role

The picker already appends an option for a stored variable it does not recognize:

```
v-if="themeName && !themeColorNames.includes(themeName)"
```

The condition widens from "not a known theme color" to "not offered by this field". It
then covers three cases with one branch: a variable the plugin never knew, a dropped
`*-rgb` entry, and a known variable whose tag the field excludes — a v2 vault with
`background-primary` stored in a text-color field, or any decoration configured before
this change.

Such a value stays selected, renders through `themeColorLabel` so a known variable still
reads friendly, and sits as a trailing ungrouped option. Nothing rewrites stored
settings, so no migration step and no schema change.

## Copy

`messages/en.json` gains `ui_theme_color_group_label`, a match block over `group` with
`text` → "Text", `background` → "Background", `border` → "Border". Sentence case, en-US,
per §A of `docs/2026-07-13-ux-text-audit.md`, matching the existing
`ui_color_kind_label` match block.

`ui_theme_color_background_modifier_error_rgb` and
`ui_theme_color_background_modifier_success_rgb` lose their only call sites and are
deleted. The other 32 labels are untouched, so no locale needs re-translating.
`src/i18n/paraglide` is generated by `compile:i18n` and never staged.

## Testing

`UiColorSettingsPicker.test.ts`, colocated, `@testing-library/vue` with `user-event`,
one behavior per test, scope in nested `describe` blocks. Existing cases gain the `role`
prop; the unknown-variable case already covers one branch of the widened condition.

Filtering:

- a text field does not offer a background variable
- a background field does not offer a text variable
- a border field offers a border variable
- a border field offers a text variable
- a border field does not offer a background variable
- a fill field offers a text variable
- a fill field offers a background variable
- a fill field does not offer a border variable

Tagging against the misleading prefixes — the cases a prefix-derived implementation
would get wrong, so each is its own test:

- a background field offers `text-selection`
- a background field offers `text-highlight-bg`
- a background field does not offer `background-modifier-border`
- a text field does not offer `text-selection`

Dropped entries and grouping:

- no field offers `background-modifier-error-rgb`
- a border field renders a group named for each of its two tags
- a text field renders no groups

Stored values:

- a known variable outside the field's role stays selectable under its friendly label

No new e2e. The change alters dropdown contents only, with no host API and no runtime
wiring behind it; the four decoration-style modals already have e2e coverage that these
unit tests do not duplicate.

Gates: `npm test`, `npm run check:types`, `npm run check:lint`.

## Manual checklist

Add to the decorations section of `docs/manual-testing-checklist-v3.md`: a style of type
Color offers only text variables and a style of type Background only background ones; a
Border style's color list is headed Border and Text; a decoration saved before the change
with an out-of-role variable still shows that variable selected on reopen, and its
rendering in the calendar is unchanged.
