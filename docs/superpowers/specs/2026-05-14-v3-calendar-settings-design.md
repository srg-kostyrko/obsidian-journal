# v3 Calendar Settings — Design

**Stage:** Port v2's calendar (week-configuration) settings to the v3 settings

- calendar layers.
  **Date:** 2026-05-14
  **Status:** Draft for review

## Purpose

v2 ships a `settings.calendar = { dow, doy, global }` block plus a
`CalendarWeekSettings.vue` dashboard section and a preset-picker modal
(`CalendarWeekSettings.modal.vue`). Those settings push into
`moment.updateLocale(...)` on the custom journal locale, and — when
`global` is true — onto the system locale as well. Three named presets
(ISO 8601 / Western traditional / Middle Eastern) plus a custom dow/doy
configurator drive that mutation.

v3 already has:

- a `Calendar` class ([[v3-calendar-design]]) that owns the custom locale
  but is currently bound to a fixed `{ dow: 1, doy: 4 }`;
- a `SettingsService` with slice/migration plumbing
  ([[2026-05-14-v3-settings-design]]); and
- a pluggable settings UI shell with `DashboardBlockToken` and
  modals via `ModalService`
  ([[2026-05-14-v3-settings-ui-design]]).

The v3 calendar spec explicitly lists "Settings-driven locale retuning"
under open follow-ups: settings push into `Calendar`; `Calendar` does
not subscribe to settings. This design delivers that push.

Per [[feedback_v2_fidelity_default]], every v2 variant is preserved:
the three named presets, the custom configurator, the "follow system
locale" mode (v2's `dow === -1` sentinel), and the global toggle. The
sentinel is replaced by an explicit `mode` discriminator in the slice.

## Non-goals

- **`calendarView` slice.** v2's `settings.calendarView`
  (`display` / `leaf` / `weeks` / `todayMode` / `pickMode` /
  `todayStyle` / `activeStyle`) is not ported here. There is no v3
  calendar-view feature for it to drive yet; porting knobs without
  machinery would create dead settings.
- **"Update weekly journals after a dow/doy change."** v2's
  `updateWeeklyJournals(plugin, notesToUpdate)` rewrites weekly-note
  filenames so week-of-year is preserved across the locale change.
  v3 has no journal feature module yet, so the side-effect has no
  implementation point. Captured as a follow-up.
- **v2 → v3 settings migration.** v3 is a rewrite. The migration that
  maps v2's wire format (including `dow: -1`) to the new `mode`
  discriminator lands with the broader settings migration work.
- **Period mutation invalidation.** v3 `Period` instances are
  immutable values built off `localMoment`. Long-lived period values
  computed before a settings change are out of scope — callers re-derive
  from `CalendarDate` after settings change. No invalidation/refresh
  bus is added here.
- **Locale auto-follow when system locale changes mid-session.** Out of
  scope. v3 captures the boot locale once.

## Architecture

### Layout

```
src/calendar/
├── calendar.ts                       ← extended: applyWeekConfig + initial capture
├── presets.ts                        ← weekPresets + detectCurrentPreset
├── presets.test.ts
├── errors.ts                         ← (no new error types required)
├── settings/
│   ├── slice.ts                      ← calendarSlice (defineSlice)
│   ├── bridge.ts                     ← CalendarSettingsBridge (eager)
│   ├── bridge.test.ts
│   ├── module.ts                     ← calendarSettingsModule
│   └── ui/
│       ├── CalendarWeekBlock.vue     ← dashboard block
│       ├── CalendarWeekBlock.test.ts
│       ├── WeekPresetPickerModal.vue
│       ├── WeekPresetPickerModal.test.ts
│       └── week-preset-picker-modal.ts   ← defineModal definition
└── index.ts                          ← adds calendarSettingsModule, calendarSlice,
                                       weekPresets, detectCurrentPreset, WeekPreset
```

