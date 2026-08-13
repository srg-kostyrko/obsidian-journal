# v3 Release Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the v2 reference tree and finished planning docs, rewrite the 124 version-anchored code comments as version-free rationale, and bring the user-facing documentation up to what v3 actually ships.

**Architecture:** Three independent workstreams — deletions (Tasks 1–2), a per-area comment pass (Tasks 3–8), and documentation (Tasks 9–12). No runtime behavior changes anywhere in this plan; the existing 3518-test suite is the regression gate, and no test is added or modified except to rename version-anchored `describe`/`it` labels.

**Tech Stack:** TypeScript, Vue 3 SFCs, Vitest, ESLint, `vue-tsc`. Repo uses **npm**, not pnpm.

## Global Constraints

- **Verification command (run at the end of every task):**
  `npm run check:types && npm test && npm run check:lint && npm run check:i18n`
- **Baseline, established before any change:** 3518 tests across 359 test files, all passing. Any task ending with a different pass count (other than the file-count drop in Task 1) is a failure, not a new baseline.
- **No e2e run.** Nothing in this plan alters runtime behavior.
- **HARD CARVE-OUT — never edit these paths in Tasks 3–8:** `src/settings/legacy/**`, `e2e/migration/**`, `e2e/fixtures/legacy-v*`. Their `v1-to-v2` / `v2-to-v3` / `v3-to-v4` names are live shipping API, where "v2" identifies a settings-config schema shape, not the old plugin. Schema v4 is what plugin v3 writes.
- **Never use a regex or `sed` for the comment pass.** Every site is rewritten by hand with the surrounding code in view. A blanket replace would rename live migration identifiers.
- **Comment rule:** keep the _why_, drop the version anchor. These are WHY-comments justifying non-obvious behavior. Deleting the rationale is never correct — only the `v2` reference goes. Where a reason cannot stand without the historical anchor, use the neutral fallback: `// Matches the pre-rewrite behavior, which existing configs and templates still assume.`
- **No `eslint-disable` comments**, ever. Fix the code instead.
- **Commit messages:** conventional commits, no `Co-Authored-By` trailer. Commit to the current branch (`v3-ai`); never create a branch.
- **Out of scope:** `manifest.json` (still `2.1.10`), `manifest-beta.json`, `versions.json`, and promoting `CHANGELOG.md`'s `[Unreleased]`. These belong to `docs/releasing.md`.

---

### Task 1: Delete the v2 reference tree

**Files:**

- Delete: `src/_old-code/` (193 files)
- Modify: `eslint.config.mjs` lines 63, 356, 369, 382, 389
- Modify: `tsconfig.app.json:4`
- Modify: `vitest.config.mts` lines 29, 30, 40
- Modify: `docs/architecture.md:33`

**Interfaces:**

- Consumes: nothing.
- Produces: a repo with zero `TODO` comments and no `src/_old-code` path references. Task 2 relies on `src/_old-code/` being gone when it deletes the gap-audit doc that cites it.

- [ ] **Step 1: Confirm nothing outside the ignore configs references the tree**

```bash
grep -rn "_old-code" --exclude-dir=node_modules --exclude-dir=.git . \
  | grep -v "^./src/_old-code/" \
  | grep -v "^./docs/superpowers/"
```

Expected: exactly nine lines — five in `eslint.config.mjs`, one in `tsconfig.app.json`, three in `vitest.config.mts`. If anything else appears, stop and report it; the deletion is not safe as planned.

- [ ] **Step 2: Delete the tree**

```bash
git rm -r --quiet src/_old-code
```

- [ ] **Step 3: Remove the ignore entry from `tsconfig.app.json`**

The `exclude` array on line 4 currently reads:

```json
  "exclude": ["src/**/__tests__/*", "__mocks__/**/*", "src/_old-code/**/*"],
```

Change it to:

```json
  "exclude": ["src/**/__tests__/*", "__mocks__/**/*"],
```

- [ ] **Step 4: Remove the three ignore entries from `vitest.config.mts`**

Line 29 — drop `"src/_old-code/**"` from the array, leaving:

```ts
          exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.isolated.test.ts"],
```

Line 30 — drop it from the benchmark exclude, leaving:

```ts
          benchmark: { include: ["src/**/*.bench.ts"], exclude: ["**/node_modules/**"] },
```

Line 40 — drop it, leaving:

```ts
          exclude: ["**/node_modules/**", "**/dist/**"],
```

- [ ] **Step 5: Remove the five ignore entries from `eslint.config.mjs`**

At each of lines 63, 356, 369, 382, 389, remove only the `"src/_old-code/**"` array element and its trailing comma. Do not remove the surrounding config objects — lines 356, 369, and 382 carry other entries (`"src/**/ui/**"`, `"src/**/flows/**"`, `"**/*.test.ts"`, `"**/*.bench.ts"`, `"src/i18n/paraglide/**"`) that must stay.

Line 63 sits in a top-level `ignores` array; after removing the element, if that array is left empty, delete the whole config object rather than leaving `ignores: []`.

Line 389's config object may be left with an empty `ignores` array — if so, delete the `ignores` key entirely, keeping the rest of the object.

- [ ] **Step 6: Remove the exemption from `docs/architecture.md:33`**

The kebab-case filename rule lists the tree as exempt. It currently reads:

