# v3 Notes-Calendar — design

The cell-level layer that turns a plain `CalendarMonthView` (or sibling) cell into one that shows journal-aware state: per-cell decoration overlay, active-note highlight, click-to-open, right-click file menu, and cmd/ctrl-hover preview. First real consumer of [the decorations engine](./2026-05-25-v3-decorations-design.md) and a precondition for any future surface that displays journal-aware calendar cells — code blocks, the future v3 calendar-view leaf, etc. The leaf and the navigation code-block are not part of this spec (see §7).

## 1. Architecture & file layout

`notes-calendar` is a new top-level feature at `src/notes-calendar/`, peer to `decorations/`, `calendar/`, `journals/`. It is a horizontal integration layer that crosses calendar + journals + decorations + host; making it a sub-feature of any one of those would be misleading.

```
src/notes-calendar/
  index.ts                     # public barrel
  module.ts                    # notesCalendarModule
  active-entry.ts              # ActiveEntryViewModel (singleton, see §3)
  active-entry.test.ts
  use-shelf-scope.ts           # journals filtered by shelf, partitioned by write-type
  use-shelf-scope.test.ts
  use-notes-cell.ts            # per-surface composable: actions + isActive + isActionable
  use-notes-cell.test.ts
  cell-format.ts               # pure: default format pattern per PeriodKind
  cell-format.test.ts
  testing.ts                   # FakeActiveEntryViewModel, cell builders, NotesCellApi stub
  ui/
    NotesCalendarCell.vue
    NotesCalendarCell.test.ts
```

Dependency direction is one-way: `notes-calendar` consumes `calendar`, `journals` (including `OpenDateFlow`, `JournalsIndex`, `JournalsRepository`, `TimelineService`), `shelves`, `decorations`, `infrastructure/host`, `infrastructure/flows`, `infrastructure/di`. Nothing depends back into `notes-calendar`.

Wiring touchpoints outside the feature:

- `infrastructure/host/internal/workspace-service.ts` — adds `triggerHoverPreview(path, event)` and `openFileMenu(path, event)`. See §2.
- `infrastructure/host/index.ts` — no new exported types; the new methods are reachable through `WorkspaceService`.
- `infrastructure/host/testing.ts` — `FakeWorkspaceService` gains spies for the two new methods.
- `infrastructure/host` — adds `defineOpenMode(event): OpenMode` utility (modifier-key → host `OpenMode`). v2-era helper, reusable beyond this feature.
- `calendar/ui/CalendarMonthView.vue`, `CalendarWeekView.vue`, `CalendarQuarterView.vue`, `CalendarYearView.vue`, `CalendarDecadeView.vue` — `select` emit signature changes to `[cell: Period, event: MouseEvent]`; click handler passes `$event` through. No other change.
- `calendar/ui/DatePickerModal.vue` — `onCellSelect` signatures gain an unused second arg.
- `main.ts` — registers `notesCalendarModule`.

## 2. Host wrappers

Two new sync methods on `WorkspaceService`:

```ts
triggerHoverPreview(path: VaultPath, event: MouseEvent): void {
  this.#app.workspace.trigger("link-hover", this.#plugin, event.target, path, path);
}

openFileMenu(path: VaultPath, event: MouseEvent): void {
  const file = this.#app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  const menu = new Menu();
  this.#app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", null);
  menu.showAtMouseEvent(event);
}
```

Both are fire-and-forget — Obsidian's `trigger` is synchronous and never throws meaningfully for these signals. Missing-file is a silent no-op; the cell composable already guards on path existence before calling either method, so the silent no-op is defense-in-depth, not the primary path. No `Result` vocabulary.

Tests in `workspace-service.test.ts`: verify both methods call `app.workspace.trigger` with the expected arguments; verify `openFileMenu` no-ops on missing file. `FakeWorkspaceService` in `infrastructure/host/testing.ts` exposes both as spies for cell-composable tests.

`defineOpenMode(event)` lands as a separate utility in `infrastructure/host` (location and exact name follow existing conventions): pure function from a `MouseEvent` to an `OpenMode` (`"active" | "tab" | "split" | "window"`) per the v2 mapping (e.g. cmd/ctrl-click → `"tab"`, cmd+shift → `"split"`). Reusable by any host-aware surface, not just notes-calendar.

