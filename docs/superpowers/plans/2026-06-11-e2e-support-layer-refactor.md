# E2E Support Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the existing A/C/D e2e support helpers around system surfaces (not test slices), collapse five duplicated pollers onto one primitive, and colocate slice-specific helpers — with zero behavior change.

**Architecture:** `e2e/support/` keeps only cross-slice surface drivers (`wait`, `vault`, `plugin-data`, `editor`, `commands`); migration-specific pollers move next to the migration specs in `e2e/migration/`. Every `waitFor*` helper becomes a thin wrapper over a single `waitForState` primitive. `support/migration.ts` and `support/templater.ts` — each several surfaces in a trench coat — are deleted. Slice B (the DOM surfaces: calendar factory, decorations, view, code-blocks) is **out of scope**; it is forward-looking design captured in `docs/e2e-slice-b-journeys.md`, not built here.

**Tech Stack:** WebdriverIO + `wdio-obsidian-service` (Mocha), TypeScript (ESM, `.js` import specifiers, `moduleResolution: bundler`). Gates: `npm run check:types` (`vue-tsc -b`, covers `e2e/**/*.ts` via `tsconfig.e2e.json`), `npm run check:lint` (`eslint .`), `npm run test:e2e` (builds plugin + boots real Obsidian).

**Verification model:** These are test-support helpers — they get **no tests of their own** (test infrastructure is not unit-tested in this repo). The existing e2e specs _are_ the regression net. Per-task fast gate = `check:types` + `check:lint` (catches every broken import/signature). Behavioral confirmation = one full `npm run test:e2e` at the end (it boots Obsidian and is slow/expensive, so it runs once, not per task). This is a behavior-preserving refactor: each new wrapper must produce the **same** observable wait as the function it replaces.

**Behavioral-equivalence watch-points** (the only places types/lint can't catch a regression — confirm by reading, and they are exercised by the final e2e run):

- `waitForState` guards `value !== undefined` _before_ calling the predicate. The originals used optional chaining (`fm?.journal === …`, `cursor?.line === …`) which also yields `false` when undefined — so the guard is equivalent (keeps polling until the value appears). Do not "simplify" the guard away.
- `waitForActiveNoteIn` must still capture the matched path into the outer `let path` and return it.

---

## File end-state

**Create:**

- `e2e/support/wait.ts` — the one polling primitive.
- `e2e/support/plugin-data.ts` — persisted `data.json` reads + interpreters (moved out of `migration.ts`).
- `e2e/support/editor.ts` — cursor / editor-value reads (moved out of `templater.ts`).
- `e2e/support/commands.ts` — `runCommand` (moved out of `templater.ts`).
- `e2e/migration/helpers.ts` — `waitForMigrated*` legacy-schema pollers, colocated with the migration specs.

**Modify:**

- `e2e/support/vault.ts` — absorb vault reads/pollers from `templater.ts` (`contentOf`, `activeNotePath`, `waitForActiveNoteIn`, `waitForContent`), add `waitForFrontmatter`, rewrite `waitForJournalFrontmatter` over it.
- `e2e/migration/legacy-upgrade.e2e.ts`, `e2e/migration/mid-session-enable.e2e.ts`, `e2e/interop/templater.e2e.ts` — repoint imports.

**Delete:**

- `e2e/support/migration.ts`, `e2e/support/templater.ts`.

**Unchanged:**

- `e2e/support/errors.ts` — both error classes stay in the shared errors module (per the repo's "errors live in errors.ts" rule; `FixtureFileMissingError` serves `vault`, `PluginDataMissingError` serves `plugin-data`).
- `e2e/integration/auto-attach.e2e.ts` — already imports only from `support/vault.js`; every name it uses stays in `vault.ts`.

---

## Task 1: The polling primitive

**Files:**

- Create: `e2e/support/wait.ts`

- [ ] **Step 1: Write `e2e/support/wait.ts`**

```ts
import { browser } from "@wdio/globals";

// One polling primitive behind every waitFor* helper: poll an async reader until
// it yields a defined value the predicate accepts. No fixed sleeps — real state
// (metadataCache catch-up, debounced saveData, the live editor) converges on its
// own clock, observable only by re-reading.
export async function waitForState<T>(
  read: () => Promise<T | undefined>,
  predicate: (value: T) => boolean,
  timeoutMsg: string,
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const value = await read();
      return value !== undefined && predicate(value);
    },
    { timeoutMsg },
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check:types`
Expected: exit 0, no errors.

- [ ] **Step 3: Lint**

Run: `npm run check:lint`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/support/wait.ts
git commit -m "test(e2e): add waitForState polling primitive"
```

---

## Task 2: Vault surface absorbs all vault reads and pollers

`vault.ts` becomes the home for every vault read/poll: its current contents plus `contentOf`/`activeNotePath`/`waitForActiveNoteIn`/`waitForContent` (lifted from `templater.ts`), plus a generic `waitForFrontmatter` that `waitForJournalFrontmatter` (and, later, the migration pollers) build on.

**Files:**

- Modify: `e2e/support/vault.ts` (full rewrite below)

- [ ] **Step 1: Replace the entire contents of `e2e/support/vault.ts`**

```ts
import { browser } from "@wdio/globals";

import { FixtureFileMissingError } from "./errors.js";
import { waitForState } from "./wait.js";

export type Frontmatter = Record<string, unknown>;

// A foreign create — not the plugin's own NoteCreationService — so the
// self-write guard does not suppress it and auto-attach genuinely fires.
export async function createNote(path: string, content = ""): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, notePath, body) => {
      await app.vault.create(notePath, body);
    },
    path,
    content,
  );
}