```markdown
- `src/**/*.ts` filenames are kebab-case; `src/**/*.vue` filenames are
  PascalCase. `**/*.test.ts`, `**/*.bench.ts`, `src/_old-code/**`, and
  `src/i18n/paraglide/**` are exempt and may use either case — a test file
```

Change to:

```markdown
- `src/**/*.ts` filenames are kebab-case; `src/**/*.vue` filenames are
  PascalCase. `**/*.test.ts`, `**/*.bench.ts`, and `src/i18n/paraglide/**`
  are exempt and may use either case — a test file
```

Leave the rest of the bullet (the `UiCollapsibleBlock` example) intact.

- [ ] **Step 7: Verify the tree is gone and no TODOs remain**

```bash
test ! -d src/_old-code && echo "tree gone"
grep -rnE "TODO|FIXME|HACK|XXX" src/ e2e/ scripts/ | wc -l
```

Expected: `tree gone`, then `0`.

- [ ] **Step 8: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: types clean, **3518 tests across 359 files passing** (the deleted tree was never collected, so the count is unchanged), lint clean, i18n clean.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: drop the v2 reference tree and its ignore entries"
```

---

### Task 2: Delete the finished planning docs

**Files:**

- Delete: `docs/2026-06-01-v2-v3-feature-gaps.md`
- Delete: `docs/e2e-slice-b-journeys.md`
- Delete: `docs/e2e-slice-b-build-order.md`
- Delete: `docs/2026-07-13-changelog-generation.md`
- Modify: `CONTRIBUTING.md:146-152`
- Modify: `docs/architecture.md:187-197`

**Interfaces:**

- Consumes: Task 1's deletion of `src/_old-code/` (the gap audit's premise).
- Produces: a `docs/` tree where every remaining file describes the current codebase. Task 11 edits `docs/e2e-testing-strategy.md`, which survives and must keep its links valid.

- [ ] **Step 1: Find every inbound link to the four docs**

```bash
grep -rn "2026-06-01-v2-v3-feature-gaps\|e2e-slice-b-journeys\|e2e-slice-b-build-order\|2026-07-13-changelog-generation" \
  --exclude-dir=node_modules --exclude-dir=.git .
```

Record the hits. Every one outside `docs/superpowers/` must be repaired in this task; a dangling link is a task failure.

- [ ] **Step 2: Delete the four docs**

```bash
git rm --quiet docs/2026-06-01-v2-v3-feature-gaps.md \
               docs/e2e-slice-b-journeys.md \
               docs/e2e-slice-b-build-order.md \
               docs/2026-07-13-changelog-generation.md
```

- [ ] **Step 3: Repair the further-reading lists**

In `CONTRIBUTING.md` (around lines 146-152) and `docs/architecture.md` (around lines 187-197), remove any bullet pointing at a deleted file. Leave the bullets for `CONTEXT.md`, `docs/architecture.md`, `docs/e2e-testing-strategy.md`, `docs/releasing.md`, `docs/i18n-glossary.md`, and `docs/superpowers/` — all of those survive.

Note `CONTRIBUTING.md:103` mentions `docs/i18n-glossary.md`, which survives; do not touch it.

- [ ] **Step 4: Verify no dangling links remain**

Re-run the Step 1 grep. Expected: hits only under `docs/superpowers/` (historical specs and this plan), which are allowed to name deleted files as history.

- [ ] **Step 5: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: unchanged — 3518 tests across 359 files.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: remove planning docs for delivered work"
```

---

## Tasks 3–8: The comment pass

These six tasks share one procedure and differ only in which files they cover. **Read this preamble before starting any of them.**

**The rule.** Each site keeps its reasoning and loses its version anchor. Work from the code, not from the comment text alone: the comment explains why the code below it is shaped the way it is, and the rewrite must still explain that.

**Worked examples** (drawn from real sites in this repo):

```diff
  # src/templates/modifiers.ts:39
- // v2 order: arithmetic shifts first, then boundary
+ // Shifts apply before boundaries regardless of written order, so
+ // {{date<endOf=week>+1d}} is the end of tomorrow's week, not the day after
+ // this week's end.
```

Note what makes that rewrite correct: it cites **real** template syntax
(`<endOf=week>`, per `src/templates/grammar.ts:4` — there is no `|` separator
or `endOfWeek` spelling), and its contrast is a genuine one. `applyModifiers`
partitions shifts from boundaries and runs every shift first, so written order
does not matter — which is exactly the non-obvious fact the comment exists to
record. **Check any syntax you put in a comment against the grammar before you
write it.**

```diff
  # src/decorations/config.ts:194
- // 0 is unreachable: offsets are 1-based from both ends. v2's default stored it anyway.
+ // 0 is unreachable — offsets are 1-based from both ends — but it is accepted rather
+ // than rejected, since existing configs carry it.
```

```diff
  # src/journals/notes/template-content.ts:44
- // An empty template falls through to the next candidate (v2's truthy check);
- // only a template with content wins the slot.
+ // An empty template falls through to the next candidate; only a template with
+ // content wins the slot.
```

```diff
  # src/code-blocks/nav/link-targets.ts:14
- // journal, matching v2's all-journals fallback.
+ // journal, falling back to all journals rather than to an empty set.
```

**When the reason will not survive.** Some comments record a deliberate bug-compatibility choice whose only justification _is_ the old behavior. Use the neutral fallback rather than inventing a technical reason:

```diff
  # src/templates/format-regex.ts:3
- // Locale data is captured at module-import time, matching v2 behavior. Plugin load
+ // Locale data is captured at module-import time, which existing templates still
+ // assume. Plugin load
```

**Test files.** The same rule covers `describe`/`it` labels, which must name behavior rather than history:

```diff
  # src/templates/modifiers.test.ts:26
- it("applies arithmetic before boundary in v2 order", () => {
+ it("applies arithmetic shifts before boundary snapping", () => {
```

```diff
  # src/templates/format-regex.test.ts:109
- describe("inherited v2 limitations", () => {
+ describe("format tokens it cannot round-trip", () => {
```

**Per-task procedure** (identical for Tasks 3–8):

1. Run the task's listed grep to see its sites.
2. For each site, open the file, read the surrounding code, and rewrite the comment by hand.
3. Re-run the grep — expected: no output.
4. Run `npm run check:types && npm test && npm run check:lint && npm run check:i18n`.
5. Commit.

**Why there is no new test.** These are comment and test-label edits. They cannot change behavior, so a new test would assert nothing. The existing suite is the regression gate: it must stay at 3518 passing, and any drop means a comment edit accidentally touched code.

---

### Task 3: Comment pass — templates and calendar (16 sites)

**Files:**

- Modify: `src/templates/engine.test.ts` (6), `src/templates/format-regex.test.ts` (3), `src/templates/context.ts` (1), `src/templates/engine.ts` (1), `src/templates/modifiers.ts` (1), `src/templates/modifiers.test.ts` (1), `src/templates/format-regex.ts` (1)
- Modify: `src/calendar/relative-date.ts` (1), `src/calendar/relative-date.test.ts` (1)

**Interfaces:**

- Consumes: the shared procedure and rule above.
- Produces: nothing other tasks depend on. Tasks 3–8 are mutually independent and may run in any order or in parallel.

- [ ] **Step 1: List the sites**

```bash
grep -rnE "\bv2\b|version 2\b" src/templates/ src/calendar/
```

Expected: 16 lines.

- [ ] **Step 2: Rewrite each site by hand**

Apply the rule from the preamble. Known shapes in this group:

- `src/templates/context.ts:22` — explains case-insensitive variable lookup. The reason ("numbering source names are user-authored and unique only case-sensitively") survives on its own; drop the sentence comparing the two matching regimes.
- `src/templates/engine.ts:47` — "modifiers and `:format` are only meaningful on date/clock kinds" is already the reason; drop the `v2 fidelity:` prefix.
- `src/templates/modifiers.ts:39` — use the worked example above.
- `src/templates/format-regex.ts:3` — use the neutral-fallback example above.
- `src/calendar/relative-date.ts:39` — the ±(2-6) day window for named-weekday phrasing is the reason; state it as the rule rather than as a match to an older one.
- `src/templates/format-regex.test.ts:109-110` — `describe("inherited v2 limitations")` and a `(v2 parity)` test name; both get behavior names.

- [ ] **Step 3: Verify no sites remain**

```bash
grep -rnE "\bv2\b|version 2\b" src/templates/ src/calendar/
```

Expected: no output.

- [ ] **Step 4: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: 3518 tests across 359 files passing.

- [ ] **Step 5: Commit**

```bash
git add src/templates src/calendar
git commit -m "docs(templates): state comment rationale without version references"
```

---

### Task 4: Comment pass — journals (20 sites)

**Files:**

- Modify: `src/journals/numbering.ts` (2), `src/journals/notes/template-content.ts` (2), `src/journals/notes/note-path.ts` (2), `src/journals/notes/note-connection.ts` (2), `src/journals/timeline.ts` (1), `src/journals/frontmatter.ts` (1), `src/journals/cycle.ts` (1), `src/journals/cycle.test.ts` (1), `src/journals/flows/open-date.flow.ts` (1), `src/journals/flows/open-date.flow.test.ts` (1), `src/journals/settings/flows/edit-sequence-property.flow.ts` (1), `src/journals/settings/flows/edit-frontmatter-field.flow.ts` (1), `src/journals/notes/note-connection-commands.ts` (1), `src/journals/notes/auto-create.ts` (1), `src/journals/notes/bulk-add/format-to-regexp.ts` (1), `src/journals/notes/bulk-add/ui/ConfigureBulkAddModal.vue` (1)

**Interfaces:**

- Consumes: the shared procedure and rule above.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: List the sites**

```bash
grep -rnE "\bv2\b|version 2\b" src/journals/
```

Expected: 20 lines. **`src/settings/legacy/` is a different directory and is not in scope** — this grep cannot reach it.

- [ ] **Step 2: Rewrite each site by hand**

Known shapes in this group:

- `src/journals/numbering.ts:51` and `:113` — both explain numbering anchor derivation; the mechanism is the reason, so drop the `v2 parity:` prefix and keep the sentence.
- `src/journals/frontmatter.ts:119` — "an end equal to the auto-derived period end is redundant metadata" stands alone.
- `src/journals/notes/note-path.ts:65` and `:137` — filename render order, and an unresolved numbering variable rendering empty rather than leaking the literal token.
- `src/journals/notes/note-connection.ts:80` and `:136` — best-effort settle semantics, and period-metadata transfer on override.
- `src/journals/notes/bulk-add/format-to-regexp.ts:12` — reading the undocumented `_config` for the ordinal parse pattern. Keep "undocumented"; that is the actual warning.
- `src/journals/notes/auto-create.ts:40` — the boot-time vault-walk ordering. Keep the ordering reason.
- `src/journals/cycle.ts:282` — mentions "a v2 config" as a source of a mid-period anchor. Reword to "a migrated config", which is what it means.

- [ ] **Step 3: Verify no sites remain**

```bash
grep -rnE "\bv2\b|version 2\b" src/journals/
```

Expected: no output.

- [ ] **Step 4: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: 3518 tests across 359 files passing.

- [ ] **Step 5: Commit**

```bash
git add src/journals
git commit -m "docs(journals): state comment rationale without version references"
```

---

### Task 5: Comment pass — code blocks (25 sites)

**Files:**

- Modify: `src/code-blocks/home/home-config.test.ts` (6), `src/code-blocks/home/home-config.ts` (4), `src/code-blocks/timeline/timeline-config.test.ts` (2), `src/code-blocks/nav/ui/NavigationCodeBlock.vue` (2), `src/code-blocks/fence-record.ts` (2), `src/code-blocks/home/ui/HomeCodeBlock.vue` (1), `src/code-blocks/timeline/ui/TimelineMonth.vue` (1), `src/code-blocks/timeline/ui/TimelineMonth.isolated.test.ts` (1), `src/code-blocks/nav/ui/NavBlock.vue` (1), `src/code-blocks/nav/nav-row-context.ts` (1), `src/code-blocks/nav/nav-config.ts` (1), `src/code-blocks/nav/nav-config.test.ts` (1), `src/code-blocks/nav/link-targets.ts` (1), `src/code-blocks/nav/decoration-scopes.ts` (1)

**Interfaces:**

- Consumes: the shared procedure and rule above.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: List the sites**

```bash
grep -rnE "\bv2\b|version 2\b" src/code-blocks/
```

Expected: 25 lines.

- [ ] **Step 2: Rewrite each site by hand**

This group is dense with degradation rules — a malformed fence value falls back rather than erroring. In every such comment the fallback _is_ the reason; the version reference only says who else did it.

- `src/code-blocks/fence-record.ts:3` and `:10` — non-mapping bodies degrade to an empty record; bare-word scalars coerce to their string form.
- `src/code-blocks/home/home-config.ts:17`, `:19`, `:31`, `:42` — invalid `show` entries filtered, a non-array degrading, `separator` defaulting to `•`, `scale` coercing 0 to 1.
- `src/code-blocks/nav/decoration-scopes.ts:3`, `src/code-blocks/nav/ui/NavBlock.vue:9`, and `src/code-blocks/nav/ui/NavigationCodeBlock.vue:89`, `:104` — the two nav decoration scopes (whole-block = current journal, per-row = same-write-type journals in shelf scope). **This split is deliberate and tested — describe it as the current rule, not as an inherited quirk.**
- `src/code-blocks/nav/link-targets.ts:14` — use the worked example above.
- `src/code-blocks/nav/nav-row-context.ts:30` — relative-period phrasing. The comment ends "— v2 parity, minus v2's ..."; keep the _difference_ it records, phrased as what v3 does.

- [ ] **Step 3: Verify no sites remain**

```bash
grep -rnE "\bv2\b|version 2\b" src/code-blocks/
```

Expected: no output.

- [ ] **Step 4: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: 3518 tests across 359 files passing.

- [ ] **Step 5: Commit**

```bash
git add src/code-blocks
git commit -m "docs(blocks): state comment rationale without version references"
```

---

### Task 6: Comment pass — decorations and notes-calendar (18 sites)

**Files:**

- Modify: `src/decorations/engine-checks.test.ts` (3), `src/decorations/resolve-cell.ts` (1), `src/decorations/config.ts` (1), `src/decorations/config.test.ts` (1), `src/decorations/engine.test.ts` (1), `src/decorations/style-slots.test.ts` (1), `src/decorations/settings/ui/ConditionProperty.vue` (1)
- Modify: `src/notes-calendar/ui/NotesCalendarCell.vue` (3), `src/notes-calendar/cell-format.test.ts` (2), `src/notes-calendar/ui/NotesMonthView.vue` (1), `src/notes-calendar/ui/NotesMonthView.test.ts` (1), `src/notes-calendar/ui/NotesCalendarCell.test.ts` (1), `src/notes-calendar/appearance/use-appearance-style.ts` (1)

**Interfaces:**

- Consumes: the shared procedure and rule above.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: List the sites**

```bash
grep -rnE "\bv2\b|version 2\b" src/decorations/ src/notes-calendar/
```

Expected: 18 lines. Note three of these are inside CSS comments in `.vue` `<style>` blocks (`NotesCalendarCell.vue:63`, `:73`, `:81`) — same rule applies.

- [ ] **Step 2: Rewrite each site by hand**

- `src/decorations/config.ts:194` — use the worked example above.
- `src/decorations/resolve-cell.ts:180` — a decoration must not inflate its own grid row. The parenthetical names how the older calendar kept rows aligned; the constraint stands without it.
- `src/decorations/settings/ui/ConditionProperty.vue:69` — existence checks take no operand, so the value input is hidden. Self-justifying; drop the trailing "(v2 hid it too)".
- `src/notes-calendar/ui/NotesCalendarCell.vue:63` — "26px is v2's cell line-height; it is a floor, not a fixed row". Keep the floor-not-fixed-row distinction and state 26px as the value without attributing it.
- `src/notes-calendar/ui/NotesCalendarCell.vue:81` — active-note colors beat the today marker. Keep as the current precedence rule.
- `src/notes-calendar/appearance/use-appearance-style.ts:11` — live-updating appearance edits.

- [ ] **Step 3: Verify no sites remain**

```bash
grep -rnE "\bv2\b|version 2\b" src/decorations/ src/notes-calendar/
```

Expected: no output.

- [ ] **Step 4: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: 3518 tests across 359 files passing.

- [ ] **Step 5: Commit**

```bash
git add src/decorations src/notes-calendar
git commit -m "docs(decorations): state comment rationale without version references"
```

---

### Task 7: Comment pass — views, ui, infrastructure, commands, settings (37 sites)

**Files:**

- Modify: `src/views/view-host.ts` (4), `src/views/view-leaf.ts` (3), `src/views/toolbar-items/button/ui/ButtonItem.vue` (3), `src/views/blocks/custom-intervals/ui/CustomIntervalsBlock.vue` (3), `src/views/default-view.ts` (2), `src/views/config.ts` (1), `src/views/view-host.test.ts` (1), `src/views/toolbar-items/period-buttons/ui/PeriodButtonsItem.vue` (1), `src/views/toolbar-items/button/ButtonItem.isolated.test.ts` (1), `src/views/blocks/custom-intervals/CustomIntervalsBlock.isolated.test.ts` (1)
- Modify: `src/infrastructure/host/internal/workspace-service.ts` (6), `src/infrastructure/host/internal/workspace-service.test.ts` (2), `src/infrastructure/host/code-blocks/internal/code-block-service.test.ts` (1)
- Modify: `src/ui/use-modifier-hover-preview.ts` (1), `src/ui/UiTemplateInput.vue` (1), `src/ui/UiTemplateInput.test.ts` (1)
- Modify: `src/commands/command-registry.ts` (2), `src/commands/flows/edit-command.flow.test.ts` (1)
- Modify: `src/settings/reload-hint.ts` (1)
- Modify: `src/styles.css` (1)

**Interfaces:**

- Consumes: the shared procedure and rule above.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: List the sites**

```bash
grep -rnE "\bv2\b|\bV2\b|version 2\b" src/views/ src/infrastructure/ src/ui/ src/commands/ src/settings/ src/styles.css
```

Expected: 37 lines. **`src/settings/legacy/` must produce no hits here** — if it does, the grep is wrong or a file moved; stop and report rather than editing under `legacy/`.

- [ ] **Step 2: Fix the stale claim in `src/styles.css:4`**

The header comment currently reads:

```css
/* Global styles for markup the plugin builds outside Vue, where a scoped SFC style cannot
   reach it. Everything else lives in its component's <style scoped>.
   Imported from main.ts so vite emits it into build/styles.css, which is what the release
   workflow ships — the styles.css at the repo root is a v2 leftover and is bundled nowhere. */
