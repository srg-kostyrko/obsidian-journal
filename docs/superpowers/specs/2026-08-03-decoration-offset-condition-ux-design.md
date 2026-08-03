# Decoration offset condition UX

## Problem

The `offset` decoration condition (custom-interval journals only) is unusable as shipped:

- `decorations/defaults.ts:71` creates it as `{ type: "offset", offset: 0 }`, and `0` can
  never match. `CycleService.offsets` (`journals/cycle.ts:230`) returns
  `[diff(start) + 1, diff(end) - 1]`, so the positive channel starts at `1` and the negative
  channel ends at `-1`. A freshly added offset condition silently matches nothing.
- The editor hint reads "Matches {days} days from the start of the interval", which is
  distance language over ordinal data. `offset: 1` renders as "1 days from the start", so a
  user reasonably expects it to mark the day _after_ the interval start; it marks the start.
- `decoration_condition_offset_describe` is `"offset from start is {offset}"` — it says
  "from start" even for negatives, so `-3` reads as "offset from start is -3".

The engine is correct. Everything broken is presentation plus a bad default.

## Decisions

- **Keep the stored shape and its meaning.** The value stays a signed 1-based ordinal:
  `1` = first day, `-1` = last day. No migration, no settings version bump.
- **`0` is coerced to `1` at the schema boundary**, so the dead value stops existing for
  every reader at once instead of being special-cased in the editor and the engine.
- **The editor splits the sign off into a segmented control**, so a negative — and `0` —
  become unspellable rather than merely discouraged.
- **Copy names the two extremes and numbers the rest.** No ordinal suffixes ("3rd",
  "3rd-to-last"): they need per-locale plural-ordinal rules that the inlang machine
  translation will get wrong across the tier 2 locales.

## Schema and defaults

`decorations/config.ts`:

```ts
const offsetCondition = v.object({
  type: v.literal("offset"),
  offset: v.pipe(
    v.number(),
    v.integer(),
    v.transform((n) => (n === 0 ? 1 : n)),
  ),
});
```

`decorations/defaults.ts:71`: `.with("offset", () => ({ type: "offset", offset: 1 }))`.

A saved `0` has never matched anything, so no configured behaviour is lost. A decoration
that previously showed nowhere starts marking interval start days after reload — that is the
repair, and it is a user-visible **Fixed** entry in the changelog.

## New component: `src/ui/UiSegmentedControl.vue`

Single-select counterpart to `UiToggleGroup`. The weekday toggle-group design
(`2026-07-06-weekday-toggle-group-design.md`, "Out of scope") already ruled that single-select
segmented controls are a distinct radio-like shape and must not be fused into `UiToggleGroup`.
This is that component.

- `<script setup lang="ts" generic="T">`, `const model = defineModel<T>({ required: true })`.
- Props: `{ options: { value: T; label: string; tooltip?: string }[]; disabled?: boolean }`.
- Markup is **native radio inputs**, not `role="radio"` buttons: a `role="radiogroup"`
  wrapper div (so a fallthrough `aria-label` names the group, as `UiToggleGroup` already
  relies on), and per option a `<label>` wrapping a visually-hidden
  `<input type="radio" :name :value v-model="model">` plus a `<span>` for the text. Arrow-key
  navigation, roving focus, and checked state come from the platform rather than from JS.
- `name` comes from `useId()` so two instances on one page do not join the same radio group.
- Scoped CSS mirrors `UiToggleGroup`'s connected-row look with Obsidian theme vars: checked
  segment on `--interactive-accent` / `--text-on-accent`, unchecked on `--background-primary`
  / `--text-muted`, `1px` `--background-modifier-border` dividers, and a focus ring driven by
  `input:focus-visible + span`.

### Test: `src/ui/UiSegmentedControl.test.ts`

testing-library + user-event, one behaviour per test, queried by
`getByRole("radio", { name, checked })`:

1. renders a radio for each option
2. marks the option matching the model as checked
3. emits the clicked option's value

## Editor: `src/decorations/settings/ui/ConditionOffset.vue`

Renders a direction segmented control, a day number input, and the hint, in the same flat
inline layout the other condition leaves use (`ConditionDate.vue` renders bare controls; the
`UiSettingRow` wrapping happens in the parent).

```ts
const { name } = defineProps<{ name: string }>();
const { value: offset } = useField<number>(`${name}.offset`);

const day = ref<number | undefined>(Math.abs(offset.value) || 1);

const side = computed<"start" | "end">({
  get: () => (offset.value < 0 ? "end" : "start"),
  set: (next) => {
    // fall back to the stored magnitude so the direction still flips mid-edit
    const magnitude = typeof day.value === "number" ? day.value : Math.abs(offset.value);
    offset.value = next === "end" ? -magnitude : magnitude;
  },
});

watch(offset, (next) => {
  const magnitude = Math.abs(next);
  if (magnitude >= 1) day.value = magnitude;
});

watch(day, (next) => {
  if (typeof next !== "number" || !Number.isInteger(next) || next < 1) return;
  offset.value = side.value === "end" ? -next : next;
});
```

