# Adoption Anchor Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the journal index from silently adopting notes whose stored `journal-date` is not a canonical anchor of the journal that currently owns that name (the "delete-keep then recreate with a different write type" hazard).

**Architecture:** One adoption rule — a note is adopted only if `anchorOf(journal, storedDate) === storedDate`. Fixed cycles evaluate it purely inside `FrontmatterService.parseEntry` (no index read). Custom cycles evaluate it after the index is complete: a second reconciliation pass over each custom journal during `VaultSubscriptionService.#rebuild`, and an inline check on single-note `metadata-changed`. Rejected notes are dropped from the index only; files on disk are never touched. The guard runs on every rebuild, so it is retroactive to already-orphaned vaults.

**Tech Stack:** TypeScript, custom `Result`/`Option` (`@/infrastructure/result`), custom DI `Container` (`@/infrastructure/di`), moment-based calendar (`@/calendar`), ts-pattern, vitest (unit), WebdriverIO + `wdio-obsidian-service` (e2e).

## Global Constraints

- **No new frontmatter fields.** The guard stores nothing on notes; it decides index membership only.
- **No note mutation on adoption.** Rejected notes stay on disk untouched; only `JournalsIndex` entries are removed.
- **Quality gates (run all, from repo root):** `npm run test`, `npm run check:types`, `npm run check:lint`. Runtime-touching changes also run the wdio e2e suite.
- **Test hygiene:** colocate `*.test.ts` with the implementation; one behavior per test; subject+verb behavior names; assert observable outcomes (black-box); express scope with nested `describe()` blocks; never `eslint-disable`; no `@ts-expect-error` (use `expectTypeOf` for type assertions).
- **Prod lint:** `no-non-null-assertion` is ON in production code — use `.at(i)`/guards, never `!`.
- **The load-bearing invariant:** every legitimate `journal-date` is written as a canonical anchor (all write paths route through `CycleService.anchorOf` before `FrontmatterService.writeMutator`; the v1→v2→v3 migration canonicalizes at `data-migration-service.ts:119`). The reject rule is only safe while this holds; Task 2 adds a test that pins it.

---

### Task 1: `CycleService.isCanonicalAnchor`

Add one predicate that both later tasks reuse. For fixed cycles it is a pure `periodOfKind` computation (safe to call before the index is built); for custom cycles it consults the index (only called once the index is complete).

**Files:**

- Modify: `src/journals/cycle.ts` (add method to `CycleService`, after `anchorOf`, around line 121)
- Test: `src/journals/cycle.test.ts` (add a `describe("isCanonicalAnchor")` block)

**Interfaces:**

- Consumes: existing `CycleService.anchorOf(name: string, date: CalendarDate): Option<AnchorString>`; `CalendarDate.fromAnchor` and `AnchorString` (already imported in `cycle.ts`).
- Produces: `CycleService.isCanonicalAnchor(name: string, anchor: AnchorString): Option<boolean>` — `None` for an unknown journal, else `Some(true)` iff `anchor` is the canonical anchor of the period it falls in.

- [ ] **Step 1: Write the failing tests**