```

There is no root `styles.css`, tracked or untracked. Replace with:

```css
/* Global styles for markup the plugin builds outside Vue, where a scoped SFC style cannot
   reach it. Everything else lives in its component's <style scoped>.
   Imported from main.ts so vite emits it into build/styles.css, which is what the release
   workflow ships. */
```

- [ ] **Step 3: Rewrite the remaining sites by hand**

- `src/infrastructure/host/internal/workspace-service.ts:27`, `:65`, `:66`, `:73`, `:176`, `:220` — the densest file in the pass. It covers: the file-explorer menu not guaranteeing a Delete entry (so one is appended); the active-note signal reacting only to leaves carrying a file, so focusing a fileless sidebar leaf does not clear the calendar's active-day highlight; and the pick-one menu at the pointer for multi-journal disambiguation. All three reasons are mechanical and survive without attribution.
- `src/settings/reload-hint.ts:4` — a restart inherently clears the hint, so it needs no persistence. Self-justifying.
- `src/ui/use-modifier-hover-preview.ts:8` — a preview fires when the modifier is already held on entering a cell _or_ pressed while inside it. State as the current rule.
- `src/ui/UiTemplateInput.vue:16` — no suggestions until the user types, so an empty query does not pop the full path list.
- `src/commands/command-registry.ts:80` — the owner prefix disambiguating same-named commands. The comment ends "(v2 format)"; the format is still the format, so state it plainly.
- `src/commands/command-registry.ts:109` — availability and execution gated on the same check. **Keep this one's substance:** the palette filter and the execute path diverge (ribbon and hotkey always reach execute), which is why the notice exists.

- [ ] **Step 4: Verify no sites remain**

```bash
grep -rnE "\bv2\b|\bV2\b|version 2\b" src/views/ src/infrastructure/ src/ui/ src/commands/ src/settings/ src/styles.css
```

Expected: no output.

- [ ] **Step 5: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: 3518 tests across 359 files passing.

- [ ] **Step 6: Commit**

```bash
git add src/views src/infrastructure src/ui src/commands src/settings src/styles.css
git commit -m "docs(views): state comment rationale without version references"
```

---

### Task 8: Comment pass — e2e (8 sites)

**Files:**

- Modify: `e2e/interop/templater.e2e.ts:61`
- Modify: `e2e/journeys/view.ts:26`
- Modify: `e2e/journeys/view.e2e.ts:659`, `:721`, `:768`
- Modify: `e2e/journeys/code-blocks.e2e.ts:283`
- Modify: `e2e/journeys/nav-off-shelf.e2e.ts:16`
- Modify: `e2e/journeys/colliding-journals.e2e.ts:7`

**Interfaces:**

- Consumes: the shared procedure and rule above.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: List the sites**

```bash
grep -rnE "\bv2\b|version 2\b" e2e/ | grep -vE "^e2e/(migration|fixtures)/"
```

Expected: exactly 8 lines. **`e2e/migration/` and `e2e/fixtures/` are carved out** — the `legacy-v1` / `legacy-v2` fixture names and the migration specs are live identifiers.

- [ ] **Step 2: Rewrite each site by hand**

- `e2e/journeys/view.ts:26` — the auto-seeded default view keeps the ribbon icon off. This is a deliberate current choice; state it as such and keep the `openSeededCalendarView` cross-reference.
- `e2e/journeys/view.e2e.ts:768` — same subject from the other side ("never put an icon"). Keep the assertion's reason: a seeded Calendar view has no ribbon icon.
- `e2e/journeys/view.e2e.ts:721` — a custom interval's decoration renders in the interval list, not on the colliding day cell. Keep this; it is the day-cell decoration-leak guard.
- `e2e/journeys/nav-off-shelf.e2e.ts:16` — the off-shelf fallback resolves to all journals, not an empty set. Deliberate and tested; state as the rule.
- `e2e/journeys/code-blocks.e2e.ts:283` — a typo'd `mode` renders with schema defaults instead of an error panel.
- `e2e/journeys/colliding-journals.e2e.ts:7` — drop "ported from v2"; keep what the warning says.
- `e2e/interop/templater.e2e.ts:61` — keep the Templater create-from-template flow reference, drop the version.

- [ ] **Step 3: Verify no sites remain, and that the carve-out is intact**

```bash
grep -rnE "\bv2\b|version 2\b" e2e/ | grep -vE "^e2e/(migration|fixtures)/"
git diff --name-only | grep -E "^e2e/(migration|fixtures)/" | wc -l
```

Expected: no output from the first, `0` from the second.

- [ ] **Step 4: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: 3518 tests across 359 files passing. (`check:types` covers `tsconfig.e2e.json`; the e2e suite itself is not run.)

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "docs(e2e): state comment rationale without version references"
```

