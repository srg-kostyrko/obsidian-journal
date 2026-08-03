# Decoration Inspector — Cell Reach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach the decoration breakdown modal by right-clicking any decorated cell — the calendar grid, the navigation block, the toolbar period buttons, and custom-interval rows.

**Architecture:** All four decorated surfaces already have a `@contextmenu` handler with a `Period` in hand, and all four funnel into `workspace.openPathsMenu(paths, event)`. The item is added at that one seam. `WorkspaceService` lives in `infrastructure/host` and must not learn about decorations, so it takes opaque items — a title, an icon and a callback — and each call site supplies the decorations one.

**Tech Stack:** TypeScript, Vue 3 SFCs, ts-pattern, Vitest, `@testing-library/vue`, WebdriverIO (wdio) for e2e.

Design doc: `docs/superpowers/specs/2026-08-03-decoration-inspector-design.md` §Reach
**This is plan 2 of 3.** Plan 1 (the engine capability, the breakdown modal, and its settings entry point) is complete. Plan 3 adds the per-decoration match badges and does not depend on this one.

## Two corrections to the design, found by reading the code

The design says the item's visibility check works because "the style map is already injected there — `CellDecoration` performs the same lookup." **That is true for `CellDecoration` and false for two of the three call sites**, because of how Vue scopes `provide`/`inject`.

`inject()` resolves from the _parent_ chain. A component's own `provide()` is **not** visible to its own `inject()` in the same setup. And:

| Call site                                                                                                                                          | Provides the map? | How it must get the map                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------- |
| `useNotesCell` — called in `NotesMonthView.vue:35-39` / `NotesWeekView.vue:30-34`, which also call `useCellDecorations` at `NotesMonthView.vue:88` | **yes**           | passed in — `useCellDecorations` returns the map    |
| `PeriodButtonsItem.vue` — calls `useCellDecorations` at `:66` and handles its own contextmenu at `:94`                                             | **yes**           | the value `useCellDecorations` returns              |
| `NavBlockRow.vue` — a descendant of `NavigationCodeBlock.vue`, which provides                                                                      | no                | `inject`, using its existing `decorationScope` prop |

So the composable takes the map as an argument rather than injecting it. `useCellDecorations` already ends with `return cells;`, so providers have it in hand. Only `NavBlockRow` injects, and it does so itself.

Had this been built as the design describes, the item would silently never appear on the calendar grid or the toolbar buttons — the two most visible surfaces — while unit tests that mount cells as children would pass.

## Global Constraints

- Commands are **npm**, not pnpm: `npm run test`, `npm run check:types`, `npm run check:lint`. Single file: `npm run test -- <path>`. e2e: `npm run test:e2e`.
- **Run every gate in the foreground.** A prior plan's implementer backgrounded `check:lint`, exceeded its timeout, and stalled three times without reporting. Do not background any command.
- Commit to the current branch (`v3-ai`). Never create a new branch. No `Co-Authored-By` trailer.
- Never use `eslint-disable`. **No new lint warnings** — baseline is 15 warnings, 0 errors.
- Discriminated-union dispatch uses `ts-pattern` `match().with().exhaustive()`, never `switch`.
- Tests colocate beside their subject. One behavior per test; names describe behavior (subject + verb); no "and"/comma-list names; nested `describe()` for scope.
- Assert observable outcomes. This plan's predecessor had three separate tests that passed under an inverted implementation — before you finish a test, ask what change would make it fail, and if the answer is "none", rewrite it.
- Vue component tests use `@testing-library/vue` + `user-event`. No `@vue/test-utils`, no CSS-class queries, no test-only `data-*` attributes.
- Components reach DI through `useService`/`useModalService`, never `useApp`/`usePlugin`.
- Authored icons reference `src/ui/icons.ts` (grouped `icons.*`), never bare literals. `icons.action.search` already exists.
- New i18n strings go in `messages/en.json` then `npm run compile:i18n`. **Never** stage or edit `src/i18n/paraglide` — generated and git-ignored. Do not run prettier over `messages/en.json`.
- Copy: sentence case, en-US, no concatenated UI strings.
- No spec-reference comments. Comments explain WHY, never WHAT.
- `no-non-null-assertion` is ON in production code, OFF in test files.

