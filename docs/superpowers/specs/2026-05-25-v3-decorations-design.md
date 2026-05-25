# v3 Decorations — design

Port v2's per-journal calendar decorations into v3, retaining functional parity while aligning the implementation with v3 conventions (DI, valibot schemas, `infrastructure/host` services, period-based calendar primitives). Engine + render plumbing only — the management UI and the notes-calendar consumer surface are out of scope (see §8).

## 1. Architecture & file layout

`decorations` is a new top-level feature at `src/decorations/`, peer to `calendar/`, `journals/`, `commands/`.

```
src/decorations/
  index.ts                  # public barrel
  config.ts                 # valibot schemas + InferOutput types
  defaults.ts               # defaultDecoration, defaultCondition, defaultStyle factories
  engine.ts                 # DecorationEngine (DI-resolved)
  engine.test.ts
  engine-checks.ts          # pure per-condition predicates
  engine-checks.test.ts
  derive-styles.ts          # pure CSS-derivation functions from a style list
  derive-styles.test.ts
  errors.ts
  module.ts                 # createDecorationsModule — DI registration
  testing.ts                # FakeJournalsIndex (if not already present), decoration builders
  use-cell-decorations.ts
  use-cell-decorations.test.ts
  ui/
    CellDecoration.vue
    CellDecoration.test.ts
    DecorationCorner.vue
    DecorationShape.vue
    DecorationIcon.vue
    color.ts
    color.test.ts
    modals.ts               # empty placeholder; populated when the management UI lands
```

Dependency direction is one-way: `decorations` consumes `calendar`, `journals`, `infrastructure/host`. Nothing depends back into `decorations`.

Wiring touchpoints outside the feature:

- `journals/config.ts` — `journalConfigSchema` adds `decorations: v.optional(v.array(decorationSchema), [])`. Schema imported from `decorations/config.ts`.
- `calendar/ui/CalendarMonthView.vue`, `CalendarWeekView.vue`, `CalendarQuarterView.vue`, `CalendarYearView.vue`, `CalendarDecadeView.vue` — gain a scoped `cell` slot exposing `{ period, label }` with default content equal to today's `{{ cell.label }}`. Existing consumers (`DatePickerModal`) are unaffected.
- `infrastructure/host/internal/note-metadata-service.ts` — new service (see §4).
- `infrastructure/host/index.ts` — re-exports `NoteMetadataService`, `NoteMetadata`, `NoteTask`.
- `infrastructure/host/module.ts` — registers the new service in the host DI module.
- `main.ts` — registers `createDecorationsModule()`.

## 2. Schema

Schemas authored in `decorations/config.ts` with valibot; types via `v.InferOutput` (per `feedback_infer_from_valibot`). No `id` field — decorations are an indexed array, matching v2.

### Leaf schemas (used only by decorations)

```ts
// ColorSettings — ported from v2 _old-code/types/settings.types.ts.
const colorSchema = v.union([
  v.object({ type: v.literal("transparent") }),
  v.object({ type: v.literal("theme"), name: v.string() }),
  v.object({ type: v.literal("custom"), color: v.string() }),
]);

const borderSideSchema = v.object({
  show: v.boolean(),
  width: v.pipe(v.number(), v.minValue(0)),
  color: colorSchema,
  style: v.string(),
});
```

`colorSchema` lives here until a second consumer needs it; lift then.

### Style discriminated union