The day number is a **local `ref` with watchers, not a writable `computed` over the field.**
This is the constraint that breaks the naive version: clearing the input makes `UiNumberInput`
emit a non-numeric value, a computed setter would coerce that back to `1`, and its getter would
immediately re-render `1` — making the field impossible to clear and retype. With a local ref,
an empty input simply skips the write and leaves the last valid `offset` in place.

The guard tests `typeof next !== "number"` rather than `next === undefined`, because Vue's
`v-model` on `<input type="number">` passes the raw empty string through `looseToNumber`, which
returns `""` unchanged when `parseFloat` yields `NaN`. The declared model type says `number`;
the runtime value on an empty field does not.

The number input carries `:min="1"` so the spinner arrows cannot walk below the valid range.

The hint reads from `offset`, not from `day`, so it stays stable while the input is empty:

```ts
const hint = computed(() =>
  m.decoration_condition_offset_hint({
    side: offset.value < 0 ? "end" : "start",
    day: Math.abs(offset.value),
  }),
);
```

### Test: `ConditionOffset.test.ts` (rewritten)

Same vee-validate host harness as today, so the schema's `0 → 1` coercion is exercised through
the real form:

1. shows a stored negative offset as the end direction with a positive day
2. stores a negative offset when the end direction is picked
3. stores a positive offset when the start direction is picked
4. updates the stored offset as the user types a day
5. describes day 1 from the start as the first day of the interval
6. describes day 1 from the end as the last day of the interval

## Summary line: `describe-condition.ts:49`

```ts
.with({ type: "offset" }, (c) =>
  m.decoration_condition_offset_describe({
    side: c.offset < 0 ? "end" : "start",
    day: Math.abs(c.offset),
  }),
)
```

`describe-condition.test.ts` gains one case per variant.

## i18n

Two-selector match blocks over `side` and `day`. The pattern already exists in
`journal_add_modal_every_unit` (`"unit=day,count=1"`), and exact numeric match keys are already
in use (`journal_delete_connected_count` uses `count=0`), so this needs nothing new from the
pipeline.

**Reworked** (`messages/en.json`):

```
decoration_condition_offset_hint     declarations: [input side, input day]  selectors: [side, day]
  side=start,day=1  "Matches the first day of the interval."
  side=start,day=*  "Matches day {day} of the interval."
  side=end,day=1    "Matches the last day of the interval."
  side=end,day=*    "Matches day {day} counted back from the end of the interval."

decoration_condition_offset_describe declarations: [input side, input day]  selectors: [side, day]
  side=start,day=1  "is the first day of the interval"
  side=start,day=*  "is day {day} of the interval"
  side=end,day=1    "is the last day of the interval"
  side=end,day=*    "is day {day} counted back from the end of the interval"
```

The `describe` register stays a lowercase fragment, matching its neighbours ("a note exists",
"tag contains x").

**Added:**

- `decoration_condition_offset_direction_label` → "Count from" (group `aria-label`)
- `decoration_condition_offset_direction_option`, selector `side` → `side=start`: "From start",
  `side=end`: "From end"
- `decoration_condition_offset_day_label` → "Day" (number input `aria-label`)

**Removed:** `decoration_condition_offset_label` ("Offset"), superseded by the two labels above.
It must be deleted from all eleven message files, not just `en.json`.

**Locales.** All ten non-English files carry the old two-variant shape _and_ the old incorrect
meaning — `uk.json:658` currently reads "зміщення від початку дорівнює {offset}", a faithful
translation of wrong English. They cannot be salvaged and must be regenerated: run
`npm run translate:i18n` (needs a Google key; it chains `fix-i18n-variant-keys.mjs` and
`check:i18n`), then `npm run compile:i18n`. Never stage `src/i18n/paraglide`.

## Out of scope

- Range or band matching ("within the first 3 days"). Today that still needs several offset
  conditions with `mode: "or"`. Deliberately deferred — it is a schema change, and this spec
  is a presentation fix.
- Extending the offset condition to fixed-period journals. It stays `custom`-only per
  `condition-types.ts:13`.
- `CycleService.offsets` and `checkOffset` — both already correct.

## Verification

`npm test`, `npm run check:types`, `npm run check:lint`, plus `npm run compile:i18n` after the
message edits.

No e2e. This is presentation over an engine path that unit tests already cover, and per the
e2e-fixture rule an offset e2e would need a custom-interval journal whose decoration differs
from the default path to be worth anything — the unit tests establish that more cheaply.