---

### Task 9: CONTEXT.md

**Files:**

- Modify: `CONTEXT.md` lines 161, 261, 305, 316, 403, 474

**Interfaces:**

- Consumes: the comment rule from the Tasks 3–8 preamble.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: List the sites**

```bash
grep -nE "\bv2\b|\bv3\b" CONTEXT.md
```

Expected: 6 lines.

- [ ] **Step 2: Rewrite five sites, and keep one in substance**

- L161 and L261 — both cite "the v2 cross-year week bug" as the reason a naive `startOf` is insufficient. The _rule_ is that a week's anchor depends on the week's owning year. State the rule; drop the bug attribution.
- L305 — modifier ordering (arithmetic before boundary, regardless of written order). Match the wording chosen in Task 3 for `src/templates/modifiers.ts:39`.
- L316 — locale data captured once at module-import time. Match the wording chosen in Task 3 for `src/templates/format-regex.ts:3`.
- L474 — "the idiom behind v3's dynamic ..." — v3 is the shipping version, so "v3's" is now just "the". Reword to drop the version.
- **L403 — keep in substance.** It reads "several legacy v2 aliases — `journal-nav`/`calendar-nav`/`interval-nav`". Those three keys are all live and registered (`src/code-blocks/nav/nav-block.ts:7`). Reword to say they are three supported aliases for the nav block, without implying two of them are deprecated. Do **not** delete the sentence — Task 12 documents these aliases in the README and this is the domain-vocabulary entry for them.

