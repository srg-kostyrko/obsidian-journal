# Sync-Scenario Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an executable harness that models Obsidian sync scenarios (external file/settings changes arriving while the plugin runs) and probes the plugin's response, and fix the confirmed conflict-copy index bug it exposes.

**Architecture:** Unit tests drive `VaultSubscriptionService` + `JournalsIndex` (and `AutoAttachService`) through the existing fake ports to assert index state under each sync scenario; one e2e exercises the real `onExternalSettingsChange` pipeline. The one confirmed bug — same-anchor collisions from sync conflict copies silently overwriting/orphaning index entries — is fixed in `JournalsIndex`.

**Tech Stack:** TypeScript, vitest (unit), wdio + wdio-obsidian-service (e2e), the project's DI `Container`, Result/Option monads, nanoevents.

## Global Constraints

- Test commands are npm scripts: `npm run test`, `npm run check:types`, `npm run check:lint`. e2e is a separate wdio suite.
- Never add `eslint-disable` comments; fix the code instead.
- Type assertions in tests use `expectTypeOf`, never `@ts-expect-error`.
- In reactive/Option bridges use `Option.getOrUndefined()`; never `getOr(undefined as never)`.
- One behavior per test; test names describe subject+verb behavior, not implementation effects; no "and"/comma-list names.
- Black-box assertions: assert observable outcomes (index queries, frontmatter), not log shape or spy counts unless the side effect IS the contract.
- No trivial/framework-behavior tests; don't duplicate cells already covered by `vault-subscription.test.ts` (cells 4/5/6 and partial 1/3/8/9).
- Colocate `*.test.ts` with implementation; test infra goes in a sibling `*.testing.ts` file.
- `no-non-null-assertion` is ON in prod, OFF in tests; prefer `.at(i) ?? fallback`.
- Design reference: `docs/superpowers/specs/2026-07-16-sync-scenario-harness-design.md`.

## File Structure

- `src/journals/journals-index.ts` — **modify**: `register` returns `"registered" | "collision"` with incumbent-wins collision handling; `unregister` frees only a slot it owns.
- `src/journals/journals-index.test.ts` — **modify**: add collision register/unregister behavior tests.
- `src/journals/vault-subscription.ts` — **modify**: `#scan` logs a warn and returns on a `"collision"` outcome.
- `src/journals/vault-subscription.testing.ts` — **create**: export `buildRig`/`TestRig` extracted from the test.
- `src/journals/vault-subscription.test.ts` — **modify**: import the extracted rig instead of the local copy.
- `src/journals/sync-scenarios.test.ts` — **create**: the sync-scenario harness (conflict-copy, missing-config, burst) through the subscription pipeline.
- `e2e/integration/sync-settings.e2e.ts` — **create**: real external-settings-sync integrity + note re-index.

Sync cell 1 (a foreign note synced in at a matching path) is already covered by `auto-attach.test.ts` ("attaches a newly-created note matching exactly one journal" + "does nothing when the path is already indexed"); no new test is added for it.

---

### Task 1: Incumbent-wins collision handling in JournalsIndex

**Files:**

- Modify: `src/journals/journals-index.ts:44-72`
- Test: `src/journals/journals-index.test.ts`

**Interfaces:**

- Produces: `JournalsIndex.register(entry: JournalEntry): "registered" | "collision"` — returns `"collision"` (and mutates nothing) when a _different_ path already owns `(entry.journalName, entry.anchor)`; otherwise registers and returns `"registered"`. Identical re-registration returns `"registered"`.
- Produces: `JournalsIndex.unregister(path: VaultPath): void` — unchanged signature; now only deletes the anchor slot when it still points at `path`.
- Consumes (both callers ignore the new return value): `src/journals/vault-subscription.ts:74`, `src/journals/settings/ui/use-code-block-preview-path.ts:23`.

- [ ] **Step 1: Write the failing tests**

Add to `src/journals/journals-index.test.ts` inside the existing `describe("register", ...)` block (after the line-98 test):

