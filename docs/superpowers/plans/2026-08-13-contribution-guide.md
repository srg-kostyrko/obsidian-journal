# Contribution guide implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give contributors a documented path from clone to merged pull request, and write down the conventions that currently exist only as tribal knowledge.

**Architecture:** Two prose documents in a shallow-to-deep layering — `CONTRIBUTING.md` carries a first-time contributor end to end without requiring the second, and `docs/architecture.md` holds the conventions catalog for anyone going further. Three GitHub templates structure intake. `CONTEXT.md` is untouched and linked as the domain glossary.

**Tech Stack:** Markdown, GitHub issue forms (YAML), prettier (the only formatter that gates markdown in this repo).

Spec: [`docs/superpowers/specs/2026-08-13-contribution-guide-design.md`](../specs/2026-08-13-contribution-guide-design.md)

## Global Constraints

- **Write for the released state.** 3.0 ships within days. Both documents describe the v3
  architecture, name `main` as the branch to target, and contain no in-development banner, no
  "coming soon", and no v2/v3 comparison. Nothing in these files should need editing on release day.
- **Every factual claim must be verified against the repo before it is written.** Every npm script,
  file path, directory, and eslint rule named in either document must exist. No claim from memory.
- **Do not invent tooling.** There is no `translate:i18n` script. The npm scripts are exactly:
  `dev`, `build`, `compile:i18n`, `check:i18n`, `version`, `check:lint`, `test`, `test:watch`,
  `test:e2e`, `test:e2e:smoke`, `test:e2e:integration`, `test:e2e:migration`, `test:e2e:interop`,
  `coverage`, `bench`, `check:types`, `prepare`.
- **Prettier formats markdown here.** Every task ends with `npx prettier --write` on the files it
  touched, before the commit. The `pre-commit` hook runs nano-staged, which also applies it.
- **Commit style.** Conventional Commits, scope required, imperative lowercase subject. Use the
  `docs` type for every commit in this plan. Never add a `Co-Authored-By` trailer.
- **Commit to the current branch** (`v3-ai`). Do not create a branch.
- **British/American spelling:** the repo's copy is en-US (see `docs/2026-07-13-ux-text-audit.md`).
  Use "behavior", "internationalization", "catalog".

---

### Task 1: `docs/architecture.md`

The deep layer. Written first so that Task 2's links resolve on the same branch.

**Files:**

- Create: `docs/architecture.md`
- Read for facts: `eslint.config.mjs`, `CONTEXT.md`, `src/` tree, `docs/e2e-testing-strategy.md`

**Interfaces:**

- Produces: the anchor headings Task 2 and Task 3 link to. Use exactly these `##` headings so the
  fragment links elsewhere resolve: `## Code layout`, `## Dependency injection`,
  `## Result and Option`, `## Dates and union dispatch`, `## Schemas and types`,
  `## Internationalization`, `## Testing`, `## Further reading`.

- [ ] **Step 1: Confirm every eslint claim before writing it**

Run:

```bash
grep -n "noRawError\|noStrayDefineModal\|noEagerMessage\|no-restricted-imports\|eslint-comments/no-use\|filename-case\|must live under" eslint.config.mjs
```

Expected: hits confirming all seven enforced rules the document will cite. The claims, and where
they live in `eslint.config.mjs`, are:

| Claim in the doc                                    | Rule                                       |
| --------------------------------------------------- | ------------------------------------------ |
| Vue SFCs live under `<feature>/ui/`                 | `no-restricted-syntax`, `Program` selector |
| `*.flow.ts` files live under `<feature>/flows/`     | `no-restricted-syntax`, `Program` selector |
| `defineModal()` only in `<feature>/ui/modals.ts`    | `noStrayDefineModal`                       |
| Throw a named `Error` subclass, never `new Error()` | `noRawError`                               |
| No `m.*()` at module scope                          | `noEagerMessage`                           |
| Import moment through the calendar abstraction      | `no-restricted-imports`                    |
| No `eslint-disable` comments                        | `@eslint-community/eslint-comments/no-use` |
| `src/**/*.ts` kebab-case, `src/**/*.vue` PascalCase | `unicorn/filename-case`                    |

If any grep misses, the claim is wrong — drop it rather than writing it.

- [ ] **Step 2: Write the document**

Open with a short framing paragraph, then the eight sections. The framing paragraph must make
two points, because both are load-bearing:

> This document catalogs the conventions this codebase is built on. Entries marked _(eslint)_ are
> checked by `eslint.config.mjs` — the mark says **who checks the rule, not how much it matters**.
> The unmarked rules are exactly as binding; they are simply the ones tooling cannot see.
> `CONTEXT.md` is the companion to this file: it defines the domain vocabulary, this one defines
> how the code is built.