## 3. ActiveEntryViewModel

A singleton DI service that exposes a reactive "what journal entry, if any, is the active note?" — used by every cell to compute `isActive` with one shared subscription instead of N.

```ts
export interface ActiveEntryRef {
  readonly journalName: string;
  readonly anchor: AnchorString;
}

export class ActiveEntryViewModel {
  readonly #workspace = inject(WorkspaceService);
  readonly #index = inject(JournalsIndex);

  readonly active: ShallowRef<ActiveEntryRef | null> = shallowRef(null);

  constructor() {
    this.#refresh(this.#workspace.activeNote());
    this.#workspace.events.on("active-note-changed", (path) => this.#refresh(path));
    this.#index.events.on("entryChanged", ({ entry, kind }) => {
      const current = this.#workspace.activeNote();
      if (current.isSome() && current.value === entry.path) {
        this.active.value = kind === "added" ? { journalName: entry.journalName, anchor: entry.anchor } : null;
      }
    });
  }

  #refresh(path: Option<VaultPath>): void {
    this.active.value = path
      .flatMap((p) => this.#index.entryByPath(p))
      .map((entry) => ({ journalName: entry.journalName, anchor: entry.anchor }))
      .unwrapOr(null);
  }
}
```

Why a service rather than a composable: it's process-global state (one active note) with two upstream subscriptions. Letting every cell instantiate a composable that re-subscribes wastes work and risks ordering. One service, one `ShallowRef`, every cell reads through `useService(ActiveEntryViewModel).active.value` inside a computed.

The `entryChanged` subscription handles the case where the active note's journal entry registers or unregisters after the workspace event already fired (or had never registered because indexing was still pending). Without it, opening a freshly-created journal note can briefly miss the highlight until something else triggers a recompute.

DI: registered in `notesCalendarModule` at default lifetime (Container singleton), eager via `.eager()` so subscriptions attach at plugin start, not lazily on first cell mount.

Tests cover: initial state from current active note, updates on `active-note-changed`, updates on `entryChanged` matching the active path, no-op on `entryChanged` for unrelated paths.

Test fake `FakeActiveEntryViewModel` in `notes-calendar/testing.ts`: a writable `ShallowRef` plus a `setActive(ref | null)` setter. Cell-composable tests inject the fake.

Disposal: `ActiveEntryViewModel` follows the existing eager-singleton disposal pattern (detach the two subscriptions). Implementation reads sibling singletons (`DecorationEngine`, `JournalsIndex` consumers) to match the established pattern.

## 4. Composables

### `use-shelf-scope.ts`

Given a reactive shelf name (or `null` for "all journals"), returns journal names partitioned by write-type.

```ts
export interface ShelfScope {
  readonly all: ComputedRef<readonly string[]>;
  readonly day: ComputedRef<readonly string[]>;
  readonly week: ComputedRef<readonly string[]>;
  readonly month: ComputedRef<readonly string[]>;
  readonly quarter: ComputedRef<readonly string[]>;
  readonly year: ComputedRef<readonly string[]>;
  readonly custom: ComputedRef<readonly string[]>;
}

export function useShelfScope(shelfName: MaybeRefOrGetter<string | null>): ShelfScope;
```

Reads `JournalsViewModel.journals` (reactive — `JournalConfig[]` with `name`, `shelf`, `write.type`), filters by shelf if non-null, partitions by `write.type`. Each of the seven refs is its own `computed` so consumers subscribe to exactly the kind they need.

