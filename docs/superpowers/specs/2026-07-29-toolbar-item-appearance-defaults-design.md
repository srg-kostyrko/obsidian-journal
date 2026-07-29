# Toolbar item appearance defaults

## Problem

A toolbar button's icon cannot be removed. Adding the "Pick a date" preset produces a
button with a crosshair on it, and there is no configuration that takes the crosshair
away.

`icon`, `label`, and `tooltip` are stored as `v.optional(v.string())` and read through
a resolver fallback — `ButtonItem.vue:39-41`:

```ts
const icon = computed(() => props.config.icon ?? appearance.value.icon);
```

where `appearance` is `resolveButtonAppearance(config.action)`. The config editor writes
`value || undefined` (`ButtonItemConfig.vue:91`), so clearing the field stores
`undefined`, which is exactly the state that asks for the fallback. The icon comes back.

The field also contradicts the button it configures. `appearance.icon` is bound as the
input's `:placeholder`, so the row reads as empty while the button shows a crosshair,
and the obvious gesture for "I do not want an icon" — leave it blank — does nothing.

The same code and the same defect exist in `DefinedNavigationItemConfig.vue` and
`DefinedNavigationItem.vue:32-34`, whose resolver supplies `‹` and `›` labels.

Note that the icon is not supplied by the preset. Presets (`button-item.ts:19`) carry
only an `action`; every appearance default is derived from that action at render time.

## Scope

`icon`, `label`, and `tooltip` stop being render-time fallbacks and become ordinary
stored values, seeded from the action when the item is created. Both toolbar items that
have them — `button` and `defined-navigation` — change together.

Out of scope: the appearance fields on other toolbar items (none have any), and
reconciling the two message keys that name the same field
(`view_toolbar_button_config_label_label` vs `view_toolbar_appearance_label_label`).

## The value is written at creation, not derived at render

`resolveButtonAppearance` keeps its place as the single definition of what each action
looks like, but it is called at creation time and its result is stored:

```ts
export function buttonConfigFor(action: ButtonAction): ButtonConfig {
  return { action, ...resolveButtonAppearance(action) };
}
```

with `definedNavigationConfigFor(target, direction)` doing the same over
`resolveDefinedNavigationAppearance`. Both live beside their resolver in
`button-config.ts` and `defined-navigation-config.ts`.

Every creation site goes through the helper:

| Site                                           | Change                                                      |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `button-item.ts` — `defaultConfig` + 3 presets | wrap each action literal in `buttonConfigFor`               |
| `defined-navigation-item.ts` — `defaultConfig` | wrap in `definedNavigationConfigFor`                        |
| `default-view.ts` — 6 button items             | wrap each action literal in `buttonConfigFor`               |
| `v3-to-v4.ts` — `reshapeViews`                 | none; it `structuredClone`s `defaultCalendarView()` already |

The render sites then read the config directly, dropping the `??` and the `appearance`
computed entirely. An empty `icon` means no icon, an absent one means the same, and
`resolveButtonAppearance` is no longer reachable from `ButtonItem.vue`.

`ButtonItem.vue` binds `:tooltip="tooltip || undefined"` so an emptied tooltip leaves no
`aria-label=""` on the button; `DefinedNavigationItem.vue` does likewise.

`buttonItem.summary` keeps calling `resolveButtonAppearance(config.action).tooltip`. It
answers "what does this button do" for the edit modal title and the item frame, which is
a question about the action, not about the appearance the user chose for it.

### What this costs

Labels and tooltips are paraglide messages, so writing them into `data.json` freezes them
in the language active at creation. Switching Obsidian's language will not retranslate
buttons that already exist.

This is accepted rather than overlooked. The default view already stores
`name: m.common_label_calendar()` (`default-view.ts:29`) and has the same property, and
once these fields are the user's to edit, treating them as user data is the consistent
position. Icons are unaffected — they carry no language.

### What this does not cost

No new migration. Settings version 4 is unreleased, so `v3-to-v4.ts` can be corrected in
place rather than followed by a v5 — and it needs no correction at all, because it seeds
its toolbar from `defaultCalendarView()`.

## Stale fixtures

Twenty-five e2e fixtures are pinned at `"version": 4` and will not re-run the migration.
Two of them store toolbar items that rely on the fallback and would render bare:

- `e2e/fixtures/e2e-journeys/...` — 7 `button` items with `config: { action }` only
- `e2e/fixtures/e2e-defined-nav/...` — 1 item with `config: { target, direction }`