Then, one `##` section each:

1. **Code layout** — `src/<feature>/`: `ui/` holds single-file components and `modals.ts`, `flows/`
   holds `*.flow.ts`, the feature root holds domain code and `module.ts`. A subfolder is a
   sub-feature exactly when it has its own `module.ts`; otherwise its contents fold into the
   parent. Barrel files export public API only — test helpers go in a separate barrel so test code
   stays out of the bundle. Filenames: kebab-case for `.ts`, PascalCase for `.vue` _(eslint)_.
   List the enforced location rules as one-liners marked _(eslint)_.
2. **Dependency injection** — the container is a wiring tool used during boot, not a runtime
   service locator. Constructor-time injection (positional args, or `inject()` during
   construction) is the pattern; runtime lookups from feature code are not. Prefer a field
   initializer (`readonly #x = inject(...)`) over assigning in the constructor body. Eager bindings
   resolve through a separate `autoLoad` step in `main.ts`, not at container build time.
   `Container` is the default lifetime and is never written out; only `Scoped` and `Transient` are.
   Use a `createXxxModule(args)` factory only when the module needs arguments; zero-arg modules
   export a plain `const xModule: Module = {...}`. Close with the trap: an import cycle passes
   every unit test and aborts `onload()` at real boot, so the e2e suite is the only guard — break
   cycles with a lazy `InjectorToken`.
3. **Result and Option** — compose a `Result`/`AsyncResult` pipeline as a single
   `attempt.in(this, function* () { ... })` block rather than a chain of shadowed locals; use
   `yield* Option.fromNullable(x).okOrElse(...)` for lookup-or-fail. `tap` runs on ok only and
   `tapErr` on err only, so branch dispatch belongs in the API rather than in caller-side kind
   checks. At Vue and other reactive boundaries, bridge with `Option.getOrUndefined()`. Every
   `Error` subclass lives in its feature's `errors.ts`, including internal invariant errors; raw
   `new Error()` is rejected _(eslint)_.
4. **Dates and union dispatch** — moment is reachable only through the calendar abstraction
   _(eslint)_. Step dates with `Period.next`/`previous` and `CalendarDate`, never raw
   `localMoment().add()` in domain code. Weekday and month names come from
   `moment.localeData()`. Dispatch on discriminated unions with `ts-pattern`'s
   `match().with().exhaustive()`; `switch` is not the default here.
5. **Schemas and types** — valibot schemas are the source of truth. Infer types with
   `v.InferOutput` rather than declaring them alongside; carry brands through `v.transform`. Brands
   are structural (`{ __brand: true }`) — a unique symbol trips TS4023 when a schema's inferred type
   crosses a module boundary.
6. **Internationalization** — user-facing copy goes in `messages/en.json` only. `compile:i18n`
   generates `src/i18n/paraglide`, which is git-ignored and must never be staged. No `m.*()` call
   at module scope _(eslint)_: `initLocale()` runs inside `onload()`, so a module-scope call
   freezes to the base locale for every user — wrap it in a factory called at use time. Do not wrap
   `m.*()` in `computed()` unless the arguments include reactive data. `check:i18n` guards the
   glossary in `docs/i18n-glossary.md`.
7. **Testing** — unit tests colocated as `*.test.ts` beside the implementation; shared test
   infrastructure in a sibling `testing/` directory or `testing.ts` file, never a top-level
   `mocks/` or `fixtures/` folder. Vue components are tested through `@testing-library/vue` with
   `user-event`, querying by role and text rather than by CSS class or test-only attributes.
   Assert observable outcomes; reach for a spy only when the side effect _is_ the contract. One
   behavior per test — a test name with "and" in it is two tests. Name tests as subject plus verb.
   Express scope with nested `describe()` blocks rather than punctuation in one label. Use
   `expectTypeOf` for type assertions, never `@ts-expect-error`. Do not test module wiring, barrel
   shapes, or the fakes themselves. Point at `docs/e2e-testing-strategy.md` for the e2e layer.
8. **Further reading** — `CONTEXT.md` (domain vocabulary), `docs/e2e-testing-strategy.md`,
   `docs/superpowers/specs/` and `docs/superpowers/plans/` (the specs and plans behind larger
   features), `docs/i18n-glossary.md`.

- [ ] **Step 3: Verify every path the document names exists**

Run:

```bash
grep -oE '`[a-zA-Z0-9_./-]+\.(ts|md|json|mjs)`|`[a-z0-9-]+/`' docs/architecture.md \
  | tr -d '`' | sort -u \
  | while read -r p; do [ -e "$p" ] || echo "MISSING: $p"; done
```

Expected: no `MISSING:` lines, except for illustrative patterns that are not real paths
(`errors.ts`, `module.ts`, `modals.ts`, `testing.ts`, `*.test.ts`, `*.flow.ts`,
`src/<feature>/`). Confirm each survivor is one of those; anything else is a broken claim to fix.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write docs/architecture.md
git add docs/architecture.md
git commit -m "docs(architecture): catalog the codebase conventions"
```

---

### Task 2: `CONTRIBUTING.md`

**Files:**

- Create: `CONTRIBUTING.md`
- Read for facts: `package.json`, `.github/workflows/checks.yml`, `.github/workflows/e2e.yml`,
  `vite.config.mts`, `wdio.conf.mts`, `CHANGELOG.md`

**Interfaces:**

- Consumes: `docs/architecture.md` from Task 1, linked from the intro and from "Going deeper".
- Produces: the file Task 3's pull request template and Task 4's README pointer link to.

- [ ] **Step 1: Confirm the setup and gate facts**

Run:

```bash
node -e "console.log(Object.keys(require('./package.json').scripts).join(' '))"
grep -n "node-version" .github/workflows/checks.yml .github/workflows/e2e.yml
grep -n "outDir" vite.config.mts
grep -n "suite" wdio.conf.mts | head -20
```

Expected, and these are the numbers the document must use:

- CI runs Node `24.x` in both workflows.
- `checks.yml` runs, in order: `compile:i18n`, `check:i18n`, `check:types`, `test`, `check:lint`.
- `vite.config.mts` sets `outDir` to `test-vault/.obsidian/plugins/journals` under `--watch` and
  `build` otherwise — so `npm run dev` installs straight into the test vault, and `npm run build`
  does not.
- The e2e suites named in `e2e.yml` for pull requests: `smoke`, `integration`, `migration`,
  `interop`, `journeys`.

- [ ] **Step 2: Write the document**

Eight `##` sections. It must stand alone — a contributor who never opens `docs/architecture.md`
should still land a correct small fix.

1. **Intro** — one paragraph: what the plugin is, that bug reports and pull requests are welcome,
   and that a larger feature should start with an issue so the approach can be agreed first
   (this preserves the intent of the README paragraph being replaced in Task 4).
2. **Reporting a bug / requesting a feature** — point at the issue forms. State what makes a
   report actionable: plugin and Obsidian versions, steps to reproduce, what you expected versus
   what happened, and console output (Ctrl+Shift+I / Cmd+Opt+I). Mention that the plugin's own
   logging can be raised and dumped to a note from settings, which is often more useful than the
   console alone.
3. **Development setup** — a numbered sequence with real commands:

   ```bash
   npm ci
   npm run compile:i18n   # generates src/i18n/paraglide, which is git-ignored
   npm run dev            # builds into test-vault/.obsidian/plugins/journals, with hot-reload
   ```

   Then: open `test-vault/` as a vault in Obsidian and enable the plugin. State explicitly that
   `compile:i18n` is required before the first `check:types` on a fresh clone, because the
   paraglide output is generated and not committed — this is the failure a newcomer hits first.
   Note Node 24, matching CI.

4. **Quality gates** — the four commands CI runs on every push, each with one line on what it
   covers:

   ```bash
   npm run check:types
   npm test
   npm run check:lint
   npm run check:i18n
   ```

   Then the e2e layer: `npm run test:e2e` drives a real Obsidian binary through WebdriverIO and is
   slow, so run it when the change touches runtime behavior. Name the per-suite scripts
   (`test:e2e:smoke`, `:integration`, `:migration`, `:interop`) and note that the `journeys` suite
   has no npm alias — run it with `npx wdio run ./wdio.conf.mts --suite journeys`. Pull requests
   run all five in CI.

5. **Making a change** — write the test first; unit tests sit beside the implementation as
   `*.test.ts`. No `eslint-disable` comments — the lint config rejects them, and the fix is the
   code. User-facing copy goes in `messages/en.json` and nowhere else: not in another locale file,
   which is machine-translated and reviewed separately, and not in the generated paraglide output.
   Sentence case, en-US.
6. **AI-assisted contributions** — welcome. Point the agent at `CONTEXT.md` and
   `docs/architecture.md` before it writes anything, and hold the result to the same gates: you
   are the author of what you submit, so read it first.