```ts
it("keeps the incumbent when a different path claims an occupied anchor", () => {
  const index = new JournalsIndex();
  index.register(entry("daily", "2022-01-01", "original.md"));
  index.register(entry("daily", "2022-01-01", "original (conflicted copy).md"));
  const atAnchor = index.entryByAnchor("daily", a("2022-01-01"));
  assert(atAnchor.isSome());
  expect(atAnchor.value.path).toBe(p("original.md"));
});

it("reports collision when a different path claims an occupied anchor", () => {
  const index = new JournalsIndex();
  index.register(entry("daily", "2022-01-01", "original.md"));
  expect(index.register(entry("daily", "2022-01-01", "conflict.md"))).toBe("collision");
});

it("does not index a path rejected as a collision", () => {
  const index = new JournalsIndex();
  index.register(entry("daily", "2022-01-01", "original.md"));
  index.register(entry("daily", "2022-01-01", "conflict.md"));
  expect(index.entryByPath(p("conflict.md")).isNone()).toBe(true);
});

it("reports registered for a first-seen anchor", () => {
  const index = new JournalsIndex();
  expect(index.register(entry("daily", "2022-01-01", "original.md"))).toBe("registered");
});
```

Add to `src/journals/journals-index.test.ts` inside the existing `describe("unregister", ...)` block (after the line-137 test):

```ts
it("keeps the incumbent indexed when a rejected collision path is unregistered", () => {
  const index = new JournalsIndex();
  index.register(entry("daily", "2022-01-01", "original.md"));
  index.register(entry("daily", "2022-01-01", "conflict.md"));
  index.unregister(p("conflict.md"));
  const atAnchor = index.entryByAnchor("daily", a("2022-01-01"));
  assert(atAnchor.isSome());
  expect(atAnchor.value.path).toBe(p("original.md"));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/journals/journals-index.test.ts`
Expected: FAIL — current `register` returns `undefined` (not `"collision"`), overwrites the anchor so `entryByAnchor` returns `conflict.md`, and the collision path IS indexed.

- [ ] **Step 3: Implement the fix**

Replace `register` and `unregister` in `src/journals/journals-index.ts` (lines 44-72) with:

```ts
  register(entry: JournalEntry): "registered" | "collision" {
    const existing = this.#byPath.get(entry.path);
    if (existing && existing.journalName === entry.journalName && existing.anchor === entry.anchor) {
      return "registered";
    }
    // A different note already holds this (journal, anchor) slot — e.g. a sync conflict copy that
    // carries the original's frontmatter. Keep the incumbent and reject the newcomer, rather than
    // overwriting the slot and orphaning the incumbent in #byPath (where a later delete of the
    // newcomer would then strand the incumbent, invisible to every anchor lookup).
    const occupant = this.#journals.get(entry.journalName)?.get(entry.anchor);
    if (occupant !== undefined && occupant.isSome() && occupant.value !== entry.path) {
      return "collision";
    }
    if (existing) {
      this.#journals.get(existing.journalName)?.delete(existing.anchor);
      this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
      this.#markDirty(existing.journalName);
    }
    let journalIndex = this.#journals.get(entry.journalName);
    if (!journalIndex) {
      journalIndex = new JournalIndex();
      this.#journals.set(entry.journalName, journalIndex);
    }
    journalIndex.set(entry.anchor, entry.path);
    this.#byPath.set(entry.path, entry);
    this.#emitter.emit("entryChanged", { entry, kind: "added" });
    this.#markDirty(entry.journalName);
    return "registered";
  }

  unregister(path: VaultPath): void {
    const existing = this.#byPath.get(path);
    if (!existing) return;
    const journalIndex = this.#journals.get(existing.journalName);
    // Only free the anchor slot if it still points at this path: a rejected collision newcomer
    // never entered #byPath (so this is a no-op for it), and we must never delete a slot another
    // note owns.
    const slot = journalIndex?.get(existing.anchor);
    if (slot !== undefined && slot.isSome() && slot.value === path) journalIndex?.delete(existing.anchor);
    this.#byPath.delete(path);
    this.#emitter.emit("entryChanged", { entry: existing, kind: "removed" });
    this.#markDirty(existing.journalName);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/journals/journals-index.test.ts`
Expected: PASS — all existing index tests plus the five new ones.

- [ ] **Step 5: Verify types and the whole suite**