The settings-coupling code is a sub-feature inside `src/calendar/`. The
base `Calendar` and the period types in `src/calendar/` do not import
from `settings/`. The other direction is allowed: `settings/bridge.ts`
imports `Calendar`. This matches v3 calendar's stated contract —
settings push to `Calendar`; `Calendar` never resolves settings.

Per [[feedback_di_module_factories]], `calendarSettingsModule` takes no
args and is exported as a `const`.

### Slice

```ts
// src/calendar/settings/slice.ts
import * as v from "valibot";
import { defineSlice } from "@/settings";

const localeMode = v.object({ mode: v.literal("locale") });

const customMode = v.pipe(
  v.object({
    mode: v.literal("custom"),
    dow: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
    doy: v.pipe(v.number(), v.integer()),
    global: v.boolean(),
  }),
  // moment.js constraint: the day-of-January in week 1
  // (= 7 + dow - doy) must lie in 1..7
  v.check((s) => {
    const firstDayInJan = 7 + s.dow - s.doy;
    return firstDayInJan >= 1 && firstDayInJan <= 7;
  }, "doy must satisfy 1 ≤ 7 + dow - doy ≤ 7"),
);

export const calendarSliceSchema = v.variant("mode", [localeMode, customMode]);

export type CalendarSliceState = v.InferOutput<typeof calendarSliceSchema>;

export const calendarSlice = defineSlice("calendar", calendarSliceSchema, { mode: "locale" } as CalendarSliceState);
```

Rationale for the variant over v2's `{ dow: number; doy: number; global: boolean }`:

- v2's `dow === -1` is a sentinel for "follow the system locale"; the
  variant makes the state space explicit, removes the magic number,
  and lets `ts-pattern.match(state).with(...).exhaustive()` exhaustively
  dispatch ([[feedback_ts_pattern_over_switch]]).
- `global` lives only in the `custom` arm: when mode is `locale` there
  is no override to push globally, so the toggle has no meaning. v2
  conflated the two; v3 separates them.