export async function renameNote(from: string, to: string): Promise<void> {
  // The TFile lookup must run in-browser, but the callback is stringified and
  // can't reach an imported error; report via sentinel and raise in Node.
  const renamed = await browser.executeObsidian(
    async ({ app, obsidian }, fromPath, toPath) => {
      const file = app.vault.getAbstractFileByPath(fromPath);
      if (!(file instanceof obsidian.TFile)) return false;
      await app.fileManager.renameFile(file, toPath);
      return true;
    },
    from,
    to,
  );
  if (!renamed) throw new FixtureFileMissingError(from);
}

// Reads what Obsidian has parsed (post-metadataCache), not raw bytes — the bytes
// can run ahead of Obsidian's view, which is exactly the timing the seam tests.
export function frontmatterOf(path: string): Promise<Frontmatter | undefined> {
  return browser.executeObsidian(({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) return;
    return app.metadataCache.getFileCache(file)?.frontmatter;
  }, path);
}

// Reads what Obsidian has parsed, not raw bytes — consistent with frontmatterOf.
// `async` outer: the callback is async, so a plain function infers Promise<Promise<…>>.
export async function contentOf(path: string): Promise<string | undefined> {
  return browser.executeObsidian(async ({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) return;
    return app.vault.cachedRead(file);
  }, path);
}

export function activeNotePath(): Promise<string | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path);
}

export function waitForFrontmatter(
  path: string,
  predicate: (frontmatter: Frontmatter) => boolean,
  timeoutMsg: string,
): Promise<void> {
  return waitForState(() => frontmatterOf(path), predicate, timeoutMsg);
}

export function waitForJournalFrontmatter(path: string, expected: { journal: string; date: string }): Promise<void> {
  return waitForFrontmatter(
    path,
    (frontmatter) => frontmatter.journal === expected.journal && frontmatter["journal-date"] === expected.date,
    `waited for ${path} to attach journal frontmatter (journal=${expected.journal}, journal-date=${expected.date})`,
  );
}

// A command opens today's note under the journal's folder. The date is "today" at
// run time, so we never predict the path — we wait for the active file to land
// under the expected folder, robust against any stale active file from boot.
export async function waitForActiveNoteIn(folder: string): Promise<string> {
  let path = "";
  await waitForState(
    activeNotePath,
    (active) => {
      path = active;
      return active.startsWith(`${folder}/`);
    },
    `waited for a journal note to open under ${folder}/`,
  );
  return path;
}