---

### Task 1: The host accepts opaque extra menu items

**Files:**

- Modify: `src/infrastructure/host/types.ts` (add `MenuItemSpec`)
- Modify: `src/infrastructure/host/internal/workspace-service.ts:146-175`
- Modify: `src/infrastructure/host/testing.ts:264-270` (the fake)
- Modify: `src/infrastructure/host/internal/workspace-service.test.ts`
- Modify: `src/infrastructure/host/index.ts:72` — the barrel already re-exports from `./types`; add `type MenuItemSpec` to that list
- Modify: `src/notes-calendar/use-notes-cell.test.ts:182` — an existing whole-object assertion on `pathsMenuCalls` breaks (see Step 5)

**Interfaces:**

- Produces:
  - `interface MenuItemSpec { readonly title: string; readonly icon: string; readonly onClick: () => void }`
  - `openPathsMenu(paths: readonly VaultPath[], event: MouseEvent, extraItems?: readonly MenuItemSpec[]): void`
  - `openFileMenu(path: VaultPath, event: MouseEvent, into?: Menu): void` — when `into` is supplied it populates that menu and does **not** show it; the caller shows it.

#### The three behaviours that change

The current code is:

```ts
openPathsMenu(paths: readonly VaultPath[], event: MouseEvent): void {
  const [first] = paths;
  if (first === undefined) return;
  if (paths.length === 1) {
    this.openFileMenu(first, event);
    return;
  }
  const menu = new Menu();
  for (const path of paths) {
    menu.addItem((item) => item.setTitle(path).onClick(() => this.openFileMenu(path, event)));
  }
  menu.showAtMouseEvent(event);
}
```

1. `if (first === undefined) return;` must become "bail only when there are also no extra items". Otherwise the item is missing on exactly the note-less cells that vault-wide and shelf rules decorate — every `date` and `weekday` condition paints regardless of notes, and those are the only two conditions those scopes have.
2. The single-path case delegates wholesale to `openFileMenu`, which builds its own `Menu`. It must instead be able to populate a menu we already created and prepended our items into. Replacing Obsidian's file menu with our own would lose Obsidian's file actions.
3. The multi-path case already builds our own `Menu` and simply gets the items prepended.

- [ ] **Step 1: Write the failing tests**

Add to `src/infrastructure/host/internal/workspace-service.test.ts`, reusing the harness already in that file (read it first — it has existing `openPathsMenu`/`openFileMenu` tests and an Obsidian `Menu` testing double):

```ts
it("shows a menu of only the extra items when there are no paths", () => {
  // openPathsMenu([], event, [oneItem]) — assert a menu was shown carrying that item's title.
});

it("shows no menu when there are neither paths nor extra items", () => {
  // openPathsMenu([], event, []) — assert no menu was shown. This is today's behaviour and
  // must survive, so an undecorated note-less cell stays menu-less.
});

it("keeps Obsidian's file entries alongside an extra item for a single path", () => {
  // openPathsMenu([path], event, [oneItem]) — assert the shown menu carries the extra item's
  // title AND that the file-menu workspace event fired for that path.
});

it("prepends extra items before the path entries for several paths", () => {
  // openPathsMenu([a, b], event, [oneItem]) — assert the extra item's title precedes both
  // path titles in the shown menu.
});

it("invokes an extra item's callback when it is chosen", () => {
  // Assert onClick runs. Without this, an item could render and do nothing.
});
```

Replace each comment with a real body using the file's existing Obsidian doubles. Do not build a second harness.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/infrastructure/host/internal/workspace-service.test.ts`

Expected: FAIL — `openPathsMenu` takes two parameters, so the extra-item arguments are rejected or ignored.

- [ ] **Step 3: Add the type**

In `src/infrastructure/host/types.ts`:

```ts
// A menu entry a feature contributes to a host-built context menu. The host stays ignorant of
// what the entry means — features own the title, the icon and what clicking it does.
export interface MenuItemSpec {
  readonly title: string;
  readonly icon: string;
  readonly onClick: () => void;
}
```

- [ ] **Step 4: Rework the two methods**

In `src/infrastructure/host/internal/workspace-service.ts`, replace `openFileMenu` and `openPathsMenu` with:

```ts
  openFileMenu(path: VaultPath, event: MouseEvent, into?: Menu): void {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const menu = into ?? new Menu();
    this.#app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", null);
    // The file-menu event does not guarantee a Delete entry; append one like v2 did.
    menu.addItem((item) =>
      item
        .setTitle(m.common_action_delete())
        .setIcon(icons.action.delete)
        .onClick(() => {
          (this.#app.fileManager as DeletePromptingFileManager).promptForFileDeletion?.(file);
        }),
    );
    // A menu we were handed belongs to the caller, who decides when to show it.
    if (!into) menu.showAtMouseEvent(event);
  }

  openPathsMenu(paths: readonly VaultPath[], event: MouseEvent, extraItems: readonly MenuItemSpec[] = []): void {
    const [first] = paths;
    if (first === undefined && extraItems.length === 0) return;

    const menu = new Menu();
    for (const spec of extraItems) {
      menu.addItem((item) => item.setTitle(spec.title).setIcon(spec.icon).onClick(spec.onClick));
    }

    if (first !== undefined) {
      if (paths.length === 1) {
        this.openFileMenu(first, event, menu);
      } else {
        for (const path of paths) {
          menu.addItem((item) => item.setTitle(path).onClick(() => this.openFileMenu(path, event)));
        }
      }
    }

    menu.showAtMouseEvent(event);
  }
```

Import `MenuItemSpec` from `../types`.

☝️ Note the behaviour change this makes for the single-path case: previously `openFileMenu` created and showed its own menu; now `openPathsMenu` always creates and shows one. The rendered result is the same menu with the same entries — but if `getAbstractFileByPath` returns something that is not a `TFile`, `openFileMenu` returns early and `openPathsMenu` now shows an empty (or extras-only) menu where it previously showed none. Keep that in mind when writing the "no menu" test: it asserts the no-paths-no-extras case, which is unaffected.

- [ ] **Step 5: Update the fake**

In `src/infrastructure/host/testing.ts`, widen both recorders so tests can assert what was contributed:

```ts
  readonly fileMenuCalls: { path: VaultPath; event: MouseEvent }[] = [];
  readonly pathsMenuCalls: { paths: readonly VaultPath[]; event: MouseEvent; extraItems: readonly MenuItemSpec[] }[] =
    [];
```

```ts
  openPathsMenu(paths: readonly VaultPath[], event: MouseEvent, extraItems: readonly MenuItemSpec[] = []): void {
    this.pathsMenuCalls.push({ paths, event, extraItems });
  }
```

`openFileMenu`'s fake keeps its signature — the third parameter is optional and the fake records nothing about it.

☝️ **This breaks an existing assertion.** `src/notes-calendar/use-notes-cell.test.ts:182` reads `expect(workspace.pathsMenuCalls).toEqual([{ paths: [], event }])`, and `toEqual` on the whole recorded object will now see the added `extraItems` key. Update it to `[{ paths: [], event, extraItems: [] }]`. Search the repo for other whole-object assertions on `pathsMenuCalls` and fix them the same way — do not weaken any of them to `objectContaining` to dodge the break.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- src/infrastructure/host/internal/workspace-service.test.ts`

Expected: PASS.

- [ ] **Step 7: Run the full gates**

Run each in the foreground: `npm run test`, then `npm run check:types`, then `npm run check:lint`.

Expected: all PASS, lint still 15 warnings / 0 errors. Existing callers pass two arguments and keep working because `extraItems` defaults to `[]`.

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/host
git commit -m "feat(host): let callers contribute items to a paths context menu"
```

---

### Task 2: The decorations menu item

