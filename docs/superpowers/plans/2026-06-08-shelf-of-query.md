# Shelf-Of Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize the duplicated "which shelf holds this journal" query as `ShelvesService.shelfOf(journalName)`, and route the two callers through it.

**Architecture:** `ShelvesService` already owns membership mutations; add the matching query `shelfOf(name): string` (`""` = no shelf). `PlaceJournalFlow` uses it for `currentShelf` (keeps `ShelvesRepository` only for enumerating shelf names for the modal); `JournalShelfSection.vue` swaps its `ShelvesViewModel`-based `find` for `useService(ShelvesService).shelfOf(...)` inside a `computed` (reactive — the repo reads the reactive settings record). See `CONTEXT.md` → _Shelves_.

**Why:** `find(s => s.journals.includes(name))?.name ?? ""` — plus the at-most-one-shelf invariant and the `""`-means-none convention — was hand-rolled in `PlaceJournalFlow` (via the repo) and `JournalShelfSection` (via the VM). One named query removes the duplication and stops the component reaching into `shelf.journals`.

**Tech Stack:** TypeScript, Vitest, Vue 3, the in-house DI `Container`. Quality gate every task: `npm run test`, `npm run check:types`, `npm run check:lint`.

---

## File structure

| File                                      | Responsibility        | Change                                          |
| ----------------------------------------- | --------------------- | ----------------------------------------------- |
| `src/shelves/service.ts`                  | shelf membership      | add `shelfOf(journalName): string`              |
| `src/shelves/service.test.ts`             | service tests         | add `shelfOf` cases                             |
| `src/shelves/flows/place-journal.flow.ts` | place-journal flow    | use `service.shelfOf` for `currentShelf`        |
| `src/shelves/ui/JournalShelfSection.vue`  | per-journal shelf row | read current shelf via `ShelvesService.shelfOf` |

---

## Task 1: Add `ShelvesService.shelfOf` (test-first)

**Files:**

- Modify: `src/shelves/service.ts`
- Modify: `src/shelves/service.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/shelves/service.test.ts`, add a new `describe` block inside `describe("ShelvesService", …)` (e.g. after the `assign` block):

```ts
describe("shelfOf", () => {
  it("returns the name of the shelf containing the journal", () => {
    const { service } = setup({
      journals: { daily: journalConfig("daily") },
      shelves: { Personal: shelf("Personal", ["daily"]) },
    });
    expect(service.shelfOf("daily")).toBe("Personal");
  });

  it("returns an empty string when the journal is on no shelf", () => {
    const { service } = setup({
      journals: { daily: journalConfig("daily") },
      shelves: { Personal: shelf("Personal") },
    });
    expect(service.shelfOf("daily")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/shelves/service.test.ts`
Expected: FAIL — `service.shelfOf` is not a function.

- [ ] **Step 3: Implement the method**

In `src/shelves/service.ts`, add the method to `ShelvesService` (e.g. directly after `assign`):

```ts
  shelfOf(journalName: string): string {
    for (const shelf of this.#shelves.find().list()) {
      if (shelf.journals.includes(journalName)) return shelf.name;
    }
    return "";
  }
```