Both are hand-edited to carry the appearance their action resolves to today. Without
this the buttons lose their `aria-label` and every e2e selector that finds them by
tooltip fails. `e2e-startup-view` and `e2e-views` contain no such items and are left
alone.

## The editor shows values, not ghosts

Each of the three rows binds the stored value with no placeholder, so the field always
states what the button will render. Clearing it stores `""`, which renders nothing.

Alongside each field sits a reset control that rewrites the field with
`appearance.icon ?? ""` from the _current_ action, so after flipping a
navigate-step from next to prev, reset yields the left chevron rather than the one seeded
at creation. It is always rendered and is disabled while the value already matches:

```
Icon     [ crosshair    ] (↺)   ← disabled
Label    [              ] (↺)   ← disabled
Tooltip  [ Pick a date  ] (↺)   ← disabled
```

Always-present keeps the row from shifting and makes the control discoverable before the
user has changed anything. The comparison normalizes both sides — `(config.icon ?? "")
!== (appearance.icon ?? "")` — because an action with no default label (`pick-date`)
resolves `label` to `undefined` while the stored value is `""`, and an unnormalized
comparison would leave the control permanently enabled with nothing to do.

Needs `icons.action.reset` (`"rotate-ccw"`) and one message key,
`view_toolbar_appearance_reset` — "Reset to default", authored in `messages/en.json` per
§A of `docs/2026-07-13-ux-text-audit.md`. `src/i18n/paraglide` is generated and never
staged.

### The three rows become one component

`ButtonItemConfig.vue` and `DefinedNavigationItemConfig.vue` today carry the same three
rows verbatim, and the prefill, the reset button, and the normalized comparison would be
written twice. They collapse into `src/views/toolbar-items/ui/ToolbarAppearanceRows.vue`,
taking the stored values, the resolved appearance, and a change handler.

This is one concept in two places rather than two concepts that happen to share a shape:
both are "the appearance overrides of a toolbar item", both resolve their defaults from
their own config, and both are edited identically. The resolvers stay separate — only the
rows are shared. The shared appearance shape (`{ icon?, label?, tooltip }`), currently
declared as `ButtonAppearance` and `DefinedNavigationAppearance`, becomes
`ToolbarItemAppearance` in `src/views/toolbar-items/appearance.ts`, which both config
modules import.

Each config component keeps its own `appearance` computed and passes it down.

## Accepted edge

Clearing all three fields yields a button with nothing in it —
`ButtonItem.vue:171`'s existing `v-else-if="!icon"` renders the tooltip as text, and that
is empty too. The item remains listed in the view editor by `summary()`, which reads the
action, so it is recoverable. The existing tooltip-text fallback is kept as is: it means
clearing only the icon and label still leaves something visible.

## Testing

`button-config.test.ts` — `buttonConfigFor` seeds the icon for a navigate-step action;
seeds the label for `current[day]`; leaves the label unset for `pick-date`.

`defined-navigation-item.test.ts`, which already covers
`resolveDefinedNavigationAppearance` — `definedNavigationConfigFor` seeds the chevron
label for each direction.

`ButtonItem.test.ts` — the mount helper builds its configs through `buttonConfigFor`, so
the existing click tests keep finding buttons by their accessible name. Two rendering
tests change ownership: "renders the default 'Today' label" now asserts that the _seeded_
label renders, and a new test asserts an explicitly empty icon renders none.

`DefinedNavigationItem.test.ts` — same treatment for "renders the right chevron when no
label is configured" and "uses the direction default tooltip as the button aria-label".

`ToolbarAppearanceRows.test.ts` — the icon field shows the stored value; clearing it
emits `""`; the reset control is disabled while the value matches the resolved default;
enabled once it differs; pressing it restores the resolved default. The three
icon/label/tooltip input tests currently in `ButtonItemConfig.test.ts` and
`DefinedNavigationItemConfig.test.ts` move here rather than being duplicated; what stays
behind in those files is the action-specific rows (mode, levels, journal, target,
direction).

`default-view.test.ts` — the default view's pick-date button carries a seeded icon. The
existing assertions look items up by action type and by key, so they are unaffected.

`v3-to-v4.test.ts` — unaffected; it asserts modes on items found by action type.

One behavior per test, scope in nested `describe` blocks, `@testing-library/vue` with
`user-event` for the components.

No e2e is added. The fixture edits keep the existing suites honest, and the behavior
under change is fully observable at unit level.

## Manual checklist

Add to the Views section of `docs/manual-testing-checklist-v3.md`: add a button from the
"Pick a date" preset, clear its icon, and confirm the button renders without one after
closing the editor; then press reset and confirm the crosshair returns.
