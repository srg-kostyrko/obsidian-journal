# End-to-end testing strategy

How we introduce e2e tests that exercise the plugin inside a **real Obsidian
process** — the one seam our 299 mock-based unit/component tests structurally
cannot reach.

## Why e2e at all

Every existing test runs against `__mocks__/obsidian.ts` — a hand-written fake of
`App`/`Vault`/`Workspace`/`metadataCache`/`Modal`/`ItemView`. That fake is the
largest unverified assumption in the suite: it cannot reproduce real
`metadataCache` indexing lag (the unobservable async window `SelfWriteGuard`
exists to cover), real vault write/rename event ordering, Templater interop, real
view mounting in a workspace, or a real v1/v2 → v3 migration over an actual
`data.json`.

e2e exists to **test that seam, not the logic**. Domain logic stays covered by the
fast unit suite. We only spend a real Obsidian boot on things that genuinely
require one.

### Scope

All four are in scope, sequenced (see Roadmap):

- **(A) Integration boundary** — the plugin's contract with real Obsidian
  (metadataCache timing, vault events, command/view registration, settings
  round-trip).
- **(B) User journeys** — clicked-through flows (create a note → auto-attach →
  calendar renders → reopen, still correct).
- **(C) Migration** — real v1/v2 vaults upgrade to v3 without data loss.
- **(D) Interop** — real Templater coexistence (template parsing + cursor jump).
  There is no community-Calendar-plugin interop in v3, so "Calendar" is dropped
  from this slice.

## Decisions

### Runner — `wdio-obsidian-service`

WebdriverIO + `wdio-obsidian-service`, which downloads pinned Obsidian versions,
provisions vaults, installs the plugin, and runs headless under xvfb in CI. Chosen
over Playwright+Electron because the Obsidian-specific misery (multi-version
download, headless boot, vault provisioning) is already solved. Accepted cost: a
second test framework alongside Vitest/`@testing-library`.

> Verify on implementation: pin `wdio-obsidian-service` + Obsidian-version
> compatibility against our `obsidian@^1.12.3` API floor.

#### Install and version modes

Obsidian has **two independent version axes**, and we configure both per capability
in `wdio.conf`:

- **`appVersion`** — the self-updating JS bundle (set via `browserVersion` or
  `'wdio:obsidianOptions'.appVersion`).
- **`installerVersion`** — the Electron executable
  (`'wdio:obsidianOptions'.installerVersion`). The same app version on a different
  Electron can behave subtly differently; testing the combination is the point.

Both accept keyword modes: **`"latest"`**, **`"latest-beta"`**, **`"earliest"`**.
`appVersion: "earliest"` reads **`minAppVersion` directly from `manifest.json`** — so
the manifest stays the single source of truth for our floor; CI never hard-codes
`1.8.7`.

The plugin is installed via `'wdio:obsidianOptions'.plugins: ["./build"]` — a path
to our **fresh build output**, never a committed artifact.

#### CI binary cache

Downloaded Obsidian versions are cached in `cacheDir` (e.g. `.obsidian-cache`).
Cache it via `actions/cache` keyed on the version set, or every run re-downloads
Obsidian.

### WebdriverIO setup

- **Testrunner mode** (`wdio.conf.ts` + `wdio run`), not standalone/programmatic —
  the Obsidian service depends on the testrunner's service hooks.
- **Framework: Mocha** (over Jasmine and Cucumber).
  - vs **Jasmine**: we already chose `expect-webdriverio` for its auto-retrying
    matchers. Jasmine ships its own global `expect`, so the two shadow each other
    and you must track which matchers retry; with Mocha (no built-in assertions)
    `expect` is unambiguously `expect-webdriverio`. Jasmine's other strength —
    built-in spies — is irrelevant to a black-box, no-internals suite.
  - vs **Cucumber**: reuse is solved by typed helpers/Page Objects either way;
    Gherkin's binding layer only buys non-engineer-readable scenarios, and there is
    no such audience on a solo-maintained plugin. B journeys stay plain
    `describe/it`, BDD-named helpers if desired.
- **Assertions: `expect-webdriverio`** (from `@wdio/globals`). Its matchers
  auto-retry up to `waitforTimeout` — they **are** the condition-polling for DOM.
  Non-DOM conditions (vault file/frontmatter reads) poll via `browser.waitUntil`.
  Neither uses fixed sleeps.
