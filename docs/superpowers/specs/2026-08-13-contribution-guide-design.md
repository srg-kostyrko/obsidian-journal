# Contribution guide

## Problem

The repository tells a would-be contributor almost nothing. The only guidance is three
sentences at the end of `README.md`: contributions are welcome, and larger features should
start with an issue. There is no `CONTRIBUTING.md`, no issue forms, and no pull request
template.

Everything a contributor actually needs is undocumented or scattered:

- **Setup.** `npm run dev` builds into `test-vault/.obsidian/plugins/journals` with hot-reload,
  which is discoverable only by reading `vite.config.mts`. The paraglide output under
  `src/i18n/paraglide` is generated and git-ignored, so a fresh clone fails type-checking until
  `compile:i18n` runs — with no message explaining why.
- **Quality gates.** `.github/workflows/checks.yml` runs `compile:i18n`, `check:i18n`,
  `check:types`, `test`, and `check:lint`; `e2e.yml` runs five WebdriverIO suites on every pull
  request. A contributor learns this from a red build.
- **Conventions.** The codebase carries a dense, deliberate convention layer — feature-directory
  layout, constructor-time dependency injection, `Result`/`Option` composition, valibot as the
  source of truth for types, colocated behaviour-named tests. Part of it is enforced by
  `eslint.config.mjs`; the rest exists only as tribal knowledge. A contributor cannot infer the
  unenforced half, and a reviewer ends up teaching it one pull request at a time.
- **Commit and changelog expectations.** Commits follow Conventional Commits with a scope; the
  release notes are assembled from closing keywords (`Fixes #123`) and from `CHANGELOG.md`
  `[Unreleased]`. Neither is written down.

`CONTEXT.md` documents the domain vocabulary well, but says nothing about how to build, test, or
submit a change.

## Scope

Three artifacts plus one edit:

| File                                                  | Role                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `CONTRIBUTING.md`                                     | Onboarding and workflow, self-contained for a first-time PR |
| `docs/architecture.md`                                | Conventions catalogue and the load-bearing design decisions |
| `.github/ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md` | Structured intake                                           |
| `README.md`                                           | Closing "Contributing" paragraph becomes a pointer          |

`CONTEXT.md` is not modified; `docs/architecture.md` links to it as the domain glossary.

Out of scope: rewriting the README's user documentation, a code of conduct, a security policy,
and any change to the CI workflows themselves.

### Two layers, one entry point

`CONTRIBUTING.md` is written for someone who found a bug or wants to submit a small fix. It must
carry them from clone to merged pull request without requiring the second document.
`docs/architecture.md` is for anyone going further — a larger feature, or an AI agent working in
the repository — and is reached from `CONTRIBUTING.md`, never required by it.

### Written for the released state

3.0 ships within days, at which point `main` carries the v3 architecture. Both documents describe
that architecture and direct contributors at `main`, with no in-development branch banner and no
v2/v3 split to unwind after the release. The files are committed on `v3-ai` and reach `main` with
the release merge.

## `CONTRIBUTING.md`

1. **Intro** — what the plugin is, that issues and pull requests are welcome, and that larger
   features should start with an issue.
2. **Reporting bugs and requesting features** — points at the issue forms; states what makes a
   report actionable.
3. **Development setup** — Node 24, matching CI. `npm ci`, then `npm run compile:i18n` (generated,
   git-ignored, required before type-checking), then `npm run dev`, which builds into
   `test-vault/.obsidian/plugins/journals` with hot-reload. Open `test-vault/` in Obsidian.
4. **Quality gates** — `check:types`, `test`, `check:lint`, `check:i18n`, all four run by CI on
   every push. `test:e2e` for runtime-touching changes, with the five suites named (smoke,
   integration, migration, interop, journeys) and the caveat that they drive a real Obsidian
   binary and are slow.
5. **Making a change** — tests first, colocated as `*.test.ts` beside the implementation. No
   `eslint-disable`; fix the code. User-facing copy goes in `messages/en.json` only — never in
   another locale file, and never in the generated paraglide output.
6. **AI-assisted contributions** — welcome; point the agent at `CONTEXT.md` and
   `docs/architecture.md` first, and hold the result to the same gates.