```ts
const backgroundStyle = v.object({ type: v.literal("background"), color: colorSchema });
const colorStyle = v.object({ type: v.literal("color"), color: colorSchema });

const borderStyle = v.object({
  type: v.literal("border"),
  border: v.union([v.literal("uniform"), v.literal("different")]),
  left: borderSideSchema,
  right: borderSideSchema,
  top: borderSideSchema,
  bottom: borderSideSchema,
});

const shapeStyle = v.object({
  type: v.literal("shape"),
  size: v.pipe(v.number(), v.minValue(0)),
  shape: v.union([
    v.literal("square"),
    v.literal("circle"),
    v.literal("triangle-up"),
    v.literal("triangle-down"),
    v.literal("triangle-left"),
    v.literal("triangle-right"),
  ]),
  color: colorSchema,
  placement_x: v.union([v.literal("left"), v.literal("center"), v.literal("right")]),
  placement_y: v.union([v.literal("top"), v.literal("middle"), v.literal("bottom")]),
});

const cornerStyle = v.object({
  type: v.literal("corner"),
  placement: v.union([
    v.literal("top-left"),
    v.literal("top-right"),
    v.literal("bottom-left"),
    v.literal("bottom-right"),
  ]),
  color: colorSchema,
});

const iconStyle = v.object({
  type: v.literal("icon"),
  icon: v.string(),
  placement_x: v.union([v.literal("left"), v.literal("center"), v.literal("right")]),
  placement_y: v.union([v.literal("top"), v.literal("middle"), v.literal("bottom")]),
  color: colorSchema,
  size: v.pipe(v.number(), v.minValue(0)),
});

const decorationStyleSchema = v.union([backgroundStyle, colorStyle, borderStyle, shapeStyle, cornerStyle, iconStyle]);
export type JournalDecorationStyle = v.InferOutput<typeof decorationStyleSchema>;
```

The engine does not enforce uniqueness of any style type. v2's "first background/color/border wins" semantics are preserved at the renderer level.

### Condition discriminated union

`title`, `tag`, `date`, `weekday`, `offset`, `has-note`, `has-open-task`, `all-tasks-completed` port from v2 verbatim. `property` becomes a typed three-arm union keyed on `valueType`:

```ts
const stringPropCondition = v.object({
  type: v.literal("property"),
  name: v.pipe(v.string(), v.minLength(1)),
  valueType: v.literal("text"),
  condition: v.union([
    v.literal("exists"),
    v.literal("does-not-exist"),
    v.literal("eq"),
    v.literal("neq"),
    v.literal("contains"),
    v.literal("does-not-contain"),
    v.literal("starts-with"),
    v.literal("ends-with"),
  ]),
  value: v.string(),
});

const numberPropCondition = v.object({
  type: v.literal("property"),
  name: v.pipe(v.string(), v.minLength(1)),
  valueType: v.literal("number"),
  condition: v.union([
    v.literal("exists"),
    v.literal("does-not-exist"),
    v.literal("eq"),
    v.literal("neq"),
    v.literal("lt"),
    v.literal("lte"),
    v.literal("gt"),
    v.literal("gte"),
  ]),
  value: v.number(),
});

const booleanPropCondition = v.object({
  type: v.literal("property"),
  name: v.pipe(v.string(), v.minLength(1)),
  valueType: v.literal("checkbox"),
  condition: v.union([v.literal("exists"), v.literal("does-not-exist"), v.literal("is-true"), v.literal("is-false")]),
});

const propertyCondition = v.union([stringPropCondition, numberPropCondition, booleanPropCondition]);
```

When evaluation detects a type mismatch between the rule's `valueType` and the actual frontmatter value, the predicate returns `false` — no implicit coercion. List- and date-typed properties remain unaddressed (see §8).

### Top-level

```ts
export const decorationSchema = v.object({
  mode: v.union([v.literal("and"), v.literal("or")]),
  conditions: v.array(decorationConditionSchema),
  styles: v.array(decorationStyleSchema),
});
export type JournalDecoration = v.InferOutput<typeof decorationSchema>;
export type JournalDecorationCondition = v.InferOutput<typeof decorationConditionSchema>;
```

`journalConfigSchema` gains `decorations: v.optional(v.array(decorationSchema), [])`. Existing journal configs and tests parse unchanged.

### Defaults

`defaults.ts` exports `defaultDecoration()`, `defaultCondition(type)`, and `defaultStyle(type)` — direct ports of v2's `defaultConditions` / `defaultDecorations` maps. Used by the future modal and by test builders.