- **No retries.** The suite runs in well under a minute and is held to zero
  tolerated flakiness, so a failure is a real signal we want to see immediately,
  not absorb behind a silent rerun. A test that can only pass on a second boot is a
  bug (test or plugin) to triage, or a candidate for the nightly-only `quarantine`
  lane — never a retry. (Earlier iterations used `specFileRetries: 1`; it masked
  more than it surfaced and is gone.)
- **Parallelism: `maxInstances: 1` to start.** Each instance is a full Obsidian
  boot under xvfb; "one shared Obsidian process" is therefore **per worker**.
  Revisit sharding only if nightly wall-clock forces it.
- **TypeScript, async-only** (v9 removed sync), explicit `@wdio/globals` imports
  (`browser`, `$`, `expect`) over injected globals — needs `@wdio/globals/types` +
  service types in an e2e `tsconfig`.
- **Reporters: `spec` + `junit`** — `spec` for console, `junit` so the
  retry/quarantine visibility is a CI artifact, not just scrollback.
- **Timeouts (starting points): `waitforTimeout` ~15s, `mochaOpts.timeout` ~60s**
  to absorb cold boots; tune down once real numbers exist.

#### Grouping and targeted runs

- **Grouping is via WDIO `suites`** — named groups of spec-file globs in the
  config, run with `--suite <name>`. One suite per slice plus a quarantine suite:

  ```js
  suites: {
    smoke:       ['./e2e/smoke/**/*.e2e.ts'],
    integration: ['./e2e/integration/**/*.e2e.ts'],  // slice A
    migration:   ['./e2e/migration/**/*.e2e.ts'],     // slice C
    interop:     ['./e2e/interop/**/*.e2e.ts'],       // slice D
    journeys:    ['./e2e/journeys/**/*.e2e.ts'],      // slice B
    quarantine:  ['./e2e/quarantine/**/*.e2e.ts'],
  }
  ```

  **PR and merge-to-main** name every stable suite (`--suite smoke --suite
integration --suite migration --suite interop --suite journeys`), omitting
  `quarantine`. **Nightly** runs the bare glob — all suites, including
  `quarantine` — across the OS + version matrix. Quarantining a flaky test = moving
  its file into the `quarantine` suite; it keeps running nightly and never blocks a
  merge — no separate mechanism needed.

- **Targeted dev runs:** `--spec ./path/or/pattern` for one file/pattern;
  `--mochaOpts.grep "<title>"` to filter by `describe`/`it` title across files.
