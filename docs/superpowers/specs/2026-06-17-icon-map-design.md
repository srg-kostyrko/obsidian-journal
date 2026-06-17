# Central Icon Map — Design

## Problem

Icon name strings (Lucide icon names consumed by Obsidian's `getIcon`/`setIcon`) are
scattered as bare string literals across `.ts` definition files and `.vue` components.
The same affordance is spelled inconsistently in different places:

- "delete" is `trash` in some components and `trash-2` in others.
- "close" appears as both `x` (a real Lucide icon) and `cross` (not a standard Lucide
  name — likely renders nothing).
- Recurring actions (`pencil` for edit, `plus` for add, `chevron-left` for back/prev)
  are re-typed at every call site with no shared source of truth.

There is no central icon registry today. We want one grouped map that the code we author
references, so semantic actions and domain-entity icons stay consistent.

## Goals

- One central, typed map of the icons **we choose** in authored code.
- Grouped by domain so semantic vs entity vs navigation vs settings-section are separated.
- Resolve the existing spelling inconsistencies once, at the map.
- Compile-time autocomplete and a single edit point for any future glyph swap.

## Non-goals

- Validating or constraining **user-entered** icon strings. Users may type any Lucide
  name in the command/view icon inputs; the map does not gate that.
- Changing the rendering path. `renderIcon()` keeps accepting an arbitrary `string`
  because it must render both map icons and user-entered ones.
- Registering custom SVG icons (`addIcon`). We rely entirely on Obsidian's Lucide set.
- Runtime validation, i18n of icons, or a valibot schema for icon names.

## Design

### Module

A single new module: `src/ui/icons.ts`. It sits in `src/ui/` next to the existing
`UiIcon.vue` / `UiIconButton.vue`, a neutral cross-cutting location importable from both
`.vue` components and feature `.ts` config files. It is deliberately **not** placed in a
feature folder (it is cross-cutting) nor in `infrastructure/host/internal` (that path is
host-internal; feature config importing from it would be wrong).

### Shape

A single `as const` object, grouped by domain, with a derived leaf-union type:

```ts
export const icons = {
  action: {
    edit: "pencil",
    delete: "trash-2",
    add: "plus",
    copy: "copy",
    import: "import",
    close: "x",
    openExternal: "external-link",
    pickDate: "crosshair",
    command: "terminal",
  },
  nav: {
    prev: "chevron-left",
    next: "chevron-right",
    prevLeap: "chevrons-left",
    nextLeap: "chevrons-right",
    expand: "chevron-down",
    collapse: "chevron-up",
    up: "arrow-up",
    down: "arrow-down",
    left: "arrow-left",
    right: "arrow-right",
  },
  entity: {
    journal: "notebook",
    shelf: "library",
    view: "layout-dashboard",
    month: "calendar-days",
    week: "calendar-range",
    day: "calendar",
    customInterval: "list",
  },
  section: {
    numbering: "hash",
    appearance: "palette",
    decorations: "paintbrush",
    logging: "scroll-text",
    startup: "log-in",
    properties: "table-properties",
  },
} as const;

export type IconName = {
  [Group in keyof typeof icons]: (typeof icons)[Group][keyof (typeof icons)[Group]];
}[keyof typeof icons];
```

`IconName` is the union of every leaf string value (e.g. `"pencil" | "trash-2" | ...`),
available for any consumer that wants to type an icon prop against the known set. Consumers
reference icons positionally: `icons.action.edit`, `icons.entity.journal`, `icons.nav.next`.

### Consolidation decisions

The migration converges inconsistent spellings onto one name each:

| Meaning | Chosen name | Replaces           |
| ------- | ----------- | ------------------ |
| delete  | `trash-2`   | `trash`, `trash-2` |
| close   | `x`         | `x`, `cross`       |
| back    | `nav.prev`  | `chevron-left`     |

No separate `nav.back` alias is added — back-navigation uses `nav.prev` (same glyph, same
meaning).

## Scope of migration

In scope — replace string literal with an `icons.*` reference:

- **Semantic UI icons** in authored Vue components: `UiIconButton` / `UiIcon` call sites
  (edit, delete, add, copy, import, close, navigation, settings-section headers).
- **Entity icons in built-in definitions** authored by us: the `icon:` field in our own
  `defineViewBlock` / `defineToolbarItem` calls, `views/default-view.ts`, and the
  button-preset nav icons in `views/toolbar-items/button/button-config.ts`. These point at
  `icons.entity.*` / `icons.nav.*`.

Out of scope — stays a free-form string:

- **User-entered icon inputs**: `EditCommandModal.vue`, `ViewEditSubpage.vue`,
  `UiIconSuggest.vue`. Users type any Lucide name; not constrained to the map.
- **`renderIcon()`** in `infrastructure/host/internal/icons.ts`: signature stays
  `(name: string)`; it renders both map icons and user-entered names.

## Testing

No tests are added for the map. A constant object is the trivial/wiring-test case the
project conventions exclude. Correctness is enforced by:

- `check:types` — every `icons.*` reference must resolve; the derived `IconName` union
  catches typos at call sites that type against it.
- The existing component and e2e suites already exercise the rendered icons.

## Risks

- A consolidation swap (`trash` → `trash-2`, `cross` → `x`) changes the glyph at some call
  sites. `cross` → `x` is a fix (cross likely rendered nothing). `trash` → `trash-2` is a
  cosmetic convergence; verify nothing asserts on the old name in tests/e2e.
- The map only helps code we author; user-facing icon inputs remain unconstrained by
  design. This is intentional, not a gap.