7. **Commits and pull requests** — Conventional Commits with a scope and an imperative lowercase
   subject. Give two real examples copied from the history:

   ```
   fix(nav): scope a custom journal's row decorations like its interval entry
   docs(changelog): add three missing entries to the 3.0.0 draft
   ```

   Note the project-specific `i18n(scope):` type alongside the usual `feat`/`fix`/`docs`/`refactor`
   /`test`/`chore`. Close the issue from the commit or pull request body with a closing keyword
   (`Fixes #123`), because release notes are assembled from them. Add a `CHANGELOG.md`
   `[Unreleased]` entry under `### Features` or `### Bug Fixes`, written in the user's language —
   what changed for the person using the plugin, not what changed in the code. Point at the
   existing entries as the model. Branch from `main` and open the pull request against `main`.

8. **Going deeper** — links to `docs/architecture.md`, `CONTEXT.md`,
   `docs/e2e-testing-strategy.md`.

- [ ] **Step 3: Verify the commands actually work as documented**

Run each command the document tells a contributor to run, and confirm it behaves as described:

```bash
npm run compile:i18n && npm run check:types
```

Expected: both succeed. If `check:types` fails, the setup section is wrong — fix the document to
match reality, not the other way round.

- [ ] **Step 4: Verify every link resolves**

Run:

```bash
grep -oE '\]\([^)#][^)]*\)' CONTRIBUTING.md | sed -E 's/^\]\(//; s/\)$//' \
  | while read -r p; do [ -e "$p" ] || echo "BROKEN: $p"; done
```