> Returns `string` (not `Option`) because `""`-means-none is the established convention at both call sites and in `placeJournalModal`'s `currentShelf` input; `""` is a safe sentinel since `ShelvesRepository.create` rejects empty names. The at-most-one-shelf invariant (`assign` removes-from-all-first) means the first match is the only match.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/shelves/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/shelves/service.ts src/shelves/service.test.ts
git commit -m "feat(shelves): add ShelvesService.shelfOf membership query"
```

---

## Task 2: Route the two callers through `shelfOf`

**Files:**

- Modify: `src/shelves/flows/place-journal.flow.ts`
- Modify: `src/shelves/ui/JournalShelfSection.vue`

- [ ] **Step 1: Use `shelfOf` in `PlaceJournalFlow`**

In `src/shelves/flows/place-journal.flow.ts`, replace the `currentShelf` computation. Change:

```ts
  execute(parameters: { journalName: string }): AsyncResult<void, FlowError> {
    const shelfNames = [...this.#repo.find().ids()];
    const currentShelf =
      shelfNames.find((name) =>
        this.#repo
          .get(name)
          .getOr(undefined as never)
          ?.journals.includes(parameters.journalName),
      ) ?? "";
    return attempt.in(this, async function* (this: PlaceJournalFlow) {
```

to:

```ts
  execute(parameters: { journalName: string }): AsyncResult<void, FlowError> {
    const shelfNames = [...this.#repo.find().ids()];
    const currentShelf = this.#service.shelfOf(parameters.journalName);
    return attempt.in(this, async function* (this: PlaceJournalFlow) {
```

> `#repo` stays — it still enumerates `shelfNames` for the modal (plain repo enumeration, not a membership query).

- [ ] **Step 2: Use `shelfOf` in `JournalShelfSection.vue`**

In `src/shelves/ui/JournalShelfSection.vue`, swap the view-model `find` for the service query. Change:

```ts
import { PlaceJournalFlow } from "../flows/place-journal.flow";
import { ShelvesViewModel } from "../view-model";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const shelvesVM = useService(ShelvesViewModel);

const currentShelf = computed(
  () => shelvesVM.shelves.value.find((shelf) => shelf.journals.includes(journalName))?.name ?? "",
);
```

to:

```ts
import { PlaceJournalFlow } from "../flows/place-journal.flow";
import { ShelvesService } from "../service";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const shelvesService = useService(ShelvesService);

const currentShelf = computed(() => shelvesService.shelfOf(journalName));
```

> Reactive: `shelfOf` reads the repository's reactive settings record, so the `computed` recomputes when shelf membership changes (the same reason `ShelvesViewModel.shelves` is a `computed`). If `ShelvesViewModel` is now unused in this file, its import is removed by the change above.

- [ ] **Step 3: Quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

- [ ] **Step 4: Verify reactivity by hand (or trust the existing suite)**

The behavior to preserve: the "Shelf" row updates after placing a journal. Either confirm via the existing component/flow tests, or in the running app place a journal and watch the row change from "Not on a shelf" to the chosen shelf. (No new component test is required — `shelfOf`'s logic is covered in Task 1; this step only guards the wiring.)

- [ ] **Step 5: Commit**

```bash
git add src/shelves/flows/place-journal.flow.ts src/shelves/ui/JournalShelfSection.vue
git commit -m "refactor(shelves): resolve current shelf via ShelvesService.shelfOf"
```

---

## Task 3: Sweep

- [ ] **Step 1: Confirm the duplicated query is gone**

Run:

```bash
grep -rn "journals.includes" src/shelves
```

Expected: matches only inside `service.ts` (`shelfOf` and the `#removeJournalFromShelves`/`#renameJournalInShelves` cascade helpers) — none in `place-journal.flow.ts` or `JournalShelfSection.vue`.

- [ ] **Step 2: Full quality gate**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all pass.

---

## Self-review notes

- **Scope:** only the duplicated `shelfOf` query is centralized. The legitimate own-data reads (`ShelfEditSubpage` displaying a shelf's journals, `JournalsDashboardBlock` aggregating shelved names, `command-registry` write-type filtering) are intentionally left as direct reads — see `CONTEXT.md` → _Shelves_.
- **Return type:** `string` with `""`-means-none, matching `placeJournalModal`'s `currentShelf` input and the component's display logic; avoids forcing both callers to `.getOr("")` an `Option`.
- **Repo dependency:** `PlaceJournalFlow` keeps `ShelvesRepository` for shelf-name enumeration (not a membership query) — deliberately not removed.
- **Reactivity:** `JournalShelfSection`'s `computed` stays reactive because `shelfOf` reads the reactive settings-record storage; Task 2 Step 4 guards this.
