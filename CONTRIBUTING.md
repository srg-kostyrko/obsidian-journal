# Contributing

Journals is an [Obsidian](https://obsidian.md/) plugin for daily, weekly, and
custom-period notes: configurable calendar views, note decorations, templates,
and automatic note management. Bug reports and pull requests are welcome. For
a larger feature, open an issue first so the approach can be agreed before you
write code.

## Reporting a bug / requesting a feature

Open an issue and pick the bug report or feature request form. A bug report is
actionable when it includes:

- the plugin version and the Obsidian version
- steps to reproduce
- what you expected to happen versus what actually happened
- console output, from the developer tools (`Ctrl+Shift+I` on Windows/Linux,
  `Cmd+Opt+I` on macOS)

The plugin has its own logging, configurable in its settings under
**Logging**: raise the log level and dump the recent log messages to a note.
That note is often more useful than the console alone, since it captures the
plugin's own reasoning rather than just uncaught errors.

## Development setup

```bash
npm ci                 # also runs compile:i18n, via `prepare`
npm run dev            # builds into test-vault/.obsidian/plugins/journals, with hot-reload
```

Then open `test-vault/` as a vault in Obsidian — the plugin is already
enabled there, alongside Hot Reload, Templater, and Calendar.

`compile:i18n` generates `src/i18n/paraglide`, which is not committed, so
`check:types` cannot run against a clone that skipped it. `prepare` runs it as
part of `npm ci` for exactly that reason. If `check:types` ever does complain
about `src/i18n/paraglide` — after a `git clean`, say — run `npm run
compile:i18n` and try again.

Use Node 24, matching CI.

`npm ci` also installs a pre-commit hook (Husky + `nano-staged`) that runs
eslint on staged `*.ts`/`*.vue` files and reformats staged `*.ts`, `*.mjs`,
`*.js`, `*.css`, `*.md`, and `*.vue` files with Prettier. It can catch a first
commit off guard: fix any eslint error it reports and re-stage; Prettier
reformats your staged files and the commit proceeds. The hook only sees
_staged_ files, so `check:format` backstops it in CI — that is what a Prettier
version bump reformatting a file nobody is editing would otherwise slip past.

## Quality gates

`checks.yml` runs `compile:i18n` → `check:i18n` → `check:types` →
`check:format` → `coverage` → `check:lint` → `build:api` → `check:api` on every
pull request and on every push to `main` (`compile:i18n` is covered in
Development setup above). It reports as
the `build` check, which — together with `e2e-gate`, the fixed name standing in
for the whole e2e matrix — blocks the merge button until both are green. A check
that is still running blocks it too. Run these before opening a pull request
anyway; the order between them doesn't matter locally:

```bash
npm run check        # all of the below, in CI's order
```

Or individually:

```bash
npm run check:types  # vue-tsc, no emit
npm run coverage     # vitest, the unit and component suite, gated on a coverage floor
npm run check:lint   # eslint over the whole project
npm run check:format # prettier --check, the backstop for the pre-commit hook
npm run check:i18n   # guards messages/*.json against banned mistranslations and locale key drift
npm run build:api    # regenerates packages/api/index.d.ts — commit the result
npm run check:api    # proves the published package compiles for a consumer
```

`npm test` is not one of the gates. `coverage` runs the same suite and adds the
floor, so CI pays for the suite once; a green `npm test` says nothing about the
floor.

`build:api` generates `packages/api/index.d.ts` from `src/api/public-api.ts` and
CI then runs `git diff --exit-code` on it, so **a change to the public API
surface fails until the regenerated file is committed alongside it**. That is
deliberate: it puts the published surface in the same diff as the change that
moved it, where a reviewer sees it.

The e2e layer drives a real Obsidian binary through WebdriverIO. It's slow, so
run it locally when your change touches runtime behavior — note creation,
auto-attach, views, migration, Templater interop — and skip it for a
docs-only or pure-refactor change. Per-suite scripts:

```bash
npm run test:e2e:smoke
npm run test:e2e:integration
npm run test:e2e:migration
npm run test:e2e:interop
npm run test:e2e:journeys
```

`npm run test:e2e:pr` runs exactly those five, which is what a pull request
runs in CI. Reach for it rather than `npm run test:e2e`: that one runs the bare
`./e2e/**/*.e2e.ts` glob, which is the nightly lane — it also picks up
`quarantine`, the non-blocking flaky lane that never gates a merge.

## Making a change

Write the test first. Unit tests sit beside the implementation as `*.test.ts`;
see [`docs/unit-testing-strategy.md`](docs/unit-testing-strategy.md) for how
we write them.

No `eslint-disable` comments — the lint config rejects the comment itself, so
the fix has to be in the code.

User-facing copy goes in `messages/en.json`, not in the generated
`src/i18n/paraglide` output. Sentence case, en-US.

Add the key to the other ten locale files in the same pull request. `check:i18n`
enforces key parity in both directions, so `en.json` alone fails the build — a
key missing from a locale would otherwise ship English there with no warning,
no type error and no failing test, which is the shape that reached production
once.

There is no `translate:i18n` script and no bulk translator: read
[`docs/i18n-glossary.md`](docs/i18n-glossary.md) first, reuse its canonical
terms, and match the register and quoting of the keys around the one you are
adding. That file records what a context-free pipeline shipped to production
and why it was removed. If you cannot translate a locale responsibly, say so in
the PR and leave that file to the maintainer — an honest gap beats a plausible
wrong word, which is the failure mode the glossary exists to prevent.

## AI-assisted contributions

AI-assisted contributions are welcome. Point the agent at
[`CONTEXT.md`](CONTEXT.md), [`docs/architecture.md`](docs/architecture.md), and
[`CLAUDE.md`](CLAUDE.md) before it writes anything, and
hold the result to the same quality gates as a human contribution. You are the
author of what you submit: read the diff before you open the pull request.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
with a scope and an imperative, lowercase subject:

```
fix(nav): scope a custom journal's row decorations like its interval entry
docs(changelog): add three missing entries to the 3.0.0 draft
```

The usual types apply (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`),
plus a project-specific `i18n(scope):` for translation-only changes.

Reference the issue in the commit or pull request body with a closing keyword
(`Fixes #123`) when there is one. It closes the issue on merge, and it is what
lets a release comment back on every issue it shipped — so an unlinked fix
reaches users without its reporter ever being told.

**Add a `CHANGELOG.md` entry under `[Unreleased]` as part of your change**, in
`### Features` or `### Bug Fixes`, written for the person using the plugin —
what changed for them, not what changed in the code. Use the existing entries as
the model, including their length: they say what the feature does, what it does
not do, and what happens at the edges. One capability gets one entry however
many commits implement it, and a change with nothing user-facing gets none.
If you work with Claude Code, `/changelog` drafts one from your branch.

The release does not assemble these notes from commit history — it only audits
what is already there and fills genuine gaps. An entry you skip is an entry
nobody writes.

Branch from `main` and open the pull request against `main`.

## Going deeper

- [`docs/architecture.md`](docs/architecture.md) — the conventions the code is
  built on: dependency injection, `Result`/`Option`, dates, schemas,
  internationalization, test file locations.
- [`docs/unit-testing-strategy.md`](docs/unit-testing-strategy.md) — the unit
  and component testing standard.
- [`CONTEXT.md`](CONTEXT.md) — the domain vocabulary the codebase reasons in.
- [`docs/e2e-testing-strategy.md`](docs/e2e-testing-strategy.md) — what the
  end-to-end suite covers and why it exists alongside the unit suite.
- [`.claude/skills/release/SKILL.md`](.claude/skills/release/SKILL.md) — how a
  version reaches the community plugin browser. Maintainer-facing; you don't
  need it to contribute.