- [ ] **Step 3: Verify**

```bash
grep -nE "\bv2\b|\bv3\b" CONTEXT.md
```

Expected: no output.

- [ ] **Step 4: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: 3518 tests across 359 files passing.

- [ ] **Step 5: Commit**

```bash
git add CONTEXT.md
git commit -m "docs(context): drop version anchors from the domain glossary"
```

---

### Task 10: The manual testing checklist

**Files:**

- Rename: `docs/manual-testing-checklist-v3.md` → `docs/manual-testing-checklist.md`
- Modify: the renamed file, lines 1, 3, 54

**Interfaces:**

- Consumes: nothing.
- Produces: `docs/manual-testing-checklist.md`. If any doc links to the old path, Task 11 or 12 must not reintroduce it.

- [ ] **Step 1: Commit the pending ticks already in the working tree**

The working tree has 15 unstaged `[ ]` → `[x]` flips (auto-attach on rename, auto-attach ambiguous-journal, and the §16 migration rows). Verify they are the only change, then commit them under the current filename so the rename stays a pure rename:

```bash
git diff --stat docs/manual-testing-checklist-v3.md
git add docs/manual-testing-checklist-v3.md
git commit -m "docs(testing): record the migration and auto-attach manual passes"
```

- [ ] **Step 2: Rename the file**