export function waitForContent(
  path: string,
  predicate: (content: string) => boolean,
  timeoutMsg: string,
): Promise<void> {
  return waitForState(() => contentOf(path), predicate, timeoutMsg);
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check:types`
Expected: exit 0. (`templater.ts` still defines its own copies of `contentOf`/`waitForActiveNoteIn`/`waitForContent` at this point — that is fine; they live in a different module and are deleted in Task 6.)

- [ ] **Step 3: Lint**

Run: `npm run check:lint`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add e2e/support/vault.ts
git commit -m "test(e2e): consolidate vault reads and pollers onto waitForState"
```

---

## Task 3: Plugin-data surface

Move the persisted-`data.json` reads and interpreters out of `migration.ts` into a surface module. `readSettings` stays module-private; `waitForSettingsVersion` becomes a `waitForState` wrapper.

**Files:**

- Create: `e2e/support/plugin-data.ts`

- [ ] **Step 1: Write `e2e/support/plugin-data.ts`**

```ts
import { browser } from "@wdio/globals";

import { PluginDataMissingError } from "./errors.js";
import { waitForState } from "./wait.js";

const PLUGIN_DATA_PATH = ".obsidian/plugins/journals/data.json";

export interface StoredSettings {
  version?: number;
  journals?: Record<string, { name?: string }>;
  shelves?: Record<string, { name?: string }>;
}

// Reads the persisted data.json the plugin wrote back via saveData — the
// user-observable contract, not plugin-internal state.
async function readSettings(): Promise<StoredSettings | undefined> {
  const raw = await browser.executeObsidian(async ({ app }, dataPath) => {
    if (!(await app.vault.adapter.exists(dataPath))) return;
    return app.vault.adapter.read(dataPath);
  }, PLUGIN_DATA_PATH);
  if (typeof raw !== "string") return undefined;
  return JSON.parse(raw) as StoredSettings;
}

export async function getSettings(): Promise<StoredSettings> {
  const settings = await readSettings();
  if (!settings) throw new PluginDataMissingError(PLUGIN_DATA_PATH);
  return settings;
}

export function journalNamesOf(settings: StoredSettings): string[] {
  return Object.values(settings.journals ?? {})
    .map((journal) => journal.name)
    .filter((name): name is string => typeof name === "string");
}

// Journals and shelves are stored keyed by name; the repositories resolve by
// storage[name]. A migration that re-keyed them by a generated id left every
// entity unreachable, so the keys themselves are the contract under test.
export function journalKeysOf(settings: StoredSettings): string[] {
  return Object.keys(settings.journals ?? {});
}

export function shelfKeysOf(settings: StoredSettings): string[] {
  return Object.keys(settings.shelves ?? {});
}

// Migration persists asynchronously (debounced saveData after the note walk
// clears its pending markers), so poll the stored version until it converges.
export function waitForSettingsVersion(version: number): Promise<void> {
  return waitForState(
    readSettings,
    (settings) => settings.version === version,
    `waited for ${PLUGIN_DATA_PATH} to migrate to version ${version}`,
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check:types`
Expected: exit 0. (`migration.ts` still has its own copies until Task 6 — fine.)

- [ ] **Step 3: Lint**

Run: `npm run check:lint`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add e2e/support/plugin-data.ts
git commit -m "test(e2e): add plugin-data surface for persisted data.json"
```

---

## Task 4: Editor and commands surfaces

The remaining two surfaces hidden inside `templater.ts`.

**Files:**

- Create: `e2e/support/editor.ts`
- Create: `e2e/support/commands.ts`

- [ ] **Step 1: Write `e2e/support/editor.ts`**

```ts
import { browser } from "@wdio/globals";

import { waitForState } from "./wait.js";

export interface EditorCursor {
  line: number;
  ch: number;
}

export function cursorOf(): Promise<EditorCursor | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getCursor());
}