**Files:**

- Create: `src/decorations/ui/use-decoration-menu-item.ts`
- Create: `src/decorations/ui/use-decoration-menu-item.test.ts`
- Modify: `messages/en.json`
- Modify: `src/decorations/index.ts`

**Interfaces:**

- Consumes: `MenuItemSpec` from `@/infrastructure/host`; `CellStyleRef` from `./cell-decoration-map-key`; `cellKey` from `../engine`; `decorationBreakdownModal` from `./modals`; `useModalService`.
- Produces:
  - `function useDecorationMenuItems(cells: ReadonlyMap<string, CellStyleRef> | null): (period: Period) => readonly MenuItemSpec[]`

Returns an empty array when the cell has no contributions, so a surface with nothing decorated contributes nothing and its menu behaves exactly as it does today.

- [ ] **Step 1: Add the copy**

Add to `messages/en.json`:

```json
"decoration_explain_menu_item": "Explain decorations"
```

Run `npm run compile:i18n`. Stage nothing under `src/i18n/paraglide`.

This is a new string, not a reuse of `decoration_breakdown_open` ("Inspect a date") — that label is right for a settings button offering a date picker, and wrong for a menu on a cell whose date is already chosen.

- [ ] **Step 2: Write the failing test**

Create `src/decorations/ui/use-decoration-menu-item.test.ts`. The composable calls `useModalService`, so it must run inside a component; follow the pattern `src/decorations/use-cell-decorations.test.ts` uses to mount a host component around a composable, and register a `FakeModalService` the way `DecorationsSection.test.ts` does.

Cover, one `it` each:

```ts
// describe("useDecorationMenuItems")
//   it("contributes no item for a cell with no decorations")
//   it("contributes no item when no cell map was provided")
//   it("contributes an item for a cell carrying at least one style")
//   it("opens the breakdown modal for the clicked cell's period")
```

The fourth is the one that matters: assert the modal was opened **with that period**, not merely that it was opened. An assertion that only checks "a modal opened" would pass if the period were dropped or wrong.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/decorations/ui/use-decoration-menu-item.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 4: Write the composable**

Create `src/decorations/ui/use-decoration-menu-item.ts`:

```ts
import type { Period } from "@/calendar";
import { m } from "@/i18n";
import { useModalService } from "@/infrastructure/host/modals";
import { icons } from "@/ui/icons";

import { cellKey } from "../engine";

import { decorationBreakdownModal } from "./modals";

import type { CellStyleRef } from "./cell-decoration-map-key";
import type { MenuItemSpec } from "@/infrastructure/host";

// Contributing nothing for an undecorated cell is what keeps a plain empty cell menu-less:
// the host only builds a menu when there are paths or contributed items.
export function useDecorationMenuItems(
  cells: ReadonlyMap<string, CellStyleRef> | null,
): (period: Period) => readonly MenuItemSpec[] {
  const modals = useModalService();

  return (period: Period): readonly MenuItemSpec[] => {
    const styles = cells?.get(cellKey(period.kind, period.anchor.toAnchor()))?.value ?? [];
    if (styles.length === 0) return [];
    return [
      {
        title: m.decoration_explain_menu_item(),
        icon: icons.action.search,
        onClick: () => {
          void modals.open(decorationBreakdownModal, { period });
        },
      },
    ];
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/decorations/ui/use-decoration-menu-item.test.ts`

Expected: PASS — 4 tests.

- [ ] **Step 6: Export and run the gates**

Add to `src/decorations/index.ts`: `export { useDecorationMenuItems } from "./ui/use-decoration-menu-item";`

Run each in the foreground: `npm run test`, `npm run check:types`, `npm run check:lint`.

- [ ] **Step 7: Commit**

```bash
git add src/decorations messages/en.json
git commit -m "feat(decorations): contribute an explain item for a decorated cell"
```

---

### Task 3: Wire the three call sites

**Files:**