```bash
git mv docs/manual-testing-checklist-v3.md docs/manual-testing-checklist.md
```

- [ ] **Step 3: Update the header**

Line 1 currently reads `# Manual Testing Checklist — Journals v3 in Obsidian`. Change to:

```markdown
# Manual Testing Checklist — Journals in Obsidian
```

Line 3 currently reads ``Branch: `v3-ai`. Run before tagging a beta / merging to `main`.`` Change to:

```markdown
Run before tagging a release.
```

Line 54 begins ``Setup: clone branch `v3-ai`; `npm run dev` (builds into`` — change `clone branch v3-ai` to `clone the repository`, leaving the rest of the setup line intact.

- [ ] **Step 4: Leave §16's migration vocabulary alone**

Lines 888-916 use `v1→v2→v3→v4` to name settings-schema versions. **These are live identifiers and stay verbatim.** The same is true of line 69 (`a v2 data.json`) and line 924 (the week-anchor regression note). Do not apply the Tasks 3–8 rule to this section.

Lines 221 and 272 compare v3 behavior to v2 behavior as a tester's note (`v3 differs from v2 index %= N; confirm intended`, and `preview-first is the v3 default`). Reword these two to state the expected behavior directly, since the tester has no v2 to compare against.

- [ ] **Step 5: Repair inbound links**

```bash
grep -rn "manual-testing-checklist-v3" --exclude-dir=node_modules --exclude-dir=.git .
```

Repair every hit outside `docs/superpowers/`. Expected: likely zero, but verify.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs(testing): make the manual checklist version-independent"
```

---

### Task 11: The e2e testing strategy doc

**Files:**

- Modify: `docs/e2e-testing-strategy.md` lines 4, 14, 30, 32, 116-119, 140, 159-162, 175, 224, 301, 305, 307

**Interfaces:**

- Consumes: Task 2's deletion of the two slice-B docs (this doc must not link to them).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Correct the test-count claim on line 4**

It reads "our 299 mock-based unit/component tests". The real figure is 3518 tests across 359 files. Update it.

- [ ] **Step 2: Reframe the slices as delivered, not planned**

Lines 30-32, 116-119, 159-162, 175, 224, and 301-307 describe slices A–D in the future or conditional tense. All four suites now exist and are green:

| Suite         | Slice | Files |
| ------------- | ----- | ----- |
| `smoke`       | —     | 1     |
| `integration` | A     | 11    |
| `journeys`    | B     | 30    |
| `migration`   | C     | 2     |
| `interop`     | D     | 1     |

Rewrite those passages in the present tense. Keep the _thesis_ (why e2e exists at all, what seam each slice covers, the no-fixed-sleeps rule) — that is the doc's enduring value and it is still accurate.

- [ ] **Step 3: Keep the migration and interop version references**

Lines 14, 30, 140, 301, and 305-307 mention "v1/v2 → v3 migration", the `legacy-v1` / `legacy-v2` fixtures, and Templater's `auto_jump_to_cursor`. **These are all live identifiers and true statements** — the migration chain still migrates v1 and v2 vaults, and those fixtures still exist. Leave them. Line 32 and 305's "no community-Calendar interop in v3" is also still true; keep it but drop the bare `v3` where it now just means "the plugin".

- [ ] **Step 4: Verify no links to deleted docs**

```bash
grep -n "slice-b" docs/e2e-testing-strategy.md
```

Expected: no output.

- [ ] **Step 5: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: 3518 tests across 359 files passing.

- [ ] **Step 6: Commit**

```bash
git add docs/e2e-testing-strategy.md
git commit -m "docs(e2e): describe the delivered suites in the present tense"
```

---

### Task 12: README full coverage pass

**Files:**

- Modify: `README.md` (whole document)

**Interfaces:**

- Consumes: Task 9's wording for the nav-block aliases (`CONTEXT.md:403`).
- Produces: the user-facing feature documentation for the release.

This is the largest task. It is a **documentation accuracy pass, not a rewrite**: keep the document's structure, headings, and any prose that is still correct. Change what is wrong and add what is missing.

- [ ] **Step 1: Correct the five wrong claims**

**L176 — the Calendar community plugin bullet.** Currently:

> `Calendar` community plugin - starting 1.1.0 this plugin has calendar view similar to calendar plugin. It does not have all the features of calendar plugin as of now, but will gradually catch up.

The plugin now builds its own composable views and has no community-Calendar interop. Replace with a statement that this plugin provides its own calendar views and is intended as a replacement, dropping both the version archaeology and the catch-up promise.

**L196 — the `{{date}}` formatting example.** The bullet demonstrates its own syntax with `{{start_date:format}}` and `{{start_date+5d:format}}`. Both must be `{{date:format}}` and `{{date+5d:format}}`.

**L196 — the week exception.** Currently claims `{{date}}` "will be set to end of week" for cross-year weeks. The real rule, from `NotePathService.contextFor` (`src/journals/notes/note-path.ts:120-124`), is that `{{date}}` renders the period's _representative_ day, which for a week is the day whose calendar year equals the week-year. The week's stored anchor is its first day. Rewrite the sentence to describe that.

**L199 — `{{index}}`.** Presented as a fixed variable for interval journals. Numbering sources are user-named — `config.numbering.sources[].variable` — so `index` is a default name, not the only one. Verify the default against the numbering config schema before writing the replacement, then describe it as "the numbering variable, named `index` by default".

**L155-158 — "Block Types: Navigation block / Calendar view block".** Predates views being composed from blocks and toolbar items. Bring in line with the "Configurable Views" bullet at L16, which is already correct.

- [ ] **Step 2: Document the shipping features the README omits**

Add each to the section where it belongs, in the document's existing voice:

1. **`calendar-nav` and `interval-nav`** — live aliases of `journal-nav` (`src/code-blocks/nav/nav-block.ts:7`). Add to the "Supported code blocks" section alongside `journal-nav`.
2. **The `markdown-template` block** — renders a template file inline in a custom view (`src/views/blocks/markdown-template/markdown-template-block.ts:17`). This is a _view block_, not a fenced code block; document it under views, not under "Supported code blocks".
3. **Vault-wide and shelf-scoped decorations** — the Decoration System section (L106-126) frames every decoration as belonging to a journal. Decorations now resolve across three scopes, last-wins over vault-wide → shelf → journal.
4. **The decoration breakdown** — right-click a calendar cell for a per-property explanation naming the rule behind each color, border, and mark, and the rules those overrode.
5. **The decoration inspector** — shows everything decorating a chosen date across all three scopes, plus whether each rule has matched recently.
6. **Auto-attach** — externally created notes matching a journal's folder and name pattern are connected automatically.
7. **The reference modals** — settings lists every template variable and code block with a live preview and click-to-copy snippets (`src/journals/settings/ui/VariableReferenceModal.vue`, `CodeBlockReferenceModal.vue`).
8. **Ten translated UI locales** besides English.
9. **Stable CSS class names** on calendar and code-block elements for theming.

- [ ] **Step 3: Verify every remaining claim against source**

Walk the Settings (L43-171), Supported variables (L190-203), and Supported code blocks (L205-276) sections and check each claim. Specifically:

- The `journals-home` options (`show`, `separator`, `scale`, `shelf`) and their defaults, against `src/code-blocks/home/home-config.ts`.
- The `calendar-timeline` `mode` values and per-note-type defaults, against `src/code-blocks/timeline/timeline-config.ts`.
- The full template-variable list against `NotePathService.contextFor` (`src/journals/notes/note-path.ts:119-146`), which is the single place they are bound: `date`, `journal_name`, `start_date`, `end_date`, each numbering source variable, `current_date`, `time`, `current_time` — plus `note_name` / `title` added by `bodyContextFor` for note content only.
- The decoration condition kinds and style options against `src/decorations/config.ts`.

Correct anything that does not match. Do not add claims you cannot trace to source.

- [ ] **Step 4: Check the linked screenshots still depict the current UI**

```bash
ls assets/
```

`README.md` embeds `assets/daily-nav.png`, `assets/week-timeline.png`, and `assets/month-timeline.png`. If any no longer resembles the shipping UI, note it in the task report rather than fixing it — regenerating screenshots needs a running Obsidian and is out of scope for this plan.

- [ ] **Step 5: Verify no version anchors were introduced**

```bash
grep -nE "\bv2\b|version 2\b" README.md
```

Expected: no output.

- [ ] **Step 6: Run the full verification**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: 3518 tests across 359 files passing.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs(readme): document the shipping feature set"
```

---

### Task 13: Final sweep

**Files:** none modified unless the sweep finds something.

**Interfaces:**

- Consumes: every prior task.
- Produces: the evidence that the cleanup is complete.

- [ ] **Step 1: Confirm the reword scope is empty and the carve-out is untouched**

```bash
echo "--- should be empty ---"
grep -rnE "\bv2\b|\bV2\b|version 2\b" src/ e2e/ README.md CONTEXT.md CONTRIBUTING.md docs/architecture.md \
  | grep -vE "^src/settings/legacy/|^e2e/(migration|fixtures)/"
echo "--- carve-out, should be non-empty ---"
grep -rlE "\bv2\b" src/settings/legacy/ e2e/migration/ | wc -l
```

Expected: no output from the first block; a non-zero count from the second. **A zero on the second means the carve-out was violated — investigate before proceeding.**

- [ ] **Step 2: Confirm no dangling references**

```bash
grep -rn "_old-code\|slice-b\|feature-gaps\|changelog-generation\|manual-testing-checklist-v3" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=superpowers .
```

Expected: no output.

- [ ] **Step 3: Confirm zero TODOs**

```bash
grep -rnE "TODO|FIXME|HACK|XXX" src/ e2e/ scripts/ | wc -l
```

Expected: `0`.

- [ ] **Step 4: Run the full verification one last time**

```bash
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Expected: 3518 tests across 359 files passing.

- [ ] **Step 5: Report**

Summarize: files deleted, comment sites rewritten, docs updated, and anything deferred (e.g. stale screenshots from Task 12 Step 4). Do not commit — there should be nothing left to commit.