- **`.only` gotcha:** `it.only` / `describe.only` does **not** reliably restrict a
  WDIO run (it doesn't pre-scan files) — unlike Vitest. Use `--spec` (+ `--grep`),
  not `.only`.

### Fixtures and isolation

- **Fixture template** — a starting-state vault checked into the repo. The catalog
  is small: `empty` (A/B), `legacy-v1` / `legacy-v2` (C), `with-templater` (D).
- **Vault instance** — the running copy a test mutates: a **fresh temp copy of the
  named template per spec file**. Copying is cheap (filesystem, milliseconds);
  the expensive thing is the Obsidian boot.
- **One shared Obsidian process per worker** (`maxInstances: 1` to start, so one
  process overall). Two run modes map onto this:
  - **`obsidianPage.resetVault(path)`** — updates vault files in place **without
    restarting**. The **default** between B/A tests; cheap.
  - **`browser.reloadObsidian({vault})`** — reboots with a fresh vault copy.
    **Reserved** for cold-start cases only: plugin activation (skeleton) and
    migration (C). The many B flows use `resetVault` and never reboot.
- **Never reuse the manual `test-vault/`.** It carries a committed, drifting plugin
  copy and unrelated plugins; it stays exactly as-is for hot-reload dev. e2e
  fixtures are dedicated, minimal, and carry no committed `main.js`.

### Asserting and triggering

- **Assert on vault state first.** After an action, read the `.md` files the plugin
  wrote (path, frontmatter, content). For a journal plugin this _is_ the
  user-observable contract. Slice A asserts the created note reaches the expected
  attach frontmatter; slice C asserts the upgraded `data.json` + notes.
- **DOM (via WebdriverIO) only where the render is the feature** — calendar view,
  decorations, modal contents in slice B.
- **No plugin-internals introspection** as an assertion surface (no reading
  `JournalsIndex`/service fields). The index is not the contract; the file it let
  you find is. Sole sanctioned exception: the skeleton's
  `enabledPlugins.has("journals")`, where activation genuinely is the contract.
- **Trigger via `executeCommandById` for A/C** (deterministic, outcome is the
  point); **trigger via real UI clicks for B** (the click path is the point).

### Waiting and flakiness budget

e2e is a **PR + merge gate**, so flakiness discipline is defined up front:

- **Condition polling only** (`browser.waitUntil(() => …observable outcome…)`).
  **No fixed sleeps.** For slice A this is mandatory: the metadataCache catch-up is
  async and unobservable-by-duration, so we poll vault state until it converges —
  faithfully reproducing the timing the mock fakes.
- **No retries** — a failure fails the run, full stop. Because the gate runs on
  every PR and every merge with zero retry cushion, a flaky test is felt
  immediately and triaged as a bug (test or plugin), not absorbed behind a rerun.
- **Nightly-only quarantine lane** — a test too flaky to stabilize moves to
  nightly with a tracking issue. It is not left flaking on the gate and not
  `.skip`-and-forgotten. Quarantine keeps coverage without eroding gate
  credibility. Mechanism: the `quarantine` WDIO suite (see Grouping and targeted
  runs) — nightly names it, the PR gate doesn't.
- **Bounded, descriptive per-condition timeouts** — fail with "waited 30s for note
  frontmatter to attach", not an anonymous suite-level timeout.

Throughline: flakiness is always **surfaced and triaged**, never absorbed.

### Build input

e2e always installs the **freshly built** `build/` output (`main.js` +
`manifest.json` + `styles.css`). `npm run build` is a prerequisite step of both the
local `test:e2e` script and the CI e2e job. **No committed plugin artifact** is
ever installed into an e2e fixture.

> Verify on implementation: confirm `npm run build` alone yields a loadable plugin
> (i18n/paraglide compile wired in), else run `compile:i18n && build`.

## Authoring conventions

1. **Seam-justification gate.** Every e2e test must fail the question "would this
   pass against `__mocks__/obsidian.ts`?" If it would pass against the mock, it is
   misfiled — move it to the unit suite. This is the test-level enforcement of
   "test the seam, not the logic" and the main guard against suite bloat.
2. **Build state the fast way; exercise only the behavior-under-test through its
   real trigger.** Seed preconditions via fixture vault + API (`app.vault.create`,
   `executeCommandById`), never by clicking through the UI. A journey needing five
   notes creates four via API and drives only the fifth through the UI when that
   creation is the point.
3. **One behavior per A/C/D test; journeys are the exception.** A/C/D tests assert
   a single behavior (a failure points to one cause). A B _journey_ is legitimately
   multi-step (create → auto-attach → calendar shows it → reopen → still there) and
   must not be shattered.
4. **Assert the contract, not a proxy.** When the contract is a file, `waitUntil`
   on its frontmatter — not on a DOM element being visible "because it's probably
   done by then." Proxies are where flakes live.
5. **Capture on failure.** An `afterTest` hook saves `browser.takeScreenshot()`
   (and relevant DOM) as a CI artifact. Headless CI flakes are near-undebuggable
   without it.
6. **Read vault state through `app.vault`, not node `fs`.** Assert what Obsidian
   sees in-process (post-metadataCache), not raw bytes on the temp dir — the bytes
   can run ahead of Obsidian's parsed view, which is exactly the timing slice A
   exists to test.
7. **Behavior-named tests, declarative specs.** Specs read as intent
   (`given/when/then` helpers); selector and timing mechanics live in the helper
   layer — plain functions, not page-object classes — never in the spec.

### Selectors (B slices)

Strict **role / text / ARIA** queries by default — for both Obsidian's own chrome
(ribbon, command palette, tabs) and our own view markup. This carries the
component-test convention (no test-only `data-*` attrs; query by role/text) across
to e2e.

**Escape hatch:** a stable `data-*` hook is permitted **only in our own view
components** (markup we control) and **only when role/text genuinely cannot pin the
element** — documented per use, not pre-sprinkled. Obsidian's chrome never gets a
hook (we don't own its markup); there, role/text/ARIA is the only option.

## Execution model

Three deliberate clocks:

| Clock               | Runs                                                                | Notes                                                              |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Local per-task gate | `test` / `check:types` / `check:lint`                               | **Unchanged** — mock-only and fast. e2e is _not_ in it.            |
| Local on-demand     | `npm run test:e2e`                                                  | A dev runs it when touching the integration seam. Never automatic. |
| CI                  | `pull_request` + `push` to `main` (full suite) + nightly `schedule` | Separate job, **not** wired into the every-push `checks.yml`.      |

The whole stable suite runs on **every PR and every merge to `main`** — it finishes
in well under a minute, so there is no longer a reason to split a thin smoke gate
from a fuller nightly pass. Both run `latest/latest` on Linux for a fast signal.

The nightly run is specifically the defense against **Obsidian** shipping a
breaking change under us — it can go red with zero code change. It is also the only
clock that exercises the **OS matrix** (Windows / macOS / Linux) and the
older-version combos, neither of which the per-PR fast path covers.

### Version matrix

Each entry is an `(appVersion, installerVersion)` pair (see Install and version
modes). `appVersion: earliest` resolves the manifest's `minAppVersion`;
`installerVersion: earliest` resolves to the **oldest installer still compatible
with that app version** — so `latest/earliest` is always a real, bootable combo,
never an impossible one. The PR/merge fast path runs one combo on Linux; nightly
multiplies the version combos below by the OS matrix (Windows / macOS / Linux).

| Clock      | OS              | appVersion | installerVersion | Catches                                                                                                                               |
| ---------- | --------------- | ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| PR + merge | Linux           | `latest`   | `latest`         | the common, modern case — fast merge signal                                                                                           |
| Nightly    | Win/macOS/Linux | `latest`   | `latest`         | the modern case re-confirmed on every OS                                                                                              |
| Nightly    | Win/macOS/Linux | `earliest` | `earliest`       | a contract test, not a real user — proves the advertised `minAppVersion` floor isn't a lie                                            |
| Nightly    | Win/macOS/Linux | `latest`   | `earliest`       | **the common real user**: Obsidian auto-updates the app but not the installer, so a long-time user runs today's JS on an old Electron |

**Beta / Insider** — deferred to phase two. Requires `OBSIDIAN_EMAIL` /
`OBSIDIAN_PASSWORD` as CI secrets **with 2FA disabled**, i.e. a dedicated bot
account, not a personal login. A real goal, not optional polish — drift-detection
is most of what nightly buys.

### Known limitation — desktop only

`manifest.json` sets `isDesktopOnly: false`, but Electron-based e2e only ever
exercises **desktop**. No e2e test validates mobile. Mobile stays covered by unit
tests + the manual testing checklist. A green e2e suite does **not** imply mobile
works.

## Roadmap

Sequenced by (value only-real-Obsidian can prove) ÷ (fixture/flakiness cost).
**Build each slice only after the previous is green in CI.**

0. **Walking skeleton (phase 1).** Boot Obsidian (latest stable), install the
   freshly built plugin into a throwaway `empty` fixture, assert
   `enabledPlugins.has("journals")`, tear down. Proves the _pipeline_, tests no
   plugin behavior.
1. **(A) Integration seam — note creation → auto-attach timing.** The mock's
   biggest lie. Minimal fixtures, highest "only real Obsidian can catch this"
   value.
2. **(C) Migration v1/v2 → v3.** High value; needs curated real legacy-vault
   fixtures.
3. **(D) Templater interop.** Requires installing the real Templater plugin into
   the fixture (community registry, pinned to a version compatible across the
   Obsidian matrix, enabled per-boot). v3 has no community-Calendar interop, so the
   slice is Templater-only. Cursor jump is gated behind Templater's
   `auto_jump_to_cursor` setting (the fixture enables it), matching v2 and
   Templater's own create-from-template flow — not a plugin bug.
4. **(B) Full click-through journeys.** Flakiest and slowest; rides on
   infrastructure the earlier slices hardened. Designed in
   `docs/e2e-slice-b-journeys.md` — real-DOM render across the view leaf, code
   blocks, decorations, and settings, decomposed by mount context. The full
   `journeys` suite runs on every PR and merge (it is fast enough), with the OS +
   version matrix layered on nightly.

### Phase 1 — definition of done

`wdio-obsidian-service` boots Obsidian (latest stable), installs the freshly-built
plugin into an `empty` fixture, asserts `enabledPlugins.has("journals")`, and tears
down — **green in a `pull_request` GitHub Actions job under xvfb**, with
`npm run test:e2e` running it locally. Zero plugin behavior tested yet. This is the
finish line that unblocks slices A→B.