7. **Commits and pull requests** — Conventional Commits with a scope and an imperative lowercase
   subject (`fix(nav): scope a custom journal's row decorations`); the project also uses an
   `i18n(...)` type. Link the issue with a closing keyword, since release notes are assembled from
   them. Add a `CHANGELOG.md` `[Unreleased]` entry in user-facing language — what changed for the
   person using the plugin, not what changed in the code.
8. **Going deeper** — links to `docs/architecture.md`, `CONTEXT.md`, and
   `docs/e2e-testing-strategy.md`.

## `docs/architecture.md`

A conventions catalogue, written lint-aware: a rule already enforced by `eslint.config.mjs` gets a
one-line entry marked _(eslint)_, and the explanation budget goes to what tooling cannot catch.
This keeps the document from becoming a second, drifting source of truth for the enforced half.

1. **Code layout** — `src/<feature>/` with `ui/` for single-file components and `modals.ts`,
   `flows/` for `*.flow.ts`, and the feature root for domain code and `module.ts`. A subfolder is a
   sub-feature exactly when it has its own `module.ts`. _(eslint: component location, flow
   location, `defineModal` consolidation)_
2. **Dependency injection** — the container wires components during boot. Constructor-time
   injection only; no runtime service lookup from feature code. Eager bindings resolve through a
   separate `autoLoad` step. `Container` is the default lifetime and is never spelled out. Import
   cycles pass every unit test and abort at real boot — the e2e suite is the guard.
3. **Result and Option** — compose pipelines as one `attempt.in` block; `tap` is ok-only and
   `tapErr` is err-only, so branch dispatch lives in the API rather than in caller-side kind
   checks. Use `Option.getOrUndefined()` at Vue and other reactive edges. Every `Error` subclass
   lives in its feature's `errors.ts`.
4. **Dates and union dispatch** — reach moment only through the calendar abstraction _(eslint)_;
   step dates through `Period` and `CalendarDate` rather than raw arithmetic. Dispatch on
   discriminated unions with `ts-pattern`'s `match().exhaustive()`, not `switch`.
5. **Schemas and types** — valibot schemas are the source of truth; infer with `v.InferOutput` and
   carry brands through `v.transform`. Brands are structural (`{ __brand: true }`); unique symbols
   trip TS4023 when inferred types cross module boundaries.
6. **Internationalization** — copy lives in `messages/en.json`; `src/i18n/paraglide` is generated
   and git-ignored and must never be staged. No `m.*()` call at module scope _(eslint)_ — locale
   initialization happens inside `onload()`, so a module-scope call freezes to English. Weekday and
   month names come from moment's locale data, not from message keys. `check:i18n` guards the
   glossary.
7. **Testing** — unit tests colocated with the implementation; shared test infrastructure in a
   sibling `testing/` directory. Vue components are tested through `@testing-library/vue` and
   `user-event`. Assert observable outcomes, one behaviour per test, with the test name reading as
   subject and verb. Do not test wiring, barrel shapes, or the fakes themselves. Points at
   `docs/e2e-testing-strategy.md` for the e2e layer.
8. **Further reading** — `CONTEXT.md` for domain vocabulary, `docs/superpowers/` for the specs and
   plans behind larger features.

## GitHub templates

- **`ISSUE_TEMPLATE/bug_report.yml`** — plugin version, Obsidian version, operating system, steps
  to reproduce, expected versus actual behaviour, console output, other plugins active (Templater,
  Calendar, Daily notes), and the relevant journal configuration.
- **`ISSUE_TEMPLATE/feature_request.yml`** — the problem being solved, the proposed behaviour, and
  alternatives considered.
- **`ISSUE_TEMPLATE/config.yml`** — blank issues disabled, with a link to the README documentation.
- **`PULL_REQUEST_TEMPLATE.md`** — what changed and why, the linked issue with a closing keyword,
  and a checklist covering `check:types`, `test`, `check:lint`, `check:i18n`, e2e when the change
  touches runtime behaviour, and the `CHANGELOG.md` entry.

## Verification

Documentation, so the checks are on the claims rather than on behaviour:

- Every npm script, path, and file name named in either document exists.
- The setup sequence works from a clean clone: `npm ci`, `compile:i18n`, `check:types` passes,
  `npm run dev` produces a loadable plugin in `test-vault/`.
- Every rule marked _(eslint)_ has a matching rule in `eslint.config.mjs`.
- The issue forms parse as valid GitHub issue form YAML.
- `check:lint` passes, since prettier formats markdown in this repository.