`day`-typed and `custom`-typed journals are kept distinct (matches v2's split). v2 additionally leaked offset-condition custom journals into the `day` bucket so per-kind decoration lookups would include them; v3's `DecorationEngine` does its own write-type matching internally (see decorations spec §3), so this shelf helper does **not** replicate the leak — that concern is fully owned by the decoration layer now.

### `use-notes-cell.ts`

Per-surface composable: one instance per visible region (e.g. day cells), not per cell. Period is passed at call time, not stored in the composable.

```ts
export interface NotesCellApi {
  open(period: Period, event: MouseEvent): void;
  openContextMenu(period: Period, event: MouseEvent): void;
  openPreview(period: Period, event: MouseEvent): void;
  isActive(period: Period): boolean;
  isActionable(period: Period): boolean;
}

export function useNotesCell(options: { journalNames: MaybeRefOrGetter<readonly string[]> }): NotesCellApi;
```

Internals (sketch):

- `useService(JournalsIndex)`, `useService(WorkspaceService)`, `useService(Flows)`, `useService(TimelineService)`, `useService(ActiveEntryViewModel)`.
- `existingPathsAt(anchor)` — private helper that reads `index.entryByAnchor(name, anchor)` for each name in `journalNames` and returns the list of existing paths. Called only from imperative event handlers (`openContextMenu`, `openPreview`) at click/hover time — no reactivity needed; the helper sees fresh index state on every call.
- `isActionable(period)` — returns `true` iff `timeline.contains(name, period.anchor.toAnchor())` for any name in `journalNames`. Reactive through `journalNames`'s ref and `JournalsViewModel`-backed timeline reads; does not depend on per-anchor note existence (v2 parity: clickable if any in-scope journal owns this anchor, even when no note exists yet).
- `isActive(period)` — `const a = active.value; return a !== null && journalNames.includes(a.journalName) && a.anchor === period.anchor.toAnchor();`. Reactive through `ActiveEntryViewModel.active`.
- `open(period, event)` — early-returns when `!isActionable(period)`. Otherwise invokes `flows.invoke(OpenDateFlow, { anchor: period.anchor.toAnchor(), journalNames: toValue(journalNames), openMode: defineOpenMode(event) })`. Errors logged through the existing logger; no toast — the flow's own pickers already surface user-facing problems.
- `openContextMenu(period, event)` — `event.preventDefault()` happens at the template level. If `existingPathsAt(period.anchor.toAnchor()).length === 1` → `workspace.openFileMenu(path, event)`. If `> 1` → `new Menu()` with one item per path titled with the path, click handler calling `workspace.openFileMenu(path, event)`; `menu.showAtMouseEvent(event)`. If `0` → no-op.
- `openPreview(period, event)` — `if (!event.ctrlKey && !event.metaKey) return;`. Then if `existingPathsAt(...).length === 0` → no-op, else `workspace.triggerHoverPreview(paths[0], event)`. Modifier gating replaces v2's separate `useHoverPreview` watcher with a single conditional on the mouse event.

No `entryChanged` subscription. The reactive surface (`isActive`, `isActionable`) does not depend on per-anchor note existence — that lives in decoration conditions (`has-note`, `all-tasks-completed`) handled by the decoration engine. The cell's note-existence reads are imperative and on-demand, so an index mutation between paints does not require a re-render to be correct at the next click.

### `cell-format.ts`

```ts
export function defaultFormatPattern(kind: PeriodKind): string {
  return match(kind)
    .with("day", () => "D")
    .with("week", () => "[W]ww")
    .with("month", () => "MMM")
    .with("quarter", () => "[Q]Q")
    .with("year", () => "YYYY")
    .with("decade", () => "YYYY")
    .exhaustive();
}
```

Mirrors v2's `calendarFormats` map but as an exhaustive pattern function so `ts-pattern` enforces coverage against `PeriodKind`. Cell SFC takes an optional `format?: string` prop; absent → `defaultFormatPattern(period.kind)`.

## 5. NotesCalendarCell SFC + integration

### Calendar primitives change

The five `Calendar*View` SFCs already expose the `cell` scoped slot inside the `<UiButton>` (decorations spec §5). The only change here: the `select` emit signature becomes `[cell: Period, event: MouseEvent]`, and the click handler forwards `$event`:

```vue
<UiButton ... @click="emit('select', cell.period as DayPeriod, $event)">
  <slot name="cell" :period="cell.period" :label="cell.label">{{ cell.label }}</slot>
</UiButton>
```

This is the only structural change to the calendar primitives in this spec. The slot itself is fine as-is.

`DatePickerModal`'s `onCellSelect` callbacks gain an unused second `_event` arg. No other consumer.

### `ui/NotesCalendarCell.vue`

The cell does **not** render a button — the calendar's `UiButton` already wraps the slot, and nested buttons are invalid HTML. The cell renders the decoration overlay, the label, and an inner span carrying `data-active`/`data-inactive` plus the contextmenu/mouseenter handlers.

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { Period } from "@/calendar";
import { CellDecoration } from "@/decorations";
import { defaultFormatPattern } from "../cell-format";
import type { NotesCellApi } from "../use-notes-cell";

const props = defineProps<{
  period: Period;
  cell: NotesCellApi;
  format?: string;
}>();

const label = computed(() => props.period.format(props.format ?? defaultFormatPattern(props.period.kind)));
const isActive = computed(() => props.cell.isActive(props.period));
const isInactive = computed(() => !props.cell.isActionable(props.period));
</script>

<template>
  <span
    class="notes-calendar-cell"
    :data-active="isActive || null"
    :data-inactive="isInactive || null"
    @contextmenu.prevent="cell.openContextMenu(period, $event)"
    @mouseenter="cell.openPreview(period, $event)"
  >
    <CellDecoration :period>{{ label }}</CellDecoration>
  </span>
</template>
```

Inline props per `feedback_inline_vue_props`. Active-note highlight styles target `.notes-calendar-cell[data-active]` — visually identical to applying the attribute on the button, no coupling to the calendar primitive's internals. `data-inactive` dims a cell whose anchor lies outside every in-scope journal's timeline (calendar's own `bounds`-driven `disabled` state is a separate concern; the cell additionally communicates the "no journal covers this anchor" state).

The contextmenu and mouseenter bubble from the inner span; the calendar's outer button has no contextmenu handler so `.prevent` on the span suppresses the browser menu cleanly. `mouseenter` does not bubble, but it fires when the cursor enters the span (which fills the button content), so behavior is equivalent to attaching the handler on the button.

### Consumer shape

```vue
<script setup lang="ts">
const scope = useShelfScope(shelfNameRef);
const cellDay = useNotesCell({ journalNames: scope.day });
</script>

<template>
  <CalendarMonthView :outer-period :selected :bounds @select="cellDay.open">
    <template #cell="{ period }">
      <NotesCalendarCell :period :cell="cellDay" />
    </template>
  </CalendarMonthView>
</template>
```

One `useNotesCell` per visible region. A surface that also wants quarter-header cells creates a second `useNotesCell({ journalNames: scope.quarter })`. Different surfaces (code block, future leaf) compose the same way — the cell layer has no knowledge of the surrounding chrome.

### `notesCalendarModule`

Zero-arg module per `feedback_di_module_factories`:

```ts
export const notesCalendarModule: Module = {
  register(c) {
    c.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel).eager();
  },
};
```

`main.ts` adds `container.addModule(notesCalendarModule)` after `decorationsModule`. `.eager()` makes `container.autoLoad()` instantiate the view model so its subscriptions attach at boot.

## 6. Testing

Conventions enforced by repo memories: colocated `*.test.ts`, nested `describe()`, one behavior per test, black-box assertions, `@testing-library/vue` for components.

### What gets tested

| File                                    | Surface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active-entry.test.ts`                  | Initial state from current `activeNote`; updates on `active-note-changed`; updates on `entryChanged` matching active path; no-op on unrelated `entryChanged`.                                                                                                                                                                                                                                                                                                                            |
| `use-shelf-scope.test.ts`               | Returns full set when shelf is `null`; filters by shelf when set; partitions correctly by `write.type` (day vs week vs custom etc.); reactivity on `JournalsViewModel` mutation.                                                                                                                                                                                                                                                                                                         |
| `use-notes-cell.test.ts`                | `open` invokes `OpenDateFlow` with the right anchor + names + `openMode`; `open` early-returns when not actionable; `openContextMenu` 0/1/N-path branches (1 → `openFileMenu` direct; N → `Menu.showAtMouseEvent` with one item per path); `openPreview` cmd/ctrl gating; `openPreview` invokes `triggerHoverPreview` of the first existing path; `isActive` matches `ActiveEntryViewModel`; `isActive` reactivity tracks `active` mutations; `isActionable` reflects timeline coverage. |
| `cell-format.test.ts`                   | One assertion per `PeriodKind` returning the expected pattern.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `NotesCalendarCell.test.ts`             | Slot content equals formatted label; `data-active` reflects `isActive(period)`; `data-inactive` reflects `!isActionable(period)`; contextmenu handler routes to `cell.openContextMenu(period, event)` with `preventDefault` applied; mouseenter routes to `cell.openPreview(period, event)`.                                                                                                                                                                                             |
| `workspace-service.test.ts` (additions) | `triggerHoverPreview` invokes `app.workspace.trigger("link-hover", ...)` with correct args; `openFileMenu` invokes `trigger("file-menu", ...)` and `Menu#showAtMouseEvent`; `openFileMenu` no-ops on missing file.                                                                                                                                                                                                                                                                       |