// The live editor document — more current than vault.cachedRead after a cursor
// jump rewrites the open note in place.
export function editorValue(): Promise<string | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue());
}

export function waitForCursorLine(line: number, timeoutMsg: string): Promise<void> {
  return waitForState(cursorOf, (cursor) => cursor.line === line, timeoutMsg);
}
```

- [ ] **Step 2: Write `e2e/support/commands.ts`**

```ts
import { browser } from "@wdio/globals";

// `commands` is part of Obsidian's runtime but not its public typings (same shape
// as the smoke test's `plugins` cast).
export async function runCommand(commandId: string): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    const runtime = app as unknown as { commands: { executeCommandById(id: string): boolean } };
    runtime.commands.executeCommandById(id);
  }, commandId);
}
```

- [ ] **Step 3: Type-check**

Run: `npm run check:types`
Expected: exit 0.

- [ ] **Step 4: Lint**

Run: `npm run check:lint`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add e2e/support/editor.ts e2e/support/commands.ts
git commit -m "test(e2e): split editor and commands surfaces out of templater helper"
```

---

## Task 5: Colocated migration pollers

The only genuinely migration-domain helpers — they encode the legacy→new schema transition, so they live with the migration specs and build on `vault.waitForFrontmatter`.

**Files:**

- Create: `e2e/migration/helpers.ts`

- [ ] **Step 1: Write `e2e/migration/helpers.ts`**