- Modify: `src/notes-calendar/use-notes-cell.ts`
- Modify: `src/notes-calendar/ui/NotesMonthView.vue`
- Modify: `src/notes-calendar/ui/NotesWeekView.vue`
- Modify: `src/code-blocks/nav/ui/NavBlockRow.vue`
- Modify: `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue`
- Modify: `src/notes-calendar/use-notes-cell.test.ts`
- Modify: `src/code-blocks/nav/ui/NavBlockRow.test.ts` (if it exists; otherwise add coverage to the nearest existing nav test)

**Interfaces:**

- Consumes: `useDecorationMenuItems` from Task 2, `openPathsMenu`'s third parameter from Task 1.
- Produces: `useNotesCell` gains an optional `decorations` option carrying the cell map.

#### Read the "Two corrections to the design" section at the top of this plan before starting

It explains why each call site obtains the map differently. Getting this wrong makes the item silently never appear on the calendar grid.

- [ ] **Step 1: Write the failing tests**

In `src/notes-calendar/use-notes-cell.test.ts`, add:

```ts
it("contributes the explain item to the context menu of a decorated cell", () => {
  // Build useNotesCell with a decorations map containing styles for the period under test.
  // Call openContextMenu and assert the FakeWorkspaceService's pathsMenuCalls carries a
  // non-empty extraItems.
});

it("contributes no item to the context menu of an undecorated cell", () => {
  // Same, with an empty map — assert extraItems is empty.
});
```

Read the file first; it already builds a `FakeWorkspaceService` and asserts on `pathsMenuCalls`.