### What is not tested

- `notesCalendarModule` — DI wiring (per `feedback_no_wiring_tests`).
- `FakeActiveEntryViewModel`, cell builders, `NotesCellApi` stub in `testing.ts` (per `feedback_no_mock_fake_tests`).
- The `select`-emit signature change on calendar views — existing view tests and `DatePickerModal` tests stay green; that's the signal.
- `defineOpenMode` location/landing — tested directly in `infrastructure/host` once it lands; this spec consumes it.

### Test infrastructure

- `notes-calendar/testing.ts` — `FakeActiveEntryViewModel`, an in-memory `NotesCellApi` stub builder, and convenience cell constructors.
- `infrastructure/host/testing.ts` — gains spies for `triggerHoverPreview`, `openFileMenu` on `FakeWorkspaceService`.
- No top-level `mocks/` or `fixtures/`, no test-local stubs (per `feedback_testing_dir_layout`).
- Composable tests use a minimal host-component pattern, not a wrapper around `mount` (per `feedback_no_vitest_wrappers`).

## 7. Out of scope, follow-ups, risks

### Out of scope

- **Obsidian leaf / "Notes Calendar" view.** The whole leaf is its own future spec; this only ships the cell-level layer.
- **Header components** (shelf picker, navigation, today / pick-date buttons) — leaf concerns.
- **`CalendarViewCustomIntervals` region** — blocked on v3 navigation code-block infrastructure; its own spec.
- **v3 calendar-view settings slice.** No `weeks` / `leaf` / `todayMode` / `pickMode` / `todayStyle` / `activeStyle` schema yet — landed when the leaf lands.
- **User-customizable today/active colors.** Active highlight ships with theme-default CSS in this spec.
- **Code-block consumer.** v3 has no code-block infrastructure; the cell's flexibility-for-code-blocks claim is exercised when navigation code-blocks land.