```ts
import { waitForFrontmatter } from "../support/vault.js";

// Polls until the legacy note converges on the new schema: the new journal name
// and date field present, and the legacy section/start-date markers gone — a
// single convergence, so one observed end state proves the rewrite ran fully.
export function waitForMigratedNote(path: string, expected: { journal: string; date: string }): Promise<void> {
  return waitForFrontmatter(
    path,
    (frontmatter) =>
      frontmatter.journal === expected.journal &&
      frontmatter["journal-date"] === expected.date &&
      frontmatter["journal-section"] === undefined &&
      frontmatter["journal-start-date"] === undefined,
    `waited for ${path} to migrate to journal=${expected.journal} journal-date=${expected.date} (legacy markers cleared)`,
  );
}

// An interval note carries the legacy interval index, which the migration moves
// into the journal's configured index field (here the default `journal-index`)
// and drops the old key — a rewrite path the calendar notes never exercise.
export function waitForMigratedIntervalNote(
  path: string,
  expected: { journal: string; date: string; index: number },
): Promise<void> {
  return waitForFrontmatter(
    path,
    (frontmatter) =>
      frontmatter.journal === expected.journal &&
      frontmatter["journal-date"] === expected.date &&
      frontmatter["journal-index"] === expected.index &&
      frontmatter["journal-interval-index"] === undefined &&
      frontmatter["journal-start-date"] === undefined,
    `waited for ${path} to migrate to journal=${expected.journal} journal-index=${expected.index} (interval index moved, legacy markers cleared)`,
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check:types`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `npm run check:lint`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add e2e/migration/helpers.ts
git commit -m "test(e2e): colocate migration pollers with the migration specs"
```

---

## Task 6: Repoint spec imports and delete the dead slice-bag modules

With every helper now in its surface/colocated home, repoint the three consuming specs and delete `migration.ts` + `templater.ts`. (`e2e/integration/auto-attach.e2e.ts` needs no change — it already imports only from `support/vault.js`.)

**Files:**

- Modify: `e2e/migration/legacy-upgrade.e2e.ts:3-12`
- Modify: `e2e/migration/mid-session-enable.e2e.ts:4`
- Modify: `e2e/interop/templater.e2e.ts:3-11`
- Delete: `e2e/support/migration.ts`, `e2e/support/templater.ts`

- [ ] **Step 1: Rewrite the import block of `e2e/migration/legacy-upgrade.e2e.ts`**

Replace the two import statements (the `../support/migration.js` block and the `../support/vault.js` line) with:

```ts
import {
  getSettings,
  journalKeysOf,
  journalNamesOf,
  shelfKeysOf,
  waitForSettingsVersion,
} from "../support/plugin-data.js";
import { frontmatterOf } from "../support/vault.js";
import { waitForMigratedIntervalNote, waitForMigratedNote } from "./helpers.js";
```

- [ ] **Step 2: Rewrite the import block of `e2e/migration/mid-session-enable.e2e.ts`**

Replace `import { waitForMigratedNote, waitForSettingsVersion } from "../support/migration.js";` with:

```ts
import { waitForSettingsVersion } from "../support/plugin-data.js";
import { waitForMigratedNote } from "./helpers.js";
```

- [ ] **Step 3: Rewrite the import block of `e2e/interop/templater.e2e.ts`**

Replace the single `../support/templater.js` import with:

```ts
import { runCommand } from "../support/commands.js";
import { cursorOf, editorValue, waitForCursorLine } from "../support/editor.js";
import { contentOf, waitForActiveNoteIn, waitForContent } from "../support/vault.js";
```

- [ ] **Step 4: Delete the dead modules**

```bash
git rm e2e/support/migration.ts e2e/support/templater.ts
```

- [ ] **Step 5: Type-check (proves nothing still references the deleted modules)**

Run: `npm run check:types`
Expected: exit 0. A failure here means a missed import — fix the offending spec's import path.

- [ ] **Step 6: Lint**

Run: `npm run check:lint`
Expected: exit 0. (`import/order` may want the new import lines sorted — if eslint reports it, apply `npx eslint e2e --fix` and re-run.)

- [ ] **Step 7: Commit**

```bash
git add e2e/migration/legacy-upgrade.e2e.ts e2e/migration/mid-session-enable.e2e.ts e2e/interop/templater.e2e.ts e2e/support/migration.ts e2e/support/templater.ts
git commit -m "test(e2e): repoint specs to surface modules and drop slice-bag helpers"
```

---

## Task 7: Full behavioral verification

The refactor changed only test infrastructure; the existing specs are the proof it preserved behavior. Run them against real Obsidian.

**Files:** none.

- [ ] **Step 1: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: builds the plugin, boots Obsidian, all suites pass — `smoke`, `integration` (auto-attach), `migration` (legacy-upgrade + mid-session-enable), `interop` (templater). 0 failures.

If a suite hangs or fails on a wait, re-read the relevant wrapper against the watch-points in the header (the `value !== undefined` guard semantics; `waitForActiveNoteIn` returning the captured path) before changing timeouts — a behavior change in the primitive is the prime suspect, not flake.

- [ ] **Step 2: Final gate sweep**

Run: `npm run check:types && npm run check:lint`
Expected: both exit 0.

- [ ] **Step 3: Confirm the support directory matches the target shape**

Run: `ls e2e/support && echo '---' && ls e2e/migration`
Expected: `support/` contains `commands.ts editor.ts errors.ts plugin-data.ts vault.ts wait.ts` (no `migration.ts`, no `templater.ts`); `migration/` contains `helpers.ts` alongside the two `*.e2e.ts` specs.

---

## Self-review notes

- **Spec coverage:** Every helper in the three deleted/old modules has a destination — `vault` (creates/reads/frontmatter+content pollers), `plugin-data` (settings reads/interpreters/version poller), `editor` (cursor/value/line poller), `commands` (`runCommand`), `migration/helpers` (`waitForMigrated*`). The five duplicated `waitUntil` bodies all collapse onto `waitForState`. ✓
- **Type consistency:** `waitForFrontmatter` is defined in Task 2 and consumed in Task 5; `waitForState` defined in Task 1 and consumed in Tasks 2–4; `Frontmatter` type stays exported from `vault.ts`. Names used in spec imports (Task 6) match the exports created in Tasks 2–5. ✓
- **Out of scope (intentional):** the calendar root-bound factory, `decorations`, `view`, and `code-blocks` helpers are slice B — designed in `docs/e2e-slice-b-journeys.md`, built when slice B is built, not here. ✓