For `NavBlockRow` and `PeriodButtonsItem`, add one behaviour test each in whatever test file already covers their context-menu handler. If neither has one, add the coverage to `use-notes-cell.test.ts` only and note the gap in your report rather than inventing new test files.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/notes-calendar/use-notes-cell.test.ts`

Expected: FAIL — `extraItems` is empty because nothing contributes it yet.

- [ ] **Step 3: Wire `useNotesCell`**

Add an optional option and use it:

```ts
export function useNotesCell(options: {
  journalNames: MaybeRefOrGetter<readonly string[]>;
  // Passed in rather than injected: the views that call this also call useCellDecorations,
  // and a component's own provide() is invisible to its own inject().
  decorations?: ReadonlyMap<string, CellStyleRef> | null;
}): NotesCellApi {
```

and change `openContextMenu`:

```ts
const decorationItems = useDecorationMenuItems(options.decorations ?? null);

const openContextMenu = (period: Period, event: MouseEvent): void => {
  workspace.openPathsMenu(existingPathsAt(period), event, decorationItems(period));
};
```

- [ ] **Step 4: Wire the two calendar views**

In `NotesMonthView.vue` and `NotesWeekView.vue`, `useCellDecorations` is currently called _after_ the five `useNotesCell` calls. Move its call above them, capture its return value, and pass it to each:

```ts
const cells = useCellDecorations({/* unchanged arguments */});

const dayCell = useNotesCell({ journalNames: () => scope.day.value, decorations: cells });
// …the same for weekCell, monthCell, quarterCell, yearCell
```

Moving the call changes nothing about what it provides or when — `useCellDecorations` sets up a `watchEffect` and a `provide`, neither of which depends on the five `useNotesCell` calls.

- [ ] **Step 5: Wire `NavBlockRow`**

`NavBlockRow` is a descendant of the component that provides, so here `inject` is correct. Add:

```ts
const decorationCells = inject(props.decorationScope?.map ?? CellDecorationMapKey, null);
const decorationItems = useDecorationMenuItems(decorationCells);
```

and change the handler:

```ts
function onContextMenu(event: MouseEvent): void {
  if (props.preventNavigation) return;
  workspace.openPathsMenu(pathsForTarget(target.value), event, decorationItems(props.period));
}
```

The `preventNavigation` early return stays, so the settings-side nav block preview keeps opening nothing.

- [ ] **Step 6: Wire `PeriodButtonsItem`**

This component calls `useCellDecorations` itself at `:66`, so capture its return value rather than injecting:

```ts
const cells = useCellDecorations({/* unchanged arguments */});
const decorationItems = useDecorationMenuItems(cells);
```

```ts
function openContextMenu(badge: Badge, event: MouseEvent): void {
  workspace.openPathsMenu(pathsFor(badge), event, decorationItems(badge.period));
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test -- src/notes-calendar/use-notes-cell.test.ts`

Expected: PASS.

- [ ] **Step 8: Prove the map actually reaches the calendar views**

The design's inject-based approach would have failed silently here, so verify the wiring rather than trusting it. Temporarily change `NotesMonthView.vue` to pass `decorations: null` to `dayCell`, run the calendar view's own component tests plus `use-notes-cell.test.ts`, and confirm something fails. Restore. If nothing fails, the coverage does not reach the views and you must add a test that does — report which.

- [ ] **Step 9: Run the full gates**

Run each in the foreground: `npm run test`, `npm run check:types`, `npm run check:lint`.

- [ ] **Step 10: Commit**

```bash
git add src/notes-calendar src/code-blocks/nav src/views/toolbar-items
git commit -m "feat(decorations): reach the breakdown modal from decorated cells"
```

---

### Task 4: End-to-end coverage

`e2e/journeys/decorations.ts` asserts each style type rendering in isolation and nothing about menus. This seam manipulates Obsidian's real `Menu` and the `file-menu` workspace event, and `__mocks__/obsidian.ts` is our own stand-in — a passing unit test there proves nothing about the real menu.

**Files:**

- Modify: `e2e/journeys/decorations.ts` (a helper for right-clicking a cell and reading menu titles)
- Modify: `e2e/journeys/view.e2e.ts` (the journeys)

**Interfaces:**

- Consumes: `DECO_DAY`, `dayAnchor`, `calendar` — all already exported.

#### The fixture already has exactly the cells needed

In `e2e/fixtures/e2e-journeys`:

| Cell                   | State                                            | Journey                 |
| ---------------------- | ------------------------------------------------ | ----------------------- |
| `DECO_DAY.global` (3)  | vault-wide `date` decoration, **no seeded note** | decorated + note-less   |
| `DECO_DAY.title` (7)   | journal decoration + a seeded note               | decorated + has note    |
| `DECO_DAY.control` (2) | neither                                          | undecorated + note-less |

No fixture changes are needed.

- [ ] **Step 1: Add the right-click helper**

Add to `e2e/journeys/decorations.ts`, following the dispatch pattern already proven in `e2e/journeys/code-blocks.e2e.ts:161-173`:

```ts
// Obsidian's Menu exposes no ARIA roles, so .menu-item-title is the only stable handle on
// chrome we do not own. Dispatching the event directly avoids WDIO's own right-click, which
// also triggers Obsidian's editor context menu.
export async function rightClickCell(anchor: string): Promise<void> {
  const selector = `[data-anchor="${anchor}"]`;
  await browser.execute((sel: string) => {
    document.querySelector(sel)?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  }, selector);
}

export function menuItemTitles(): Promise<string[]> {
  return browser.execute(() => [...document.querySelectorAll(".menu-item-title")].map((el) => el.textContent ?? ""));
}

export async function closeAnyMenu(): Promise<void> {
  await browser.execute(() => {
    for (const menu of document.querySelectorAll(".menu")) menu.remove();
  });
}
```

`[data-anchor="…"]` is the right handle: `NotesCalendarCell.vue:41` binds `:data-anchor="rawPeriod.anchor.toAnchor()"` on every cell it renders, day cells included.

- [ ] **Step 2: Write the failing journeys**

Add to `view.e2e.ts`, inside the existing `describe("decorations")` block:

```ts
it("offers the explain item on a decorated day cell with no note", async () => {
  await rightClickCell(dayAnchor(DECO_DAY.global));
  await browser.waitUntil(async () => (await menuItemTitles()).includes(m_decoration_explain_menu_item), {
    timeoutMsg: "no menu with the explain item on the decorated note-less cell",
  });
  await closeAnyMenu();
});

it("keeps Obsidian's file entries beside the explain item on a decorated cell with a note", async () => {
  await rightClickCell(dayAnchor(DECO_DAY.title));
  await browser.waitUntil(
    async () => {
      const titles = await menuItemTitles();
      return titles.includes(m_decoration_explain_menu_item) && titles.length > 1;
    },
    { timeoutMsg: "expected both the explain item and Obsidian's file entries" },
  );
  await closeAnyMenu();
});

it("opens no menu on an undecorated cell with no note", async () => {
  await rightClickCell(dayAnchor(DECO_DAY.control));
  await browser.pause(300);
  expect(await menuItemTitles()).toEqual([]);
  await closeAnyMenu();
});
```

The literal title string: e2e specs do not import from `src/`, so inline the exact English text `"Explain decorations"` as a constant in `decorations.ts` beside `STYLE_HEX`, with a comment saying it must match `decoration_explain_menu_item` in `messages/en.json`. Follow whatever convention that file already uses for user-visible strings — check before inventing one.

The first journey is the one that cannot pass against current code: that cell has **no menu at all** today.

- [ ] **Step 3: Run the journeys**

Run: `npm run test:e2e`

Expected: PASS. The nav-template integration failure (10 of 11) is a known pre-existing baseline, unrelated.

If a menu bleeds into a following test, the `closeAnyMenu()` calls are missing or mistimed — fix that rather than reordering tests.

- [ ] **Step 4: Prove the first journey diverges**

Temporarily change `useDecorationMenuItems` to always return `[]`, run `npm run test:e2e -- --spec e2e/journeys/view.e2e.ts`, and confirm the first two journeys fail while the third still passes. Restore. Record the output in your report — a journey that passes with the feature disabled is worth nothing, and this plan's predecessor caught three such tests.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test(e2e): cover the explain item on decorated cell context menus"
```

---

## Self-Review

**Design coverage**

| Design §Reach requirement                                                     | Task                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| Item added at the one shared `openPathsMenu` seam                             | Task 1                                           |
| Host takes generic items, learns nothing about decorations                    | Task 1, Steps 3-4                                |
| Bail only when there are neither paths nor extra items                        | Task 1, Step 4                                   |
| `openFileMenu` can populate a handed-in menu; Obsidian's file actions survive | Task 1, Step 4                                   |
| Multi-path case gets items prepended                                          | Task 1, Step 4                                   |
| Item appears only when the cell has at least one contribution                 | Task 2, Step 4                                   |
| The check is identical across call sites                                      | Task 2 — one composable, three callers           |
| Scope-aware, so the nav block's two grids consult their own map               | Task 3, Step 5                                   |
| `NavBlockRow` keeps its `preventNavigation` early return                      | Task 3, Step 5                                   |
| Custom intervals need no work of their own                                    | No task — they render `NavBlock` → `NavBlockRow` |
| e2e: decorated note-less cell gains a menu                                    | Task 4                                           |
| e2e: decorated cell with a note keeps Obsidian's entries                      | Task 4                                           |
| e2e: undecorated note-less cell still has no menu                             | Task 4                                           |

**Deviation from the design, deliberate and explained above:** the design says the composable injects the cell map. Two of the three call sites _provide_ that map in the same setup, and Vue's `inject` cannot see a component's own `provide`, so the composable takes the map as an argument instead. `useCellDecorations` already returns it.

**Placeholder scan:** Tasks 1, 2 and 3 carry comment-outlined test bodies, each naming the existing file whose harness must be reused. That is deliberate — this repo forbids duplicating test infrastructure, and three of the four files already have working harnesses. Every production-code step carries literal code.

**Type consistency:** `MenuItemSpec`, `useDecorationMenuItems`, `CellStyleRef`, `CellDecorationMapKey`, `cellKey`, `decorationBreakdownModal` are spelled identically at definition and use. `openPathsMenu`'s third parameter is `readonly MenuItemSpec[]` in the service, the fake and every caller. `icons.action.search` was added by Plan 1 Task 5 and is reused, not redefined.
