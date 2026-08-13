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

Then open `test-vault/` as a vault in Obsidian and enable the plugin under
Community plugins.

`compile:i18n` must run before the first `check:types` on a fresh clone: the
paraglide module it generates is not committed, so type-checking fails against
a clone that skipped it. That's the failure a newcomer hits first — if
`check:types` complains about `src/i18n/paraglide`, run `compile:i18n` and try
again.

Use Node 24, matching CI.

## Quality gates

CI runs these four on every push, in this order:

```bash
npm run check:types   # vue-tsc, no emit
npm test              # vitest, the unit and component suite
npm run check:lint    # eslint over the whole project
npm run check:i18n    # guards messages/*.json against reintroducing banned mistranslations
```

Run them locally before opening a pull request.

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

`npm run test:e2e` runs the whole stable suite (all five). Pull requests run
all five in CI.

## Making a change

Write the test first. Unit tests sit beside the implementation as `*.test.ts`.

No `eslint-disable` comments — the lint config rejects the comment itself, so
the fix has to be in the code.

User-facing copy goes in `messages/en.json` and nowhere else: not in another
locale file, which is machine-translated and reviewed separately, and not in
the generated `src/i18n/paraglide` output. Sentence case, en-US.

## AI-assisted contributions

AI-assisted contributions are welcome. Point the agent at
[`CONTEXT.md`](CONTEXT.md) and [`docs/architecture.md`](docs/architecture.md)
before it writes anything, and
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

Close the issue from the commit or pull request body with a closing keyword
(`Fixes #123`) — release notes are assembled from these, so an unlinked fix
won't be credited.

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