## 3. Condition engine

```ts
export class DecorationEngine {
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #metadata = inject(NoteMetadataService);
  readonly #cycle = inject(CycleService);

  evaluateRange(
    periods: ReadonlyArray<Period>,
    decorations: ReadonlyArray<{ journalName: string; decoration: JournalDecoration }>,
  ): Map<AnchorString, JournalDecorationStyle[]>;

  evaluateAnchor(
    period: Period,
    decorations: ReadonlyArray<{ journalName: string; decoration: JournalDecoration }>,
  ): JournalDecorationStyle[];
}
```

`evaluateRange` is the seeding entry point used on initial mount and on scope/settings change. `evaluateAnchor` is the per-event entry point used by the composable for targeted invalidations (§5).

### Flow

For each `(journalName, decoration)` pair the engine:

1. Looks up the journal config via `JournalsRepository.get(journalName)`. Missing config → drop the decoration silently (a journal can disappear between settings save and render).
2. For each period in scope: checks `periodMatchesWrite(period.kind, config.write.type)`. Mismatches are skipped — a weekly decoration is structurally incapable of producing styles on a day anchor.
3. Computes `period.anchor.toAnchor()` and looks up `JournalsIndex.entryByAnchor(journalName, anchor)` → `Option<JournalEntry>`. The entry's `path` feeds `NoteMetadataService.get(path)` → `Option<NoteMetadata>`. Both lookups are cached per `(journalName, anchor)` for the duration of one `evaluateRange` call.
4. Evaluates `mode` + `conditions`. `or`-mode short-circuits on the first match; `and`-mode short-circuits on the first miss. Empty `conditions` → `false` in both modes (v2 parity).
5. On a match, appends `decoration.styles` to the per-anchor bucket. Bucket order follows caller-supplied `decorations` order — the consumer controls layering via its `journalName` list ordering.

`period.anchor` (not `period.start`) is the canonical position; this matches the ISO-week cross-year semantics already captured by `project_v2_week_anchor_bug`.

### Period × write-type matcher

```ts
function periodMatchesWrite(kind: PeriodKind, writeType: JournalWrite["type"]): boolean {
  return match([kind, writeType] as const)
    .with(["day", "day"], ["day", "custom"], () => true)
    .with(["week", "week"], () => true)
    .with(["month", "month"], () => true)
    .with(["quarter", "quarter"], () => true)
    .with(["year", "year"], () => true)
    .otherwise(() => false);
}
```

`DecadePeriod` has no matching write-type → no decorations apply there.

### Per-condition dispatch

`#check(condition, period, journal, metadata)` uses `ts-pattern` (per `feedback_ts_pattern_over_switch`):

```ts
return match(condition)
  .with({ type: "title" }, (c) => checkTitle(c, metadata()))
  .with({ type: "tag" }, (c) => checkTag(c, metadata()))
  .with({ type: "property" }, (c) => checkProperty(c, metadata()))
  .with({ type: "date" }, (c) => checkDate(c, period))
  .with({ type: "weekday" }, (c) => checkWeekday(c, period))
  .with({ type: "offset" }, (c) => checkOffset(c, period, journal, this.#cycle))
  .with({ type: "has-note" }, () => metadata().isSome())
  .with({ type: "has-open-task" }, () => metadata().match({ none: () => false, some: hasOpenTask }))
  .with({ type: "all-tasks-completed" }, () => metadata().match({ none: () => false, some: allTasksCompleted }))
  .exhaustive();
```

Each `check*` is a free function in `engine-checks.ts`:

- `checkTitle` / `checkTag` — case-insensitive `contains` / `starts-with` / `ends-with`, v2 parity.
- `checkProperty` — outer `match(condition.valueType)` then per-op `match(condition.condition)`. The `text` arm preserves v2 case-insensitive behavior including the array-or-scalar property handling. The `number` arm does strict numeric comparison without coercion. The `checkbox` arm reads as boolean. Type mismatch returns `false`.
- `checkDate` — wildcard semantics: `day === -1` and `month === -1` are wildcards, `year === null` is "any year." Uses `period.anchor` directly (no string parsing).
- `checkWeekday` — `condition.weekdays.includes(period.anchor.dayOfWeek())`. Empty `weekdays` array → `false`.
- `checkOffset` — delegates to `CycleService.calculateOffset(journal, period)` (the v3 equivalent of v2's per-journal `calculateOffset`); positive offsets check positive-direction count, negative check negative-direction.
- `hasOpenTask` / `allTasksCompleted` — operate on `NoteMetadata.tasks`, empty list → `false`.

### Error model

`evaluateRange` and `evaluateAnchor` return concrete maps/arrays; they never throw. Missing journal, missing entry, missing metadata, missing property, mismatched property type — all surface as "condition is false." This matches v2 and matches user intent: a rule for a missing thing should simply not apply.

## 4. NoteMetadataService

New service in `src/infrastructure/host/internal/note-metadata-service.ts`, exposing read-only metadata for a `VaultPath`. Wraps `app.metadataCache.getFileCache` with no extra caching of its own.

```ts
export interface NoteTask {
  readonly completed: boolean;
}
export interface NoteMetadata {
  readonly title: string;
  readonly tags: ReadonlyArray<string>;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly tasks: ReadonlyArray<NoteTask>;
}

export class NoteMetadataService {
  readonly #app = inject(InternalObsidianAppToken);

  get(path: VaultPath): Option<NoteMetadata> {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return Option.none();
    const cache = this.#app.metadataCache.getFileCache(file);
    if (!cache) return Option.none();
    return Option.some({
      title: file.basename,
      tags: cache.tags?.map((t) => t.tag) ?? [],
      properties: cache.frontmatter ?? {},
      tasks: cache.listItems?.filter((li) => li.task !== undefined).map((li) => ({ completed: li.task !== " " })) ?? [],
    });
  }
}
```

v2-parity choices:

- Tags include the leading `#`, sourced from `cache.tags[].tag` (inline tags only). Frontmatter `tags:` is not folded in (see §8).
- Tasks are derived from `cache.listItems` filtered by `li.task !== undefined`; `completed === true` when `li.task !== " "` (matches v2: `[x]`, `[/]`, `[-]` all count as "not open"). The semantic distinction "completed" vs "non-blank" is v2's, retained for parity.
- Properties are the raw `cache.frontmatter` object, untyped at this layer. The decoration engine's typed property condition dispatches on `valueType` at check time.

Why a separate service rather than extending `NotesService`: `NotesService` is lifecycle + IO with `AsyncResult` error vocabulary; `NoteMetadataService` is sync `Option`-returning reads of an in-memory cache. Different error model, different consumer contract. Two services keep both crisp.

Events: no new emitter. `NotesService.events["metadata-changed"]` already fires from the same `app.metadataCache` and is what the composable subscribes to (§5).

Module wiring: `createHostModule(plugin)` registers `NoteMetadataService` at default (Container) lifetime per `feedback_di_omit_default_lifetime`.

Test fake: `infrastructure/host/testing.ts` adds `FakeNoteMetadataService` (in-memory `Map<VaultPath, NoteMetadata>` plus a `setMetadata(path, data)` setter). Used by all decoration tests.

## 5. Composable + render integration

### `useCellDecorations`

Lives at `src/decorations/use-cell-decorations.ts`. Computes per-anchor reactive style lists for the visible grid, exposes them via `provide()` for descendant `CellDecoration` components.

```ts
export type CellStyleRef = ShallowRef<ReadonlyArray<JournalDecorationStyle>>;

export const CellDecorationMapKey: InjectionKey<ReadonlyMap<AnchorString, CellStyleRef>> =
  Symbol("decorations:cell-map");

export function useCellDecorations(
  periodsRef: MaybeRefOrGetter<ReadonlyArray<Period>>,
  journalNamesRef: MaybeRefOrGetter<ReadonlyArray<string>>,
): ReadonlyMap<AnchorString, CellStyleRef>;
```

Internal state, all closure-scoped to the composable invocation:

```ts
const cells = new Map<AnchorString, CellStyleRef>();
let journalNamesInScope = new Set<string>();
let anchorsByPath = new Map<VaultPath, AnchorString>();
let periodsByAnchor = new Map<AnchorString, Period>();
```

### Reactive structure

Three drivers:

1. **`watchEffect(reseed)`** — re-runs whenever `periodsRef`, `journalNamesRef`, or any in-scope journal's `decorations` array changes (`gatherDecorations()` reads `journal.decorations` through the reactive `JournalsRepository.get`). Drops out-of-scope anchors, adds new ones, replaces all per-anchor `ShallowRef.value`s using `engine.evaluateRange`.

2. **`notes.events["metadata-changed"]` (attached in `onMounted`)** — handler:

   ```ts
   const anchor = anchorsByPath.get(path);
   if (anchor === undefined) return; // not a journal note in scope
   const period = periodsByAnchor.get(anchor)!;
   cells.get(anchor)!.value = engine.evaluateAnchor(period, gatherDecorations());
   ```

   Single Map lookup discards unrelated events; in-scope events trigger one targeted `evaluateAnchor` call updating exactly one `ShallowRef`.

3. **`index.events["entryChanged"]` (attached in `onMounted`)** — handler updates `anchorsByPath` (add on `kind === "added"`, delete on `removed`) and recomputes the affected anchor's ref. Cross-references `journalNamesInScope` and `periodsByAnchor` to drop out-of-scope events.

`onUnmounted` detaches both listeners.

### Per-anchor reactivity rationale

A single `ShallowRef` per anchor means a metadata change to one note's frontmatter re-evaluates that one anchor and re-renders only the corresponding `CellDecoration`. Other cells see no reactive churn. This matches v2's per-cell granularity without v2's overhead of 30–500 reactive computeds — there is exactly one reactive read per visible cell, and exactly one event handler per visible grid.

### Provide/inject contract

The composable calls `provide(CellDecorationMapKey, cells)` unconditionally. `CellDecoration.vue` injects with a `null` fallback: if no parent provides decorations (e.g. `CellDecoration` used in a surface that hasn't called `useCellDecorations`), the component falls through to a transparent passthrough — `styles.value === []` → no decoration → slot content renders untouched.

### Slot integration on existing views

Each calendar period view gains a scoped `cell` slot exposing `{ period, label }`. Default content is the current `{{ cell.label }}` so existing consumers (`DatePickerModal`, current tests) are unaffected.

```vue
<UiButton v-for="cell in grid" :key="cell.key" ...>
  <slot name="cell" :period="cell.period" :label="cell.label">{{ cell.label }}</slot>
</UiButton>
```

The future notes-calendar view will supply:

```vue
<CalendarMonthView :outer-period :selected :bounds>
  <template #cell="{ period, label }">
    <CellDecoration :period>{{ label }}</CellDecoration>
  </template>
</CalendarMonthView>
```

Because the engine handles mixed-kind periods (§3), the notes-calendar view can run **one** `useCellDecorations(allCellsAcrossAllRegions, allJournalNames)` at the top of its tree; one `provide()` reaches every `CellDecoration` in every region (day cells / week column / month-year header). Per-region composables are not required.

### Invariants worth a comment in source

- Event handlers attach in `onMounted`, after `watchEffect(reseed)` has populated `cells`. Reordering would race.
- `cells.get(anchor)!` is safe in event handlers because the handler guards on `periodsByAnchor.has(anchor)` first, and `reseed` keeps the two maps coherent.

## 6. Rendering (CSS port)

`CellDecoration.vue` and its three subcomponents (`DecorationCorner.vue`, `DecorationShape.vue`, `DecorationIcon.vue`) are direct ports of v2's `CalendarDecoration.vue` and `decorations/Decoration*.vue`. Visual logic is unchanged.

### Derivations live in pure functions

`derive-styles.ts` exports:

```ts
function backgroundFrom(styles: ReadonlyArray<JournalDecorationStyle>): string;
function textColorFrom(styles: ReadonlyArray<JournalDecorationStyle>): string;
function borderStylesFrom(styles): { borderTop; borderRight; borderBottom; borderLeft };
function paddingFrom(styles): string;
function placedFrom(styles): Record<string, Array<JournalDecorationShape | JournalDecorationIcon>>;
function cornersFrom(styles): JournalDecorationCorner[];
```

Each function takes the style array and returns a primitive (string / Record) ready to bind. This keeps the SFC thin and tests targeted: `derive-styles.test.ts` covers the v2 math exhaustively without touching Vue.

### v2 quirk fix

v2's uniform-border padding contribution erroneously used `right.width` for the right side and `bottom.width` for the bottom side rather than applying `left.width` to all four sides as "uniform" implies. **Fixed in v3**: uniform borders contribute `left.width` to all four padding sides. The `borderStylesFrom` derivation (which side gets which color/style) already correctly mirrors `left` to all four sides in the uniform case; only the padding math was wrong.

### Subcomponents

- `DecorationCorner.vue` — absolutely-positioned triangle in one of four corners; color from `decoration.color`. CSS via `clip-path`.
- `DecorationShape.vue` — square/circle via CSS shape, triangles via `clip-path`. Sized in `em` (scales with cell font).
- `DecorationIcon.vue` — calls existing `renderIcon` from `infrastructure/host` to inject the Obsidian icon SVG into an `em`-sized container.

### Color helper

`decorations/ui/color.ts` ports v2's `colorToString` (in `_old-code/utils/color.ts`). Kept here because only this feature consumes it; lift to a shared location if a second consumer emerges.

### Inline-style binding

`CellDecoration.vue` uses Vue's `v-bind(...)` in `<style scoped>` for dynamic background / textColor / padding (matching v2), and explicit `:style` for border (per-side strings). Static positioning + grid classes remain regular scoped CSS.

## 7. Testing

Conventions enforced by repo memories: colocated `*.test.ts`, nested `describe()`, one behavior per test, black-box assertions, `@testing-library/vue` for components.

### What gets tested

| File                            | Surface                                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine-checks.test.ts`         | One `describe()` per condition type. Property gets nested describes for `text` / `number` / `checkbox`, each covering every op. Wildcard / empty / missing-metadata cases included.                                    |
| `engine.test.ts`                | `evaluateRange` and `evaluateAnchor` integration: period × write-type filter, mixed-kind input bucketing, missing-journal handling, `mode: and / or / empty` semantics. Resolved through a real `Injector` with fakes. |
| `derive-styles.test.ts`         | First-wins (background, color), border combinations, fixed uniform-padding math, 3×3 placement bucketing, corner collection.                                                                                           |
| `use-cell-decorations.test.ts`  | Initial seed, per-anchor metadata-event invalidation, scope-out filtering, `entryChanged` add/remove, scope change re-seed, `decorations` array mutation re-seed, `onUnmounted` detach.                                |
| `CellDecoration.test.ts`        | Slot pass-through, style application when map provided, transparent fallback when no map provided. Detailed CSS math is covered by `derive-styles.test.ts`.                                                            |
| `note-metadata-service.test.ts` | Tag / property / task extraction from a hand-built `getFileCache` shim; `Option.none()` on missing file or absent cache.                                                                                               |

### What is not tested

- `createDecorationsModule`, host-module addition of `NoteMetadataService` — DI wiring (per `feedback_no_wiring_tests`).
- `FakeNoteMetadataService` and per-condition / per-style builders in `testing.ts` (per `feedback_no_mock_fake_tests`).
- The valibot schemas in isolation — round-trip / default behavior is library behavior (per `feedback_no_trivial_tests`); exercised transitively through engine tests built from the schema-typed defaults.
- The slot addition on `CalendarMonthView` etc. — structural pass-through; existing view tests stay green, which is the signal that nothing broke.
- The `decorations` array's persistence through `journalConfigSchema` — covered transitively by existing journals settings tests.

### Test infrastructure

- `decorations/testing.ts` — `buildDecoration({ mode?, conditions?, styles? })`, per-condition builders (`titleCondition(...)`, `numberPropertyCondition(...)`, etc.), per-style builders. Used uniformly across decoration tests.
- `infrastructure/host/testing.ts` — gains `FakeNoteMetadataService` and its setter API.
- No top-level `mocks/` or `fixtures/`, no test-local stubs (per `feedback_testing_dir_layout`).

### Discipline

- Each test asserts one behavior; no `"matches title and tag"` combined cases.
- Names are subject + verb (`feedback_test_descriptions`), e.g. `"first background style wins when multiple are present"`, `"updates only the affected anchor when a metadata-changed event fires"`.
- Composable tests use a minimal host-component pattern rather than a wrapper around `mount` (per `feedback_no_vitest_wrappers`).

## 8. Out of scope, follow-ups, risks

### Out of scope

- **EditDecoration management UI.** Modals, color picker, condition/style editors. Decorations are editable via raw settings (or programmatic `JournalsRepository.update`) until a follow-up spec ports them.
- **Notes-calendar view.** The visible surface that would actually consume `useCellDecorations` is its own future spec. This spec ships engine, composable, renderer, and the slot; nothing currently visible in v3 displays decorations.
- **Week-number column and month/year header.** Belong to whoever ports the notes-calendar view. The engine and `CellDecoration` already support non-day periods through the kind filter.
- **DecadePeriod decorations.** No matching write-type → engine drops them. Matches v2.
- **Frontmatter `tags:` extraction.** v2 parity: inline tags only.
- **List- and date-typed property conditions.** `valueType` covers `text` / `number` / `checkbox` only; extending the union is a small additive change when a use case arrives.
- **Decoration IDs / reorder.** Indexed array suffices for current operations; ids would land with a management UI that needs them.
- **Cross-journal decoration sharing.** Decorations stay per-journal.
- **v2 → v3 settings migration.** v3 settings are fresh; no decoration-specific migration code.
- **Further perf optimizations.** No rAF batching, no engine-level memoization across composable instances. The per-anchor-ref design plus event filtering handles the year-of-months scale (~500 visible cells). Optimization lands in a follow-up if real configs push an order of magnitude higher.

### Natural follow-up specs (dependency order)

1. **Notes-calendar view** — first real consumer.
2. **EditDecoration management UI** — modals consolidated in `decorations/ui/modals.ts` per `feedback_modals_consolidation`; uses `feedback_form_errors_in_description_slot` patterns for the editor.
3. **Color schema reconciliation** — if a second v3 feature needs colors, lift `colorSchema` from `decorations/config.ts`.
4. **Frontmatter tags and list/date property conditions** if asked for.

### Risks

- **High-cardinality settings.** 20 journals × 20 decorations × 500 cells = 200K predicate evaluations per re-seed. Predicates are cheap struct comparisons; back-of-envelope single-digit ms. If real configs reach an order of magnitude higher, the engine grows a "decorations grouped by journal write-type" pre-pass to skip the per-period kind check. Not needed yet.
- **Color helper drift.** Living in `decorations/ui/color.ts`; the moment a second consumer emerges, lift to shared location to prevent fork.
- **JournalsRepository reactivity assumption.** `gatherDecorations()` relies on `journal.decorations` array mutations being trackable through the reactive settings storage. Confirmed indirectly by other features that mutate similar arrays reactively. Worth a sanity check at impl time that `splice`/index-assign trigger the watchEffect.

### Definition of done

- `npm run test`, `npm run check:types`, `npm run check:lint` all clean.
- Existing calendar view tests and `DatePickerModal` tests pass unchanged.
- New decoration tests cover engine, derivations, composable, component, and metadata service per §7.
