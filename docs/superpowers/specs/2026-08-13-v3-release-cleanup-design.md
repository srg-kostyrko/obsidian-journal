# v3 release cleanup — design

Date: 2026-08-13
Branch: `v3-ai`

Pre-release housekeeping: drop the v2 reference tree and the finished planning
docs, rewrite version-anchored code comments as version-free rationale, and
bring the user-facing documentation up to what v3 actually ships.

Release mechanics are **out of scope**. `manifest.json` still reads `2.1.10`
and `CHANGELOG.md` still has an unpromoted `[Unreleased]`; both belong to
`docs/releasing.md` and stay untouched here.

## The two meanings of "v2"

The repo uses `v2` in two unrelated senses, and conflating them would break
working code:

1. **Plugin release v2** — the pre-rewrite plugin. Historical. This is what the
   comment pass genericizes.
2. **Settings-config schema version 2** — a step in the live migration chain
   `v1-to-v2.ts` → `v2-to-v3.ts` → `v3-to-v4.ts`. These filenames, their
   `v1ToV2Migration` / `v2ToV3Migration` / `v3ToV4Migration` exports, the
   `legacy-v1` / `legacy-v2` e2e fixtures, and the manual checklist's §16 rows
   are **current shipping API**. Schema v4 is what plugin v3 writes.

Everything under `src/settings/legacy/**`, `e2e/migration/**`, and
`e2e/fixtures/legacy-v*` is therefore carved out of the comment pass entirely
(~41 sites). A comment there saying "a v2 vault can carry `end.type` date with
no date" is identifying a config shape, not recalling history.

## 1. Deletions

| Target                                    | Scale             | Justification                                                                                                                                                                                                                              |
| ----------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/_old-code/`                          | 193 files, 1.1 MB | The v2 source, kept as a porting reference. The identical tree is the live `src/` on `main`, and it is already excluded from `tsconfig.app.json`, `vitest.config.mts`, and `eslint.config.mjs` — it compiles, tests, and lints as nothing. |
| `docs/2026-06-01-v2-v3-feature-gaps.md`   | ~1000 L           | Seven-pass gap audit, closed. Its premise is "v2 reference code lives in `src/_old-code/`".                                                                                                                                                |
| `docs/e2e-slice-b-journeys.md`            | 316 L             | Design for the journeys suite. Opens with "the `journeys` suite is registered in `wdio.conf.mts` but empty, and there is no `e2e/journeys/` dir" — there are now 30.                                                                       |
| `docs/e2e-slice-b-build-order.md`         | 161 L             | Sequencing plan for the same delivered work.                                                                                                                                                                                               |
| `docs/2026-07-13-changelog-generation.md` | 141 L             | Design for the `/changelog` command, shipped; `git-cliff` already retired.                                                                                                                                                                 |

Deleting `_old-code` also removes its ignore entries: 5 globs in
`eslint.config.mjs` (lines 63, 356, 369, 382, 389), 1 in `tsconfig.app.json`,
and 3 in `vitest.config.mts`. Leaving them would leave nine references to a
path that no longer exists.

Consequence worth noting: all 6 remaining `TODO` comments in the repository
live in `_old-code`, so the tree goes to zero.

## 2. Comment pass

**Scope:** ~71 comment sites in production `src/` and ~40 in `src/**/*.test.ts`,
excluding the carve-out above.

**Rule:** every comment keeps its _why_ and loses its version anchor. These are
`WHY`-comments justifying non-obvious behavior — the kind the no-WHAT-comments
convention exists to protect. Deleting the rationale is not an option; only the
`v2` reference goes.

```diff
- // v2 order: arithmetic shifts first, then boundary
+ // Arithmetic shifts apply before boundary snapping, so `+1d|endOfWeek` means
+ // "the end of next day's week", not "tomorrow's end-of-week".