Run: `npm run check:types && npm run test`
Expected: PASS — the two `register` callers ignore the new return value, so no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/journals/journals-index.ts src/journals/journals-index.test.ts
git commit -m "fix(index): keep incumbent on same-anchor collisions from sync conflict copies"
```

---

### Task 2: Extract the vault-subscription test rig into a sibling testing file

**Files:**

- Create: `src/journals/vault-subscription.testing.ts`
- Modify: `src/journals/vault-subscription.test.ts:1-132`

**Interfaces:**

- Produces: `buildRig(journals, initialPaths?): TestRig` and the `TestRig` interface, importable by other tests.

This is a pure refactor: move the rig verbatim so `sync-scenarios.test.ts` (Task 3) can reuse it without duplication. No behavior change.

- [ ] **Step 1: Create the testing file**

Create `src/journals/vault-subscription.testing.ts` by moving lines 22-132 of `src/journals/vault-subscription.test.ts` (the `fakeTFile` helper, the `TestRig` interface, and `buildRig`) into it, plus the imports those lines need. The file's imports and body:

```ts
import { createNanoEvents } from "nanoevents";
import { TFile } from "obsidian";
import { vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { InternalObsidianAppToken, NoteMetadataService, NotesService, WorkspaceService } from "@/infrastructure/host";
import type { NotesEvents, VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { None, Some } from "@/infrastructure/result";
import { SettingsEventsToken, type SettingsEvents } from "@/settings";

import { CycleService } from "./cycle";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { JournalsRepository, type JournalsEvents } from "./repository";
import { fakeRepo } from "./testing";
import { JournalsEventsToken } from "./tokens";
import { VaultSubscriptionService } from "./vault-subscription";

function fakeTFile(path: string): TFile {
  const file = Object.create(TFile.prototype) as TFile & { path: string; basename: string; extension: string };
  file.path = path;
  file.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  file.extension = "md";
  return file;
}

export interface TestRig {
  container: Container;
  emit: <K extends keyof NotesEvents>(event: K, ...arguments_: Parameters<NotesEvents[K]>) => void;
  emitJournalDeleted: (journalName: string) => void;
  emitSettingsReloaded: () => void;
  setFrontmatter(path: string, fm: Record<string, unknown> | null): void;
  setMarkdownNotes(paths: VaultPath[]): void;
  setResolved(path: string, resolved: boolean): void;
  emitResolved(): void;
}

export function buildRig(journals: Parameters<typeof fakeRepo>[0], initialPaths: VaultPath[] = []): TestRig {
  // ... move the exact body from vault-subscription.test.ts lines 42-131 unchanged ...
}
```

Move the body of `buildRig` (current `vault-subscription.test.ts` lines 42-131) verbatim into the new function.

- [ ] **Step 2: Update the test to import the rig**

In `src/journals/vault-subscription.test.ts`, delete the moved lines (the `fakeTFile` function, `TestRig` interface, and `buildRig`, current lines 22-132) and their now-unused imports, and add:

```ts
import { buildRig } from "./vault-subscription.testing";
```

Keep the imports the remaining test body still needs (`installTestCalendar`, `VaultPath`, `JournalsIndex`, `customJournal`, `fixedJournal`, `describe`/`it`/`expect`, `afterEach`/`beforeEach`).

- [ ] **Step 3: Verify the existing suite is unchanged and green**

Run: `npm run test -- src/journals/vault-subscription.test.ts && npm run check:types && npm run check:lint -- src/journals/vault-subscription.testing.ts src/journals/vault-subscription.test.ts`
Expected: PASS — all 15 existing tests still pass; no unused imports.

- [ ] **Step 4: Commit**

```bash
git add src/journals/vault-subscription.testing.ts src/journals/vault-subscription.test.ts
git commit -m "test(journals): extract vault-subscription rig into a sibling testing file"
```

---

### Task 3: Sync-scenario harness through the subscription pipeline

**Files:**

- Create: `src/journals/sync-scenarios.test.ts`
- Modify: `src/journals/vault-subscription.ts:62-76`

**Interfaces:**

- Consumes: `buildRig`/`TestRig` from Task 2; `JournalsIndex.register` collision behavior from Task 1.

Covers the genuinely-uncovered sync cells at the pipeline level: conflict copy (7), missing config (11), burst (10). Also makes a rejected conflict copy observable by logging in `#scan`.

- [ ] **Step 1: Make `#scan` observe collisions**

In `src/journals/vault-subscription.ts`, replace the `register` call in `#scan` (lines 74-75):

```ts
this.#index.register(entry.value);
if (options.reconcileCustom) this.#reconcileEntry(entry.value);
```

with:

```ts
const outcome = this.#index.register(entry.value);
if (outcome === "collision") {
  this.#logger.warn("anchor slot already occupied by another note; leaving unindexed", { path });
  return;
}
if (options.reconcileCustom) this.#reconcileEntry(entry.value);
```

- [ ] **Step 2: Write the harness tests**

Create `src/journals/sync-scenarios.test.ts`:

```ts
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";

import { JournalsIndex } from "./journals-index";
import { fixedJournal } from "./testing";
import { VaultSubscriptionService } from "./vault-subscription";
import { buildRig } from "./vault-subscription.testing";

const ANCHOR = "2024-01-01" as AnchorString;
const ORIGINAL = "daily/2024-01-01.md" as VaultPath;
const CONFLICT = "daily/2024-01-01 (conflicted copy 2026-07-16).md" as VaultPath;
const FM = { journal: "daily", "journal-date": "2024-01-01" };

async function startedRig(initialPaths: VaultPath[] = []) {
  const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, initialPaths);
  await rig.container.resolve(VaultSubscriptionService).initialize();
  return { rig, index: rig.container.resolve(JournalsIndex) };
}

describe("sync scenarios", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("conflict copy sharing an anchor", () => {
    it("keeps the original note in the anchor slot when a conflict copy arrives", async () => {
      const { rig, index } = await startedRig();
      rig.setFrontmatter(ORIGINAL, FM);
      rig.emit("metadata-changed", ORIGINAL);
      rig.setFrontmatter(CONFLICT, FM);
      rig.emit("metadata-changed", CONFLICT);

      const atAnchor = index.entryByAnchor("daily", ANCHOR);
      assert(atAnchor.isSome());
      expect(atAnchor.value.path).toBe(ORIGINAL);
    });

    it("leaves the conflict copy unindexed", async () => {
      const { rig, index } = await startedRig();
      rig.setFrontmatter(ORIGINAL, FM);
      rig.emit("metadata-changed", ORIGINAL);
      rig.setFrontmatter(CONFLICT, FM);
      rig.emit("metadata-changed", CONFLICT);

      expect(index.entryByPath(CONFLICT).isNone()).toBe(true);
    });

    it("keeps the original reachable after the conflict copy is deleted", async () => {
      const { rig, index } = await startedRig();
      rig.setFrontmatter(ORIGINAL, FM);
      rig.emit("metadata-changed", ORIGINAL);
      rig.setFrontmatter(CONFLICT, FM);
      rig.emit("metadata-changed", CONFLICT);

      rig.emit("deleted", CONFLICT);

      const atAnchor = index.entryByAnchor("daily", ANCHOR);
      assert(atAnchor.isSome());
      expect(atAnchor.value.path).toBe(ORIGINAL);
    });
  });

  describe("note referencing an unknown journal", () => {
    it("does not index a note whose journal config is absent locally", async () => {
      const { rig, index } = await startedRig();
      rig.setFrontmatter("inbox/x.md", { journal: "not-synced-yet", "journal-date": "2024-01-01" });
      rig.emit("metadata-changed", "inbox/x.md" as VaultPath);

      expect(index.entryByPath("inbox/x.md" as VaultPath).isNone()).toBe(true);
    });
  });

  describe("burst of synced notes", () => {
    it("indexes every note when a batch of metadata-changed events arrives at once", async () => {
      const { rig, index } = await startedRig();
      const paths: VaultPath[] = [];
      // 28 valid February days — a batch large enough to exercise the coalesced dirty flush.
      for (let day = 1; day <= 28; day++) {
        const date = `2024-02-${String(day).padStart(2, "0")}`;
        const path = `daily/${date}.md` as VaultPath;
        paths.push(path);
        rig.setFrontmatter(path, { journal: "daily", "journal-date": date });
      }
      for (const path of paths) rig.emit("metadata-changed", path);

      expect([...index.entriesFor("daily")]).toHaveLength(28);
    });
  });
});
```

- [ ] **Step 3: Run the harness**

Run: `npm run test -- src/journals/sync-scenarios.test.ts`
Expected: PASS — with Task 1's fix in place, the original wins the slot, the conflict is unindexed, deleting the conflict is a no-op on the index, the unknown-journal note is dropped, and all 28 burst notes index.

- [ ] **Step 4: Verify the vault-subscription suite still passes**

Run: `npm run test -- src/journals/vault-subscription.test.ts && npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/journals/sync-scenarios.test.ts src/journals/vault-subscription.ts
git commit -m "test(journals): add sync-scenario harness for conflict copies, unknown journals, and bursts"
```

---

### Task 4: Real external-settings-sync integrity e2e

**Files:**

- Create: `e2e/integration/sync-settings.e2e.ts`

**Interfaces:**

- Consumes: `readRawSettings`/`writeRawSettings`/`getSettings`/`journalKeysOf` from `e2e/support/plugin-data.ts`; `triggerExternalSettingsChange` from `e2e/support/plugin.ts`; `seedNote`/`waitForJournalFrontmatter` from `e2e/support/vault.ts`.

Exercises sync cell 8 end to end without touching plugin internals: an out-of-band data.json edit adds a second journal (cloned from the fixture's `daily` journal, differing only in name + folder), the plugin's real `onExternalSettingsChange` hook reloads and rebuilds, and the test asserts (a) the original journal entity survives the reload — not wiped to defaults — and (b) the newly-synced journal is live, attaching a foreign note under its folder.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/integration/sync-settings.e2e.ts`:

```ts
import { browser, expect } from "@wdio/globals";

import { getSettings, journalKeysOf, readRawSettings, writeRawSettings } from "../support/plugin-data.js";
import { triggerExternalSettingsChange } from "../support/plugin.js";
import { seedNote, waitForJournalFrontmatter } from "../support/vault.js";

// Obsidian Sync writes data.json on disk and calls onExternalSettingsChange, which runs
// SettingsService.reload() -> emits "reloaded" -> VaultSubscriptionService rebuilds against the
// fresh journals. We add a second journal out of band (cloned from the fixture's daily journal, so
// no schema is hand-authored), fire the hook, and assert both that the original journal survives
// the reload and that the synced-in journal is live (a foreign note under its folder auto-attaches).
// The fixture boot is a copy, so the disk edit is isolated to this run.
describe("external settings sync", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-daily", plugins: ["journals"] });
  });

  it("keeps the existing journal and activates a journal synced into data.json", async () => {
    const raw = (await readRawSettings()) ?? "{}";
    const settings = JSON.parse(raw) as {
      journals?: Record<string, Record<string, unknown>>;
    };
    const daily = settings.journals?.daily;
    if (!daily) throw new Error("fixture is missing the daily journal");

    settings.journals ??= {};
    settings.journals.diary = { ...daily, name: "diary", folder: "Diary" };
    await writeRawSettings(JSON.stringify(settings));
    await triggerExternalSettingsChange();

    // (a) the synced-in journal is live: a foreign note under its folder auto-attaches.
    await seedNote("Diary/2024-04-01.md", "");
    await waitForJournalFrontmatter("Diary/2024-04-01.md", { journal: "diary", date: "2024-04-01" });

    // (b) the reload did not wipe the original entity.
    const keys = journalKeysOf(await getSettings());
    expect(keys).toContain("daily");
    expect(keys).toContain("diary");
  });
});
```

- [ ] **Step 2: Confirm the journal `folder` field name against the schema**

Open `src/journals/config.ts` and confirm the journal config field that sets the note folder is `folder` (the unit `fixedJournal("daily", { type: "day" }, { folder: "Diary" })` override in `auto-attach.test.ts:74` uses `folder`). If the persisted key differs, use the persisted key in the clone. The cloned `diary` journal must resolve notes to `Diary/{{date}}.md` so `Diary/2024-04-01.md` matches it and not the root-level `daily`.

- [ ] **Step 3: Run the e2e spec**

Run: `npm run test:e2e -- --spec ./e2e/integration/sync-settings.e2e.ts`
(If the project's e2e script name differs, use the wdio invocation the other integration specs use — check `package.json` scripts; the config is `wdio.conf.mts`, suite `integration`.)
Expected: PASS — the synced `diary` journal attaches `Diary/2024-04-01.md`, and both journal keys remain in data.json.

- [ ] **Step 4: Verify lint/types for the spec**

Run: `npm run check:types && npm run check:lint -- e2e/integration/sync-settings.e2e.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/integration/sync-settings.e2e.ts
git commit -m "test(e2e): cover external settings-sync integrity and journal activation"
```

---

### Task 5: Report the sync-scenario matrix

**Files:**

- Modify: `docs/superpowers/specs/2026-07-16-sync-scenario-harness-design.md` (append a results section)

- [ ] **Step 1: Run the full suite and record outcomes**

Run: `npm run test && npm run check:types && npm run check:lint`
Then the e2e spec from Task 5.

- [ ] **Step 2: Append a results table**

Append a `## Results` section to the design doc mapping each scenario cell to its covering test and PASS/FAIL/covered-elsewhere status, and note any gap surfaced by Task 4 that was reported rather than fixed. Keep it to the 11-cell matrix.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-16-sync-scenario-harness-design.md
git commit -m "docs(sync): record the sync-scenario harness results matrix"
```