### Natural follow-up specs (dependency order)

1. **Navigation code-block** — first non-leaf consumer of `NotesCalendarCell`, validates the code-block flexibility claim.
2. **v3 calendar-view leaf reshape** — second consumer; also adds the calendar-view settings slice (`todayMode`, `pickMode`, `weeks`, color styles).
3. **EditDecoration management UI** — separate dependency line; doesn't block the leaf.

### Risks

- **Slot-event signature change.** `select: [Period]` → `select: [Period, MouseEvent]` is breaking for any future single-arg destructuring consumer. Currently only `DatePickerModal`; document the new signature in the calendar primitives' barrel so future consumers see it.
- **No reactive note-existence on cells.** If a future consumer wants to render "this cell has a note" purely from `useNotesCell` (rather than via a decoration `has-note` condition), the composable will need a reactive `hasNote(period)` API and the `entryChanged` subscription that backs it. Today's API consciously omits both — decoration conditions already cover the visual signal, and the action handlers read note existence imperatively at event time.
- **`ActiveEntryViewModel` subscription teardown.** The view model holds two upstream subscriptions; must follow the existing eager-singleton disposal pattern so `container.dispose()` cleans them up. Implementation reads sibling singletons (`DecorationEngine`, `JournalsIndex` consumers) to match.
- **`openFileMenu` Menu lifecycle.** v2 created `new Menu()` per right-click without explicit teardown — Obsidian's Menu handles its own dismissal. v3 mirrors that.

### Definition of done

- `npm run test`, `npm run check:types`, `npm run check:lint` all clean.
- `DatePickerModal` and existing `Calendar*View` tests green after the `select`-emit signature change.
- New `notes-calendar` tests cover `ActiveEntryViewModel`, `useShelfScope`, `useNotesCell`, `cell-format`, `NotesCalendarCell` per §6.
- `WorkspaceService` tests cover the two new methods.
- Decoration engine continues to render through `CellDecoration` inside `NotesCalendarCell` without modification to the decorations feature.