- // 0 is unreachable: offsets are 1-based from both ends. v2's default stored it anyway.
+ // 0 is unreachable — offsets are 1-based from both ends — but it is accepted
+ // rather than rejected, since existing configs carry it.
```

Where a reason genuinely cannot stand without the historical anchor, it gets a
neutral one (`// Matches the pre-rewrite behavior, which existing configs and
templates still assume`) rather than being dropped.

In test files the same applies to `describe`/`it` labels, which is what the
behavior-naming convention wants regardless: `it("applies arithmetic before
boundary in v2 order")` and `describe("inherited v2 limitations")` are named
after history rather than behavior.

Also in scope: `src/styles.css:4` asserts "the `styles.css` at the repo root is
a v2 leftover". No root `styles.css` exists, tracked or untracked — that clause
is deleted, and the surrounding sentence about `build/styles.css` being what
the release ships stays.

## 3. Documentation

### README — full coverage pass

The README describes a v2-era feature set. Confirmed gaps against shipped code
and the `[Unreleased]` changelog:

**Undocumented, shipping:**

- `calendar-nav` and `interval-nav`, both live aliases of `journal-nav`
  (`src/code-blocks/nav/nav-block.ts:7`); only `journal-nav` is documented.
- The `markdown-template` block for custom views
  (`src/views/blocks/markdown-template/`).
- Vault-wide and shelf-scoped decorations — the README frames every decoration
  as belonging to a journal.
- The cell decoration breakdown (right-click) and the decoration inspector.
- Auto-attach of externally created notes matching a journal's naming.
- The variable-reference and code-block-reference modals in settings.
- Ten translated UI locales.
- Stable CSS class names for theming.

**Wrong as written:**

- L176 — "`Calendar` community plugin … does not have all the features of
  calendar plugin as of now, but will gradually catch up." v3 has no
  community-Calendar interop and its own composable views; this reads as a
  standing promise it does not intend to keep.
- L196 — the `{{date}}` bullet demonstrates its own formatting with
  `{{start_date:format}}`, a copy-paste error.
- L196 — describes the week exception as `{{date}}` being "set to end of week".
  The actual rule (`NotePathService.contextFor`, `note-path.ts:120-121`) is that
  `{{date}}` renders the period's _representative_ day: for weeks, the day whose
  calendar year equals the week-year. The stored anchor is the week's first day.
- L199 — `{{index}}` is presented as a fixed variable for interval journals.
  Numbering sources are user-named (`config.numbering.sources[].variable`);
  `index` is a default name, not the only one.
- L155-158 — "Block Types: Navigation block / Calendar view block" predates
  views being composed from blocks and toolbar items.

Every remaining claim in the Settings, Supported variables, and Supported code
blocks sections is verified against source during the pass rather than assumed
correct; the list above is what an initial read already confirmed, not a
completed audit.

### Other docs

- **`docs/e2e-testing-strategy.md`** — keeps its thesis, loses its stale facts:
  "299 mock-based unit/component tests" (actual: 3518 tests across 359 files),
  and slices A–D described as forthcoming when all four are delivered
  (11 integration, 30 journeys, 2 migration, 1 interop, 1 smoke).
- **`docs/architecture.md`** — drop `src/_old-code/**` from the naming-rule
  exclusion list (L33); repair the further-reading list.
- **`CONTEXT.md`** — 6 version-anchored references get the §2 treatment. L403's
  "legacy v2 aliases — `journal-nav`/`calendar-nav`/`interval-nav`" stays in
  substance: those aliases are live, so the note is reworded to say so rather
  than removed.
- **`CONTRIBUTING.md`** — repair the further-reading list (L146-152), which
  points at docs deleted in §1.
- **`docs/manual-testing-checklist-v3.md`** — commit the pending ticks already
  in the working tree (auto-attach rename/ambiguous, and the §16 migration
  rows). Rename to `manual-testing-checklist.md` and drop the `Branch: v3-ai`
  header so it survives as the standing manual pass rather than reading as a
  one-off. Its §16 `v1→v2→v3→v4` vocabulary is carved out and stays verbatim.

## 4. Verification

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Deleting `_old-code` changes the vitest project globs, the tsconfig exclude,
and five eslint ignores at once, so a green run is the evidence that those
exclusions were load-bearing for nothing else.

No e2e run: nothing here alters runtime behavior. Comment and documentation
edits cannot change a rendered surface, and the deleted tree was never
compiled.

## Risks

- **A comment loses meaning in translation.** The mitigation is that the
  rewrite is per-site with the code in view, not a regex. A site whose reason
  does not survive gets the neutral fallback rather than a guess.
- **The carve-out leaks.** A blanket search-and-replace would rename live
  migration API. The pass is explicitly restricted by path, and
  `npm run check:types` catches any identifier that moved.
- **README overreach.** The pass documents what ships; it does not redesign the
  document's structure or rewrite prose that is still accurate.
