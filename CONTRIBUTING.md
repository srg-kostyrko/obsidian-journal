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
npm ci
npm run compile:i18n   # generates src/i18n/paraglide, which is git-ignored
npm run dev            # builds into test-vault/.obsidian/plugins/journals, with hot-reload
```

Then open `test-vault/` as a vault in Obsidian — the plugin is already
enabled there, alongside Hot Reload, Templater, and Calendar.

`compile:i18n` must run before the first `check:types` on a fresh clone: the
paraglide module it generates is not committed, so type-checking fails against
a clone that skipped it. That's the failure a newcomer hits first — if
`check:types` complains about `src/i18n/paraglide`, run `compile:i18n` and try
again.

Use Node 24, matching CI.

`npm ci` also installs a pre-commit hook (Husky + `nano-staged`) that runs
eslint on staged `*.ts`/`*.vue` files and reformats staged `*.ts`, `*.mjs`,
`*.js`, `*.css`, `*.md`, and `*.vue` files with Prettier. It's the only thing
enforcing formatting — there's no `check:format` script and no CI job runs
Prettier — so it can catch a first commit off guard: fix any eslint error it
reports and re-stage; Prettier reformats your staged files and the commit
proceeds.

## Quality gates

`checks.yml` runs `compile:i18n` → `check:i18n` → `check:types` → `test` →
`check:lint` on every push (`compile:i18n` is covered in Development setup
above). It triggers on `push`, not `pull_request`, so for a pull request from
a fork it runs in your fork rather than as a check on the PR itself — these
four are your real gate, not just a convenience. Run them before opening a
pull request; the order between them doesn't matter locally:

```bash
npm run check:types   # vue-tsc, no emit
npm test              # vitest, the unit and component suite
npm run check:lint    # eslint over the whole project
npm run check:i18n    # guards messages/*.json against reintroducing banned mistranslations
```

The e2e layer drives a real Obsidian binary through WebdriverIO. It's slow, so
run it locally when your change touches runtime behavior — note creation,
auto-attach, views, migration, Templater interop — and skip it for a
docs-only or pure-refactor change. Per-suite scripts:

```bash
npm run test:e2e:smoke
npm run test:e2e:integration
npm run test:e2e:migration
npm run test:e2e:interop
```

The `journeys` suite has no npm alias; run it directly:

```bash
npx wdio run ./wdio.conf.mts --suite journeys
```

There's no single script that runs exactly those five: `npm run test:e2e`
runs the bare `./e2e/**/*.e2e.ts` glob, which is the nightly lane — it also
picks up `quarantine`, the non-blocking flaky lane that never gates a merge.
Run the per-suite scripts above, plus `journeys`, to reproduce what pull
requests actually run in CI.

## Making a change

Write the test first. Unit tests sit beside the implementation as `*.test.ts`.

No `eslint-disable` comments — the lint config rejects the comment itself, so
the fix has to be in the code.

User-facing copy goes in `messages/en.json`, not in the generated
`src/i18n/paraglide` output. Sentence case, en-US.

Add the key to the other ten locale files in the same pull request. `check:i18n`
has no key-parity check, so `en.json` alone passes every gate while the string
silently falls back to English everywhere else — nothing will tell you, or the
maintainer, that a locale has gone stale.

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
(`Fixes #123`) when there is one — release notes are assembled by matching
commits against closed issues, and a closing keyword is the reliable way to
link your fix to its issue and pick up the issue's title as the changelog
wording. A `fix` commit with no issue reference is still swept in and
summarized on its own, so nothing is silently dropped, but linking avoids a
duplicate or orphaned bullet.

Add a `CHANGELOG.md` entry under `[Unreleased]`, in `### Features` or
`### Bug Fixes`, written for the person using the plugin — what changed for
them, not what changed in the code. Use the existing entries as the model.

Branch from `main` and open the pull request against `main`.

## Going deeper

- [`docs/architecture.md`](docs/architecture.md) — the conventions the code is
  built on: dependency injection, `Result`/`Option`, dates, schemas,
  internationalization, testing.
- [`CONTEXT.md`](CONTEXT.md) — the domain vocabulary the codebase reasons in.
- [`docs/e2e-testing-strategy.md`](docs/e2e-testing-strategy.md) — what the
  end-to-end suite covers and why it exists alongside the unit suite.
- [`docs/releasing.md`](docs/releasing.md) — how a version reaches the
  community plugin browser. Maintainer-facing; you don't need it to contribute.