Expected: no `BROKEN:` lines. External `https://` links are reported by this check — eyeball those
rather than resolving them.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write CONTRIBUTING.md
git add CONTRIBUTING.md
git commit -m "docs(contributing): add the contribution guide"
```

---

### Task 3: GitHub issue and pull request templates

**Files:**

- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

**Interfaces:**

- Consumes: `CONTRIBUTING.md` from Task 2 (the pull request template links to it).

- [ ] **Step 1: Write the bug report form**

```yaml
name: Bug report
description: Something in the plugin does not work as expected
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to report this. Please check the
        [existing issues](https://github.com/srg-kostyrko/obsidian-journal/issues) first — if
        yours is already there, a comment with your details is more useful than a new issue.
  - type: textarea
    id: what-happened
    attributes:
      label: What happened
      description: What did you expect, and what happened instead?
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Open settings and ...
        2. Click ...
        3. The note is created in the wrong folder
    validations:
      required: true
  - type: input
    id: plugin-version
    attributes:
      label: Plugin version
      description: Settings → Community plugins → Journals
    validations:
      required: true
  - type: input
    id: obsidian-version
    attributes:
      label: Obsidian version
      description: Settings → About → Current version
    validations:
      required: true
  - type: dropdown
    id: platform
    attributes:
      label: Platform
      options:
        - Windows
        - macOS
        - Linux
        - iOS
        - Android
    validations:
      required: true
  - type: textarea
    id: console
    attributes:
      label: Console output
      description: >-
        Open the developer console (Ctrl+Shift+I, or Cmd+Option+I on macOS) and paste anything
        that appears when the problem happens. Raising the log level in the plugin's settings and
        dumping the log to a note often captures more.
      render: text
  - type: textarea
    id: journal-config
    attributes:
      label: Relevant journal configuration
      description: >-
        The settings of the journal involved — write type, name template, date format, folder.
  - type: textarea
    id: other-plugins
    attributes:
      label: Other plugins involved
      description: >-
        Especially Templater, Calendar, Periodic Notes, or the Daily notes core plugin. If the
        problem goes away with other plugins disabled, say so.
```

- [ ] **Step 2: Write the feature request form**

```yaml
name: Feature request
description: Suggest a capability or an improvement
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: The problem
      description: What are you trying to do that the plugin makes hard or impossible?
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: What you would like to happen
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives you have considered
      description: >-
        Including other plugins, or a workaround you are using today.
```

- [ ] **Step 3: Write the template chooser config**

```yaml
blank_issues_enabled: false
contact_links:
  - name: Documentation
    url: https://github.com/srg-kostyrko/obsidian-journal#readme
    about: Settings reference, template variables, code blocks, and troubleshooting.
  - name: Obsidian forum
    url: https://forum.obsidian.md/
    about: Questions about Obsidian itself, rather than about this plugin.
```

- [ ] **Step 4: Write the pull request template**

```markdown
## What and why

<!-- What changes, and what problem it solves. -->

Fixes #

## Checklist

- [ ] `npm run check:types` passes
- [ ] `npm test` passes
- [ ] `npm run check:lint` passes
- [ ] `npm run check:i18n` passes
- [ ] `npm run test:e2e` passes, if this changes runtime behavior
- [ ] User-facing copy is in `messages/en.json` only
- [ ] `CHANGELOG.md` has an `[Unreleased]` entry, written for the user

See [CONTRIBUTING.md](../CONTRIBUTING.md) if any of these are unfamiliar.
```

- [ ] **Step 5: Verify the forms parse as valid YAML**

Run:

```bash
node -e "
const fs=require('fs');
for (const f of ['bug_report.yml','feature_request.yml','config.yml']) {
  const p='.github/ISSUE_TEMPLATE/'+f;
  fs.readFileSync(p,'utf8');
  console.log('read ok:', p);
}"
npx prettier --check .github/ISSUE_TEMPLATE/*.yml
```

Expected: all three read, and prettier reports them formatted (prettier parses YAML, so a syntax
error surfaces here). GitHub validates the form schema itself only after push — check the
repository's Issues tab once the branch reaches `main`.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write .github/ISSUE_TEMPLATE/ .github/PULL_REQUEST_TEMPLATE.md
git add .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md
git commit -m "docs(github): add issue forms and a pull request template"
```

---

### Task 4: Point the README at the guide, and check the whole set

**Files:**

- Modify: `README.md` (the final `## Contributing` section)

- [ ] **Step 1: Replace the README's Contributing section**

The current section, at the end of the file, reads:

```markdown
## Contributing

Contributions via bug reports, bug fixes, documentation, and general improvements are always welcome. For more major feature work, make an issue about the feature idea / reach out to me so we can judge feasibility and how best to implement it.
```

Replace it with a pointer that keeps the same intent and adds the route:

```markdown
## Contributing

Contributions via bug reports, bug fixes, documentation, and general improvements are always welcome. For more major feature work, open an issue about the idea first so we can judge feasibility and how best to implement it.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, the checks a change needs to pass, and how to open a pull request.
```

- [ ] **Step 2: Verify the setup sequence from a clean clone**

This is the one claim in `CONTRIBUTING.md` that cannot be checked by grepping. Run it against a
fresh copy so a stale `node_modules` or an already-generated paraglide directory cannot mask a
gap:

```bash
SCRATCH=$(mktemp -d)
git clone --depth 1 --branch v3-ai . "$SCRATCH/clone"
cd "$SCRATCH/clone" && npm ci && npm run compile:i18n && npm run check:types
```

Expected: all four succeed, in the order `CONTRIBUTING.md` documents. If `check:types` fails
without `compile:i18n` having run, that confirms the ordering claim — good. If the documented
sequence itself fails, fix the document. Remove `$SCRATCH` afterwards.

- [ ] **Step 3: Verify every cross-link across all four files**

Run:

```bash
grep -ohE '\]\([^)#][^)]*\)' CONTRIBUTING.md README.md docs/architecture.md .github/PULL_REQUEST_TEMPLATE.md \
  | sed -E 's/^\]\(//; s/\)$//' | grep -v '^https\?://' | sort -u \
  | while read -r p; do [ -e "$p" ] || echo "BROKEN: $p"; done
```

Expected: no `BROKEN:` lines. Note that `../CONTRIBUTING.md` in the pull request template resolves
from `.github/`, not from the repository root, so this check reports it — confirm it by hand with
`ls .github/../CONTRIBUTING.md`.

- [ ] **Step 4: Confirm nothing describes an unreleased state**

Run:

```bash
grep -rniE "v3-ai|in development|coming soon|unreleased rewrite|will be released" \
  CONTRIBUTING.md docs/architecture.md .github/
```

Expected: no output. `CHANGELOG.md`'s `[Unreleased]` heading is referenced by name in
`CONTRIBUTING.md` and in the pull request template — that is the changelog's own section heading,
not a status claim, so those two hits are fine if the pattern catches them.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write README.md
git add README.md
git commit -m "docs(readme): point contributors at the contribution guide"
```

---

## Definition of done

- `CONTRIBUTING.md`, `docs/architecture.md`, three files under `.github/ISSUE_TEMPLATE/`, and
  `.github/PULL_REQUEST_TEMPLATE.md` exist and are committed on `v3-ai`.
- `README.md`'s Contributing section points at `CONTRIBUTING.md`.
- The clean-clone setup sequence in Task 4 Step 2 succeeded as documented.
- No internal link is broken; no cited npm script, path, or eslint rule is fictional.
- `npx prettier --check .` reports no changes needed for the touched files.
- Neither document mentions the branch state or the upcoming release.