- `doy` is **not** bounded `1..7`. The valid moment.js range is
  `[dow, dow + 6]` (so v2's Middle Eastern preset uses `dow: 6,
doy: 12`). The schema asserts the derived invariant
  `1 ≤ 7 + dow - doy ≤ 7` via `v.check`.

Default is `{ mode: "locale" }` — v3 follows the system locale unless
the user opts in. This matches the v3 calendar spec's stated default
behavior at the type level (the previous hard-coded `{1,4}` was a
placeholder).

### Presets

```ts
// src/calendar/presets.ts
export interface WeekPreset {
  readonly id: "iso-8601" | "western" | "middle-eastern";
  readonly dow: number;
  readonly doy: number;
}

export const weekPresets: readonly WeekPreset[] = [
  { id: "iso-8601", dow: 1, doy: 4 },
  { id: "western", dow: 0, doy: 6 },
  { id: "middle-eastern", dow: 6, doy: 12 },
];

export function detectCurrentPreset(week: { dow: number; doy: number }): WeekPreset | "custom" {
  return weekPresets.find((p) => p.dow === week.dow && p.doy === week.doy) ?? "custom";
}
```

- Pure data + a pure lookup. No moment.js dependency.
- The localized name / description / "used in" copy is **not** part of
  the data — it's keyed by `id` and resolved via paraglide
  (`m.calendarPresetIsoName()`, `m.calendarPresetIsoDescription()`,
  `m.calendarPresetIsoUsed()`, etc.).

### Calendar extensions

```ts
// src/calendar/calendar.ts (extended)
export interface WeekConfig {
  readonly dow: number;
  readonly doy: number;
}

export class Calendar {
  readonly #initial: WeekConfig;
  readonly #globalLocale: string;

  constructor() {
    const systemLocale = moment.locale();
    this.#globalLocale = systemLocale;

    const data = moment.localeData();
    this.#initial = {
      dow: data.firstDayOfWeek(),
      doy: data.firstDayOfYear(),
    };

    if (!moment.locales().includes(CUSTOM_LOCALE)) {
      const sourceConfig = (data as unknown as { _config: moment.LocaleSpecification })._config;
      moment.defineLocale(CUSTOM_LOCALE, sourceConfig);
    }
    moment.updateLocale(CUSTOM_LOCALE, { week: this.#initial });
    moment.locale(systemLocale);
  }

  applyWeekConfig(week: WeekConfig | "locale", opts: { global: boolean }): void {
    const effective = week === "locale" ? this.#initial : week;
    const currentLocale = moment.locale();

    moment.updateLocale(CUSTOM_LOCALE, { week: effective });
    moment.locale(currentLocale);

    if (opts.global && week !== "locale") {
      moment.updateLocale(this.#globalLocale, { week: effective });
    } else {
      moment.updateLocale(this.#globalLocale, { week: this.#initial });
    }
  }
}
```

Changes vs. the existing `Calendar`:

- Captures `#initial` (the system locale's `firstDayOfWeek` /
  `firstDayOfYear`) once at boot. This is the v2 `initialWeekSettings`
  analogue and is required so `"locale"` mode and the `global=false`
  restore path have a reference point.
- Constructor no longer accepts a `WeekConfig` arg — the boot value is
  always the system locale, and the bridge re-applies the user's
  configuration on the very next tick during `autoLoad()`.
- `applyWeekConfig(week, opts)` is the single mutation surface for the
  bridge. Semantics:
  - `week === "locale"`: restore the system-captured week onto the
    custom locale; restore the global locale's week to its captured
    initial value too. `opts.global` is ignored on this path because
    nothing custom is being pushed.
  - `week === {dow, doy}` with `opts.global === false`: push onto the
    custom locale only; restore the global locale to its initial.
  - `week === {dow, doy}` with `opts.global === true`: push onto both
    the custom and the global locale.
- Switching the user-facing `moment.locale(...)` is preserved as a
  no-op (read current, set it back) so callers' assumed locale isn't
  perturbed by `updateLocale`.

No errors are added: `applyWeekConfig` is infallible (the slice's
`v.check` enforces the moment.js invariant; the bridge cannot produce
out-of-range input).

### Bridge

```ts
// src/calendar/settings/bridge.ts
import { watchEffect } from "vue";
import { match } from "ts-pattern";
import { inject } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import { Calendar } from "../calendar";
import { calendarSlice, type CalendarSliceState } from "./slice";

export class CalendarSettingsBridge {
  readonly #calendar = inject(Calendar);
  readonly #settings = inject(SettingsService);

  constructor() {
    const slice = this.#settings.getSlice(calendarSlice);
    watchEffect(() => this.#sync(slice.state));
  }

  #sync(state: CalendarSliceState): void {
    match(state)
      .with({ mode: "locale" }, () => {
        this.#calendar.applyWeekConfig("locale", { global: false });
      })
      .with({ mode: "custom" }, ({ dow, doy, global }) => {
        this.#calendar.applyWeekConfig({ dow, doy }, { global });
      })
      .exhaustive();
  }
}
```

- Eager (`.eager()`); instantiated by `container.autoLoad()`. By the
  time `autoLoad` completes, `Calendar`'s locale state matches the
  loaded slice.
- Per [[feedback_di_constructor_injection]], DI wires the bridge once.
  Feature code does not resolve `CalendarSettingsBridge`; it lives
  purely as a side-effecting boot binding.
- `watchEffect` is Vue's reactivity primitive; the slice state is
  already reactive per the settings layer. Disposal: the bridge is
  scoped to the container's lifetime; when `container.dispose()` runs,
  the underlying slice reactivity tears down. The bridge does not need
  an explicit `[Symbol.dispose]` because no observer outlives the
  container.
- Per [[feedback_attempt_in_over_this_shadow]] this is a synchronous
  side-effect path — no `Result` plumbing required. The bridge does
  not surface errors; the slice schema guarantees the input shape.

### UI — dashboard block

```vue
<!-- src/calendar/settings/ui/CalendarWeekBlock.vue -->
<script setup lang="ts">
import { computed } from "vue";
import { useService } from "@/infrastructure/di";
import { useModalService } from "@/infrastructure/host/modals";
import { SettingsService } from "@/settings";
import { m } from "@/i18n";
import { detectCurrentPreset, type WeekPreset } from "@/calendar/presets";
import { calendarSlice } from "../slice";
import { weekPresetPickerModal } from "./week-preset-picker-modal";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiButton from "@/ui/UiButton.vue";
import UiToggle from "@/ui/UiToggle.vue";

const settings = useService(SettingsService);
const modals = useModalService();
const slice = settings.getSlice(calendarSlice);

const currentPreset = computed<WeekPreset | "custom" | "locale">(() =>
  slice.state.mode === "locale" ? "locale" : detectCurrentPreset({ dow: slice.state.dow, doy: slice.state.doy }),
);

async function change() {
  const result = await modals.open(weekPresetPickerModal, { current: slice.state });
  if (result.kind === "ok") slice.state = result.value;
}
</script>

<template>
  <UiSettingRow heading :name="m.calendarWeekConfigTitle()">
    <template #description>
      <!-- preset summary + i18n description chosen by currentPreset -->
    </template>
    <UiButton @click="change">{{ m.calendarWeekConfigChange() }}</UiButton>
  </UiSettingRow>
  <UiSettingRow v-if="slice.state.mode === 'custom'" :name="m.calendarApplyGloballyTitle()">
    <template #description>
      {{ m.calendarApplyGloballyDesc() }}
      <div class="journal-hint">{{ m.calendarApplyGloballyRestartHint() }}</div>
    </template>
    <UiToggle v-model="slice.state.global" />
  </UiSettingRow>
</template>
```

- Per [[feedback_no_computed_around_i18n]], `m.*()` is invoked inline
  in the template, not pre-computed.
- Per [[feedback_di_in_vue_components]], `useService` is the access
  path; no `useApp()` / `usePlugin()`.
- The "apply globally" row is conditional on `mode === "custom"`. When
  mode is `"locale"` the toggle has nothing to mirror, so it is hidden
  rather than disabled.
- "Current preset" copy is a single i18n message picked off the
  `currentPreset` value. For `"locale"`, the message renders the
  current system-locale week (`m.calendarLocaleSummary(dow, doy)`); for
  a named preset, the localized preset name + description; for
  `"custom"`, the localized custom-week summary.

Registered via:

```ts
defineDashboardBlock({
  key: "calendar-week",
  component: CalendarWeekBlock,
  order: 10,
});
```

`order: 10` reserves the first slot for general/UX blocks that other
features may later contribute; calendar configuration sits early in
the dashboard but not at position 0.

### UI — preset picker modal

```ts
// src/calendar/settings/ui/week-preset-picker-modal.ts
import { defineModal } from "@/infrastructure/host/modals";
import { m } from "@/i18n";
import WeekPresetPickerModal from "./WeekPresetPickerModal.vue";
import type { CalendarSliceState } from "../slice";

export const weekPresetPickerModal = defineModal<{ current: CalendarSliceState }, CalendarSliceState>({
  component: WeekPresetPickerModal,
  title: () => m.calendarPresetPickerTitle(),
});
```

Modal contents (`WeekPresetPickerModal.vue`):

- Receives `current: CalendarSliceState` and a `ModalApi<CalendarSliceState>`
  via the established v3 modal convention.
- Stages a local `staged: CalendarSliceState` initialised from `current`.
  Edits mutate `staged`, not the slice; the slice updates only on
  `submit`.
- One `UiSettingRow` per row, per
  [[feedback_form_errors_in_description_slot]]:
  - **"Locale default"** row — clicking the row's button sets
    `staged = { mode: "locale" }`. Marker if currently selected.
  - **Each `weekPreset`** — name / description / "used in" copy
    rendered from paraglide messages keyed on `preset.id`. Button
    sets `staged = { mode: "custom", dow: preset.dow, doy: preset.doy,
global: currentGlobal }` where `currentGlobal` carries through
    from the row state. Marker if currently selected.
  - **"Custom settings"** row — `UiDropdown` for `dow` (Sun..Sat) +
    `UiNumberInput` for the human "first day of January in week 1"
    (which is `7 + dow - doy`, range 1..7). The modal converts back
    to `doy` on stage. Selected when `staged.mode === "custom"`
    and `detectCurrentPreset(staged) === "custom"`.
  - **Action row** — "Update" calls `api.submit(staged)`; cancel
    invokes `api.cancel()`.
- Submitting only sends back a value the slice's `v.check` can accept;
  the form prevents out-of-range numeric inputs at the input level so
  the schema check is a redundant safety, not a user-facing error
  surface.
- No v2-style "this will update all weekly notes" warning row.
  Deferred follow-up.

`m.calendarPresetIsoName()` etc. are added to the paraglide message
catalog as part of this work.

Per [[feedback_inline_vue_props]], the modal's `<script setup>` uses
`defineProps<{ current: CalendarSliceState }>()` inline; no separate
`Props` interface.

### Module wiring

```ts
// src/calendar/settings/module.ts
import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SliceDefinitionToken, defineDashboardBlock } from "@/settings";
import { calendarSlice } from "./slice";
import { CalendarSettingsBridge } from "./bridge";
import CalendarWeekBlock from "./ui/CalendarWeekBlock.vue";

export const calendarSettingsModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(calendarSlice).multi();
    c.register(DashboardBlockToken)
      .useValue(
        defineDashboardBlock({
          key: "calendar-week",
          component: CalendarWeekBlock,
          order: 10,
        }),
      )
      .multi();
    c.register(CalendarSettingsBridge).useClass(CalendarSettingsBridge).eager();
  },
};
```

Per [[feedback_di_omit_default_lifetime]], no `.lifetime(...)` is
called; Container is the default.

`main.ts` after `settingsModule` and `CalendarModule`:

```ts
container.addModule(settingsModule);
container.addModule(CalendarModule);
container.addModule(calendarSettingsModule);
await container.autoLoad();
```

Ordering matters: `calendarSettingsModule`'s eager `CalendarSettingsBridge`
resolves `Calendar` and `SettingsService` during `autoLoad`, both of
which must be registered first.

## Testing

Tests are colocated with their files per
[[feedback_test_hygiene]]. No barrel tests, no module-wiring tests
([[feedback_no_wiring_tests]]).

- **`presets.test.ts`** — `detectCurrentPreset` returns each preset
  for its exact `(dow, doy)`, and `"custom"` for any other combination
  (sample one inside the valid moment range that doesn't match a
  preset). One behavior per test ([[feedback_one_behavior_per_test]]).
- **`calendar.test.ts`** — extend the existing file with cases for
  `applyWeekConfig`:
  - `"locale"` with `global: false`: custom locale `week` matches the
    captured initial; global locale is unchanged.
  - `"locale"` with `global: true`: same result (the `global` flag is
    ignored on the locale path).
  - `{dow,doy}` with `global: false`: custom locale `week` matches
    the input; global locale `week` matches the captured initial.
  - `{dow,doy}` with `global: true`: both the custom and global locale
    `week` match the input.
  - Assertions read `moment.localeData()` / `moment.localeData("...")`
    rather than poking at private fields ([[feedback_black_box_assertions]]).
- **`bridge.test.ts`** — use a real `Calendar` + real `SettingsService`
  (per [[feedback_no_mock_fake_tests]]); `vi.spyOn(calendar,
"applyWeekConfig")` to assert call args. Cases:
  - Initial `{ mode: "locale" }` → `applyWeekConfig("locale",
{ global: false })`.
  - Mutate slice to `{ mode: "custom", dow: 1, doy: 4, global: false }`
    → second call with matching args.
  - Mutate slice to `{ mode: "custom", dow: 1, doy: 4, global: true }`
    → third call with `global: true`.
  - Mutate back to `{ mode: "locale" }` → fourth call with `"locale"`.
- **`CalendarWeekBlock.test.ts`** — testing-library/vue per
  [[feedback_testing_library_for_components]]:
  - Renders the global toggle when `mode === "custom"`, hides it when
    `mode === "locale"`. (Two tests, one behavior each.)
  - "Change" button opens the modal (`modalService.open` spy).
  - Modal `ok` result writes back to the slice; `err`/cancel does not.
- **`WeekPresetPickerModal.test.ts`** — testing-library/vue:
  - Selecting a preset row stages that preset's `{ dow, doy }` and
    keeps `mode: "custom"`.
  - Selecting "Locale default" stages `{ mode: "locale" }`.
  - Custom inputs: changing `dow` re-computes `doy` so the displayed
    "first day in Jan, week 1" value stays consistent.
  - "Update" submits the staged state; cancel does not.
- **No tests for** the preset _array's_ contents (it's pure data;
  testing that `weekPresets[0].dow === 1` is a tautology), the
  module's DI registrations, or the slice's defineSlice call
  ([[feedback_no_wiring_tests]], [[feedback_no_trivial_tests]]).

## Follow-ups

- **Update weekly journals on dow/doy change.** v2's
  `updateWeeklyJournals(plugin, notesToUpdate)` rewrites filenames so
  week-of-year is preserved. Lands with the v3 journal feature
  module; the bridge gains a post-`applyWeekConfig` hook then. Until
  journals exist, the v3 modal omits the v2 "this will update weekly
  notes" warning row.
- **`calendarView` slice + UI.** Awaits the v3 calendar-view feature
  module. Settings ports cleanly once the consumer exists.
- **v2 → v3 settings migration.** Map v2's `calendar = { dow: -1,
doy, global }` → `{ mode: "locale" }`; `calendar = { dow: 0..6,
doy, global }` → `{ mode: "custom", dow, doy, global }`. Lives in
  the broader migration spec.
- **Mid-session system-locale change.** If a user changes Obsidian's
  locale at runtime while `mode === "locale"`, v3 still uses the
  boot-captured value. Add a re-capture path if this turns up in
  practice.

## Cross-references

- [[v3-calendar-design]] — base calendar layer, custom locale,
  `Calendar` class. This spec implements its stated
  settings-driven-locale-retuning follow-up.
- [[2026-05-14-v3-settings-design]] — slice / migration plumbing.
- [[2026-05-14-v3-settings-ui-design]] — `defineDashboardBlock` and
  the dashboard shell.
- [[feedback_v2_fidelity_default]] — preserved every v2 variant
  (three presets + custom + "follow locale" + global toggle).
- [[feedback_ts_pattern_over_switch]] — bridge dispatch uses
  `match().with(...).exhaustive()`.
- [[feedback_di_constructor_injection]],
  [[feedback_di_eager_autoload]],
  [[feedback_di_omit_default_lifetime]],
  [[feedback_di_module_factories]] — DI conventions.
- [[feedback_di_in_vue_components]] — `useService` in components.
- [[feedback_errors_in_errors_ts]] — no new errors needed; if any are
  added later, they live in `src/calendar/errors.ts`.
- [[feedback_no_computed_around_i18n]] — inline `m.*()` in templates.
- [[feedback_inline_vue_props]] — inline `defineProps<{...}>()`.
- [[feedback_form_errors_in_description_slot]] — modal layout uses
  `UiSettingRow` rows.
- [[feedback_testing_library_for_components]],
  [[feedback_one_behavior_per_test]],
  [[feedback_black_box_assertions]],
  [[feedback_no_mock_fake_tests]],
  [[feedback_no_wiring_tests]],
  [[feedback_no_trivial_tests]] — testing conventions.
- [[project_v2_week_anchor_bug]] — the week-anchor bug already
  addressed in v3 calendar; nothing in this layer regresses it.