Add to `src/journals/cycle.test.ts` (uses the file's existing `buildContainer`, `installTestCalendar`, `fixedJournal`, `customJournal`, `CalendarDate` import):

```ts
describe("isCanonicalAnchor", () => {
  it("accepts any date for a fixed daily journal", () => {
    const c = buildContainer({ daily: fixedJournal("daily", { type: "day" }) });
    const cycle = c.resolve(CycleService);
    const result = cycle.isCanonicalAnchor("daily", "2024-06-15" as AnchorString);
    expect(result.isSome() && result.value).toBe(true);
  });

  it("rejects a non-first-of-month date for a fixed monthly journal", () => {
    const c = buildContainer({ m: fixedJournal("m", { type: "month" }) });
    const cycle = c.resolve(CycleService);
    const result = cycle.isCanonicalAnchor("m", "2024-06-15" as AnchorString);
    expect(result.isSome() && result.value).toBe(false);
  });

  it("accepts the first-of-month date for a fixed monthly journal", () => {
    const c = buildContainer({ m: fixedJournal("m", { type: "month" }) });
    const cycle = c.resolve(CycleService);
    const result = cycle.isCanonicalAnchor("m", "2024-06-01" as AnchorString);
    expect(result.isSome() && result.value).toBe(true);
  });

  it("rejects an off-grid date for a custom interval journal", () => {
    const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
    const cycle = c.resolve(CycleService);
    const result = cycle.isCanonicalAnchor("s", "2024-02-20" as AnchorString);
    expect(result.isSome() && result.value).toBe(false);
  });

  it("accepts an on-grid date for a custom interval journal", () => {
    const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
    const cycle = c.resolve(CycleService);
    const result = cycle.isCanonicalAnchor("s", "2024-02-15" as AnchorString);
    expect(result.isSome() && result.value).toBe(true);
  });

  it("returns None for an unknown journal", () => {
    const c = buildContainer({});
    const cycle = c.resolve(CycleService);
    expect(cycle.isCanonicalAnchor("missing", "2024-06-01" as AnchorString).isNone()).toBe(true);
  });
});
```

`AnchorString` is already imported in `cycle.test.ts` (line 4). Confirm it is; if not, add `import type { AnchorString } from "@/calendar";`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: FAIL — `cycle.isCanonicalAnchor is not a function`.

- [ ] **Step 3: Implement the method**

In `src/journals/cycle.ts`, add inside `class CycleService`, immediately after the `anchorOf` method (after line 121):

```ts
  isCanonicalAnchor(name: string, anchor: AnchorString): Option<boolean> {
    return this.anchorOf(name, CalendarDate.fromAnchor(anchor)).map((resolved) => resolved === anchor);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/journals/cycle.test.ts`
Expected: PASS (new block plus all existing `CycleService` tests).

- [ ] **Step 5: Commit**

```bash
git add src/journals/cycle.ts src/journals/cycle.test.ts
git commit -m "feat(journals): add CycleService.isCanonicalAnchor predicate"
```

---

### Task 2: Fixed-cycle canonical check in `parseEntry`

Reject a fixed-journal note whose stored date is not that period's canonical anchor, so an off-grid fixed note never registers. Custom journals pass through unchanged (Task 3 validates them once the index is complete).

**Files:**

- Modify: `src/journals/frontmatter.ts` (`parseEntry`, after line 34 where `anchor` is computed)
- Test: `src/journals/frontmatter.test.ts` (extend the `describe("parseEntry")` block)

**Interfaces:**

- Consumes: `CycleService.isCanonicalAnchor` (Task 1); `this.#cycle` is already injected in `FrontmatterService` (`frontmatter.ts:19`). `config.write.type` is the cycle discriminant — the string `"custom"` for custom journals, a period name (`"day"`/`"week"`/`"month"`/`"quarter"`/`"year"`) for fixed.
- Produces: `parseEntry` now returns `Option.none()` for a fixed journal whose `journal-date` is not canonical. Signature unchanged: `parseEntry(path: VaultPath, frontmatter: Record<string, unknown>): Option<JournalEntry>`.

- [ ] **Step 1: Write the failing tests**

Add to the `describe("parseEntry")` block in `src/journals/frontmatter.test.ts` (uses the file's existing `buildContainer`, `fixedJournal`, `customJournal`):

```ts
it("rejects a fixed monthly note whose date is not the month anchor", () => {
  const c = buildContainer({ m: fixedJournal("m", { type: "month" }) });
  const fm = c.resolve(FrontmatterService);
  const result = fm.parseEntry("M/june.md" as VaultPath, { journal: "m", "journal-date": "2024-06-15" });
  expect(result.isNone()).toBe(true);
});

it("accepts a fixed monthly note whose date is the month anchor", () => {
  const c = buildContainer({ m: fixedJournal("m", { type: "month" }) });
  const fm = c.resolve(FrontmatterService);
  const result = fm.parseEntry("M/june.md" as VaultPath, { journal: "m", "journal-date": "2024-06-01" });
  expect(result.isSome()).toBe(true);
});

it("accepts any date for a fixed daily note", () => {
  const c = buildContainer({ daily: fixedJournal("daily", { type: "day" }) });
  const fm = c.resolve(FrontmatterService);
  const result = fm.parseEntry("D/x.md" as VaultPath, { journal: "daily", "journal-date": "2024-06-15" });
  expect(result.isSome()).toBe(true);
});

it("still adopts an off-grid custom note at parse time (validated later)", () => {
  const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
  const fm = c.resolve(FrontmatterService);
  const result = fm.parseEntry("S/x.md" as VaultPath, { journal: "s", "journal-date": "2024-01-03" });
  expect(result.isSome()).toBe(true);
});

it("re-adopts a note written through writeMutator for its own fixed journal", () => {
  const c = buildContainer({ weekly: fixedJournal("weekly", { type: "week" }) });
  const fm = c.resolve(FrontmatterService);
  const written = fm.writeMutator("weekly", { journalName: "weekly", anchor: "2021-01-07" as AnchorString });
  expect(written.isOk()).toBe(true);
  if (!written.isOk()) return;
  const out: Record<string, unknown> = {};
  written.value(out);
  expect(fm.parseEntry("W/x.md" as VaultPath, out).isSome()).toBe(true);
});
```

`2021-01-07` is the canonical weekly anchor for that week (see the existing `cycle.test.ts` weekly cases at lines 65-72). `AnchorString` is already imported in `frontmatter.test.ts` (line 3).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/journals/frontmatter.test.ts`
Expected: FAIL — the "rejects a fixed monthly note…" test fails because `parseEntry` currently returns `Some`.

- [ ] **Step 3: Implement the check**

In `src/journals/frontmatter.ts`, inside `parseEntry`, immediately after the line `const anchor = parsed.value.toAnchor();` (line 34), insert:

```ts
// Fixed cycles: reject a stored date that is not the period's canonical anchor, so a note left
// behind by a same-named journal of a different write type is not silently re-interpreted.
// anchorOf is pure for fixed cycles, so this is safe during the boot walk (no index read).
// Custom cycles are validated after the index is complete (see VaultSubscriptionService).
if (config.write.type !== "custom") {
  const canonical = this.#cycle.isCanonicalAnchor(journalName, anchor);
  if (!(canonical.isSome() && canonical.value)) return Option.none();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/journals/frontmatter.test.ts`
Expected: PASS (new tests plus all existing `FrontmatterService` tests — the existing daily/custom `parseEntry` cases stay green because daily anchors are always canonical and custom notes pass through).

- [ ] **Step 5: Commit**

```bash
git add src/journals/frontmatter.ts src/journals/frontmatter.test.ts
git commit -m "feat(journals): reject non-canonical fixed-cycle notes in parseEntry"
```

---

### Task 3: Custom-cycle reconciliation in `VaultSubscriptionService`

Validate custom notes once the index is complete: a second pass over each custom journal during a full rebuild, and an inline check on single-note `metadata-changed`. Drop off-sequence notes from the index (files untouched) with a debug log.

**Files:**

- Modify: `src/journals/vault-subscription.ts`
- Test: `src/journals/vault-subscription.test.ts` (add tests; the rig already registers `CycleService`, `JournalsRepository`, `FrontmatterService`, `JournalsIndex` and a fake logger)

**Interfaces:**

- Consumes: `CycleService.isCanonicalAnchor` (Task 1), `CycleService.intervalsInRange(name, start, end): readonly AnchorString[]` (existing, `cycle.ts:186`), `JournalsIndex.entriesFor(name): Iterable<[AnchorString, VaultPath]>` (existing, `journals-index.ts:163`), `JournalsIndex.unregister(path)` (existing), `JournalsRepository.find().filter(pred).list()` (existing `BaseRepository` query API — returns `IterableIterator<JournalConfig>`), `JournalConfig.write.type` and `JournalConfig.name`.
- Produces: no new public surface — `#rebuild` becomes two passes; `#scan` gains a `{ reconcileCustom }` option; adds private `#reconcileEntry` and `#reconcileCustomJournals`.

- [ ] **Step 1: Write the failing tests**

Add to `src/journals/vault-subscription.test.ts`. First extend the imports near the top — add `customJournal` to the existing `./testing` import (line 18 currently imports `{ fakeRepo, fixedJournal }`):

```ts
import { customJournal, fakeRepo, fixedJournal } from "./testing";
```

Then add these tests inside the top-level `describe("VaultSubscriptionService")`:

```ts
it("drops an off-sequence custom note during the boot rebuild", async () => {
  const rig = buildRig({ s: customJournal("s", "week", 1, "2024-01-01") }, [
    "S/on.md" as VaultPath,
    "S/off.md" as VaultPath,
  ]);
  rig.setFrontmatter("S/on.md", { journal: "s", "journal-date": "2024-01-01" });
  rig.setFrontmatter("S/off.md", { journal: "s", "journal-date": "2024-01-03" });
  const sub = rig.container.resolve(VaultSubscriptionService);
  await sub.initialize();
  const index = rig.container.resolve(JournalsIndex);

  expect(index.entryByPath("S/off.md" as VaultPath).isNone()).toBe(true);
});

it("keeps an on-grid custom note during the boot rebuild", async () => {
  const rig = buildRig({ s: customJournal("s", "week", 1, "2024-01-01") }, [
    "S/on.md" as VaultPath,
    "S/off.md" as VaultPath,
  ]);
  rig.setFrontmatter("S/on.md", { journal: "s", "journal-date": "2024-01-01" });
  rig.setFrontmatter("S/off.md", { journal: "s", "journal-date": "2024-01-03" });
  const sub = rig.container.resolve(VaultSubscriptionService);
  await sub.initialize();
  const index = rig.container.resolve(JournalsIndex);

  expect(index.entryByPath("S/on.md" as VaultPath).isSome()).toBe(true);
});

it("keeps a manually extended custom interval whose start is off the regular grid", async () => {
  const rig = buildRig({ s: customJournal("s", "week", 1, "2024-01-01") }, [
    "S/first.md" as VaultPath,
    "S/second.md" as VaultPath,
  ]);
  // first interval extended from 1 week to 18 days (ends 2024-01-18), so the next interval starts
  // 2024-01-19 — 18 days after the anchor, NOT a multiple of 7, so off the regular 1-week grid
  // but on the reconstructed sequence.
  rig.setFrontmatter("S/first.md", { journal: "s", "journal-date": "2024-01-01", "journal-end-date": "2024-01-18" });
  rig.setFrontmatter("S/second.md", { journal: "s", "journal-date": "2024-01-19" });
  const sub = rig.container.resolve(VaultSubscriptionService);
  await sub.initialize();
  const index = rig.container.resolve(JournalsIndex);

  expect(index.entryByPath("S/second.md" as VaultPath).isSome()).toBe(true);
});

it("drops an off-sequence custom note on metadata-changed", async () => {
  const rig = buildRig({ s: customJournal("s", "week", 1, "2024-01-01") });
  const sub = rig.container.resolve(VaultSubscriptionService);
  await sub.initialize();

  rig.setFrontmatter("S/off.md", { journal: "s", "journal-date": "2024-01-03" });
  rig.emit("metadata-changed", "S/off.md" as VaultPath);

  const index = rig.container.resolve(JournalsIndex);
  expect(index.entryByPath("S/off.md" as VaultPath).isNone()).toBe(true);
});

it("registers an on-grid custom note on metadata-changed", async () => {
  const rig = buildRig({ s: customJournal("s", "week", 1, "2024-01-01") });
  const sub = rig.container.resolve(VaultSubscriptionService);
  await sub.initialize();

  rig.setFrontmatter("S/on.md", { journal: "s", "journal-date": "2024-01-08" });
  rig.emit("metadata-changed", "S/on.md" as VaultPath);

  const index = rig.container.resolve(JournalsIndex);
  expect(index.entryByPath("S/on.md" as VaultPath).isSome()).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/journals/vault-subscription.test.ts`
Expected: FAIL — "drops an off-sequence custom note during the boot rebuild" fails because the off-grid note is currently registered.

- [ ] **Step 3: Implement the two-pass rebuild and reconciliation**

Edit `src/journals/vault-subscription.ts`:

3a. Add imports and injected dependencies. Add to the imports from `./` at the top:

```ts
import { CycleService } from "./cycle";
import { JournalsRepository } from "./repository";
```

and add `JournalEntry` to the type import from `./types`:

```ts
import type { JournalEntry } from "./types";
```

Add these two fields alongside the existing `inject(...)` fields in the class:

```ts
  readonly #cycle = inject(CycleService);
  readonly #journals = inject(JournalsRepository);
```

3b. Replace `#rebuild` (currently lines 26-30) with a two-pass version:

```ts
  #rebuild(): void {
    for (const path of this.#notes.allMarkdownNotes()) {
      this.#scan(path, { reconcileCustom: false });
    }
    this.#reconcileCustomJournals();
  }
```

3c. Replace `#scan` (currently lines 55-68) with a version that takes the option and validates a custom note inline when the index is already complete:

```ts
  #scan(path: VaultPath, options: { reconcileCustom: boolean }): void {
    const fm = this.#readFrontmatter(path);
    if (!fm) {
      this.#index.unregister(path);
      return;
    }
    const entry = this.#frontmatter.parseEntry(path, fm);
    if (entry.isNone()) {
      this.#index.unregister(path);
      this.#logger.debug("frontmatter not parseable", { path });
      return;
    }
    this.#index.register(entry.value);
    if (options.reconcileCustom) this.#reconcileEntry(entry.value);
  }

  // Custom-cycle anchors depend on the whole index (extension chain), so a custom note can only be
  // validated once the index is complete: inline on metadata-changed, or in the rebuild's second pass.
  #reconcileEntry(entry: JournalEntry): void {
    const config = this.#journals.get(entry.journalName);
    if (config.isNone() || config.value.write.type !== "custom") return;
    const canonical = this.#cycle.isCanonicalAnchor(entry.journalName, entry.anchor);
    if (canonical.isSome() && canonical.value) return;
    this.#index.unregister(entry.path);
    this.#logger.debug("anchor off sequence", { path: entry.path });
  }

  #reconcileCustomJournals(): void {
    for (const config of this.#journals.find().filter((c) => c.write.type === "custom").list()) {
      const entries = [...this.#index.entriesFor(config.name)];
      if (entries.length === 0) continue;
      const anchors = entries.map(([anchor]) => anchor);
      const min = anchors.reduce((a, b) => (b < a ? b : a));
      const max = anchors.reduce((a, b) => (b > a ? b : a));
      const valid = new Set(this.#cycle.intervalsInRange(config.name, min, max));
      for (const [anchor, path] of entries) {
        if (valid.has(anchor)) continue;
        this.#index.unregister(path);
        this.#logger.debug("anchor off sequence", { path });
      }
    }
  }
```

3d. Update the `metadata-changed` handler in `initialize` (currently line 78) to reconcile the single note:

```ts
      this.#notes.events.on("metadata-changed", (path) => this.#scan(path, { reconcileCustom: true })),
```

(The `settings.reloaded` handler stays `() => this.#rebuild()` — `#rebuild` is now two-pass. `#rebuildWhenResolved` still calls `#rebuild()` unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/journals/vault-subscription.test.ts`
Expected: PASS (new tests plus all existing `VaultSubscriptionService` tests — existing daily cases are fixed-cycle and canonical, so unaffected).

- [ ] **Step 5: Run the full unit suite + gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS. If `check:lint` flags the `reduce` without an initial value or an indexed-access type, keep the guarded form shown (the `entries.length === 0` guard makes `anchors` non-empty, so `reduce` without a seed is well-typed).

- [ ] **Step 6: Commit**

```bash
git add src/journals/vault-subscription.ts src/journals/vault-subscription.test.ts
git commit -m "feat(journals): reconcile off-sequence custom notes against the index"
```

---

### Task 4: e2e — off-sequence orphan is not surfaced by navigation

The unit tests run against the real `CycleService`/`JournalsIndex`/`FrontmatterService` (no mocks), but they fake the vault walk. This task proves the guard fires through the real Obsidian boot walk (`onLayoutReady` → `#rebuildWhenResolved` → `#rebuild`) reading the real `metadataCache`, and that the drop is observable through navigation. It also serves as the full-container DI check (adding `CycleService` + `JournalsRepository` to `VaultSubscriptionService` must not introduce a boot-time cycle — a cycle passes unit tests but aborts `onload` at real boot).

**Files:**

- Create fixture: `e2e/fixtures/e2e-adoption/` — copy the structure of `e2e/fixtures/e2e-daily/` (an `.obsidian/plugins/journals/` folder with `manifest.json`, `main.js`/build artifacts as the other fixtures carry them, and a `data.json`), then adapt `data.json` and seed two notes (details below).
- Create spec: `e2e/journeys/adoption-guard.e2e.ts`

**Interfaces:**

- Consumes e2e helpers: `browser.reloadObsidian` (re-copies the fixture), `runCommand`/`openPalette`/`promptChoose`/`paletteLists` (`e2e/support/commands.ts`), `activeNotePath`/`noteExists`/`frontmatterOf` (`e2e/support/vault.ts`).

- [ ] **Step 1: Read the command-navigation e2e patterns**

Before writing the fixture, read `e2e/journeys/default-commands.e2e.ts` and `e2e/journeys/dynamic-commands.e2e.ts` to see how the plugin's per-journal navigation commands (especially the `previous_available` / `next_available` "open nearest existing note" types) are registered and how their palette labels read. Pick the mechanism (a default-registered command, or a command entry added to the fixture `data.json`). Confirm the exact palette label with `paletteLists("<label>")` while iterating. This is the observable: `findNearestExisting` (`journals-index.ts:131`) scans every registered entry, so an off-sequence orphan is only reachable by the "available" navigation types — the guard removes it from that scan.

- [ ] **Step 2: Build the fixture**

Copy `e2e/fixtures/e2e-daily/` to `e2e/fixtures/e2e-adoption/`. In its `data.json`:

- Define a single **fixed monthly** journal named `log` (`"write": { "type": "month" }`), keeping the `frontmatter`, `dateFormat`, `timeline`, `numbering` blocks from the daily fixture (adjust `dateFormat` to `"YYYY-MM"` so month notes have stable paths).
- Add a navigation command of type `previous_available` (and/or `next_available`) targeting `log`, modeled on the command shape you found in Step 1.

Seed two notes at the fixture vault root (committed `.md` files with frontmatter blocks):

- `log-legit.md` — `journal: log`, `journal-date: 2024-05-01` (a canonical month anchor; a legitimate `log` note).
- `log-orphan.md` — `journal: log`, `journal-date: 2024-06-15` (NOT a month anchor — exactly what a former daily `log` journal would have left behind). Place its date **later** than the legit note so that, without the guard, a "previous available from a July reference" navigation would land on the orphan first.

- [ ] **Step 3: Write the e2e spec**

Create `e2e/journeys/adoption-guard.e2e.ts`:

```ts
import { browser, expect } from "@wdio/globals";

import { openPalette, promptChoose } from "../support/commands.js";
import { activeNotePath, noteExists } from "../support/vault.js";

// The boot walk (onLayoutReady -> VaultSubscriptionService#rebuild) reads the real metadataCache and
// registers notes by journal name. The adoption guard must reject log-orphan.md, whose journal-date is
// not a canonical month anchor for the recreated monthly `log` journal, so the "open previous available"
// navigation skips it. Only a real vault + metadataCache exercises the boot walk, so this cannot be a
// unit test. Also the DI smoke check: a boot-time cycle from the new CycleService/JournalsRepository
// deps would abort onload here.
describe("adoption anchor guard", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-adoption", plugins: ["journals"] });
  });

  it("keeps both seeded notes on disk (the guard never mutates files)", async () => {
    expect(await noteExists("log-legit.md")).toBe(true);
    expect(await noteExists("log-orphan.md")).toBe(true);
  });

  it("does not open the off-sequence orphan from previous-available navigation", async () => {
    await openPalette();
    // Replace with the exact palette label confirmed in Step 1.
    await promptChoose("Open previous log");

    await browser.waitUntil(async () => (await activeNotePath()) === "log-legit.md", {
      timeoutMsg: "previous-available navigation did not open the legitimate log note",
    });
    expect(await activeNotePath()).not.toBe("log-orphan.md");
  });
});
```

If the chosen command surfaces nothing when the orphan is excluded (e.g. the legit note is on the far side of the reference), instead assert the negative directly: after invoking the command, `activeNotePath()` is never `"log-orphan.md"` (poll a short fixed number of times, then assert). Keep exactly one behavior per `it`.

- [ ] **Step 4: Run the e2e spec**

Run: `npm run test:e2e -- --spec e2e/journeys/adoption-guard.e2e.ts`
(Confirm the exact e2e script name in `package.json` — it may be `test:e2e` or `e2e`. Use the one the repo defines.)
Expected: PASS. If the plugin fails to boot (white screen / plugin absent), suspect a DI cycle from Task 3's new injections and break it with a lazy `InjectorToken` per the project's established pattern.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/e2e-adoption e2e/journeys/adoption-guard.e2e.ts
git commit -m "test(e2e): fixed-cycle adoption guard skips off-grid orphan in navigation"
```

---

### Task 5: e2e — custom journal reconciliation keeps on-grid, drops off-sequence

Prove the custom-cycle second pass runs through the real boot walk: an on-grid custom note stays reachable while an off-sequence orphan is dropped.

**Files:**

- Create fixture: `e2e/fixtures/e2e-adoption-custom/` — copy `e2e/fixtures/e2e-custom/` (the existing custom-interval fixture) as the base so the plugin build artifacts and manifest match, then adapt `data.json` and seed notes.
- Modify spec: add a second `describe` to `e2e/journeys/adoption-guard.e2e.ts` (or a sibling `e2e/journeys/adoption-guard-custom.e2e.ts` if a separate `before`/vault is cleaner — a spec file boots one vault in `before`, so a second vault needs its own `describe` with its own `reloadObsidian`).

**Interfaces:**

- Consumes: same e2e helpers as Task 4.

- [ ] **Step 1: Inspect the existing custom fixture**

Read `e2e/fixtures/e2e-custom/`’s `data.json` to copy its custom `write` block shape (`{ "type": "custom", "every": ..., "duration": ..., "anchorDate": "..." }`) and its `numbering`/`frontmatter` blocks. Reuse those exact fields.

- [ ] **Step 2: Build the fixture**

Copy `e2e/fixtures/e2e-custom/` to `e2e/fixtures/e2e-adoption-custom/`. In `data.json` keep one custom journal named `sprint` with a 2-week interval (`"every": "week", "duration": 2`) and `anchorDate: "2024-01-01"`. Add a `previous_available`/`next_available` command targeting `sprint` (same mechanism as Task 4).

Seed notes at the vault root:

- `sprint-on.md` — `journal: sprint`, `journal-date: 2024-01-15` (on grid: `2024-01-01` + one 2-week step).
- `sprint-off.md` — `journal: sprint`, `journal-date: 2024-01-10` (off the 2-week grid — a former differently-configured `sprint` left it behind), dated so that, unguarded, it would be the nearest available note from the reference.

- [ ] **Step 3: Write the spec**

Add to `e2e/journeys/adoption-guard.e2e.ts` a new `describe("adoption anchor guard — custom interval")` with its own `before` calling `reloadObsidian({ vault: "./e2e/fixtures/e2e-adoption-custom", plugins: ["journals"] })`, and two `it`s:

```ts
it("keeps the on-grid custom note reachable", async () => {
  await openPalette();
  await promptChoose("Open previous sprint"); // exact label per Step 1 of Task 4
  await browser.waitUntil(async () => (await activeNotePath()) === "sprint-on.md", {
    timeoutMsg: "previous-available navigation did not open the on-grid sprint note",
  });
  expect(await activeNotePath()).toBe("sprint-on.md");
});

it("does not open the off-sequence custom orphan", async () => {
  expect(await activeNotePath()).not.toBe("sprint-off.md");
});
```

Keep one behavior per `it`; if the two assertions need independent navigation, split the setup into each `it` rather than sharing mutable state.

- [ ] **Step 4: Run the e2e spec**

Run: `npm run test:e2e -- --spec e2e/journeys/adoption-guard.e2e.ts`
Expected: PASS.

- [ ] **Step 5: Full gate run**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add e2e/fixtures/e2e-adoption-custom e2e/journeys/adoption-guard.e2e.ts
git commit -m "test(e2e): custom-cycle reconciliation keeps on-grid, drops off-sequence orphan"
```

---

## Notes for the implementer

- **Why `parseEntry` handles fixed but not custom:** `anchorOf` is pure for fixed cycles but reads the index for custom ones (the extension chain). During the boot walk the index is only half-built, so a custom check there would be order-dependent. That is the entire reason for the second pass.
- **Rejected notes are inert:** dropping from the index leaves the file and its (now stale) frontmatter untouched. That is intentional — the old bug was silent _mis-adoption_; the new behavior is silent _non-adoption_. No user-visible notice is emitted (out of scope).
- **DI:** `CycleService` and `JournalsRepository` are already registered wherever `VaultSubscriptionService` is (both are dependencies of `FrontmatterService`, which `VaultSubscriptionService` already injects). No module wiring changes are expected, but Task 4’s e2e is the real guard against a boot-time cycle.
- **Fixture build artifacts:** e2e fixtures embed the plugin build under `.obsidian/plugins/journals/`. Copy an existing fixture wholesale rather than hand-authoring that folder, then edit only `data.json` and add the seed notes.

```

```
