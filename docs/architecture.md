# Architecture

This document catalogs the conventions this codebase is built on. Entries marked
_(eslint)_ are checked by `eslint.config.mjs` — the mark says **who checks the
rule, not how much it matters**. The unmarked rules are exactly as binding; they
are simply the ones tooling cannot see. `CONTEXT.md` is the companion to this
file: it defines the domain vocabulary, this one defines how the code is built.

## Code layout

Each feature lives at `src/<feature>/`:

- `<feature>/ui/` holds Vue single-file components and the feature's `modals.ts`.
- `<feature>/flows/` holds `*.flow.ts` files — one user-initiated, multi-step
  operation per class, one `execute()` entry point.
- The feature root holds domain code and `module.ts`, the feature's DI wiring.

A subfolder is a **sub-feature** exactly when it has its own `module.ts` (for
example `src/journals/notes/` or `src/journals/settings/`); otherwise its
contents fold into the parent feature.

Barrel files export public API only (e.g. `src/journals/index.ts`). Test
helpers go in a separate `testing.ts` barrel (e.g. `src/journals/testing.ts`)
so test-only code stays out of the production bundle.

Enforced location rules _(eslint)_:

- Vue SFCs must live under a `<feature>/ui/` directory.
- `*.flow.ts` files must live under a `<feature>/flows/` directory.
- `defineModal()` calls are only allowed in `<feature>/ui/modals.ts` or
  `src/infrastructure/host/modals/**/*.ts`.
- `src/**/*.ts` filenames are kebab-case; `src/**/*.vue` filenames are
  PascalCase. `**/*.test.ts`, `**/*.bench.ts`, and `src/i18n/paraglide/**`
  are exempt and may use either case — a test file
  commonly takes its component's PascalCase name instead (e.g.
  `src/ui/UiCollapsibleBlock.test.ts`, colocated with `UiCollapsibleBlock.vue`).

## Dependency injection

The container is a wiring tool used during boot, not a runtime service locator.
Constructor-time injection — positional constructor arguments, or `inject()`
called during construction — is the pattern; runtime lookups from feature code
are not. Prefer a field initializer over assigning in the constructor body:

```ts
readonly #x = inject(SomeToken);
```

over assigning the same thing inside the constructor.

Eager (`.eager()`) bindings resolve through a separate `autoLoad()` step called
from `src/main.ts`, not at container build time.

`Lifetime.Container` is the default — one instance per container — and is never
written out. Only `Scoped` and `Transient` are spelled out explicitly.

Use a `createXxxModule(args)` factory only when the module needs construction
arguments (e.g. `createHostModule(plugin)` in `src/infrastructure/host/module.ts`).
A zero-arg module exports a plain `const xModule: Module = { register(c) { ... } }`
value instead.

The trap: an import cycle between DI-wired modules passes every unit test —
mocked resolution doesn't care about module load order — and only aborts
`onload()` at real Obsidian boot. The e2e suite is the only guard against this.
Break a cycle with a lazy `InjectorToken` resolved at use time rather than
importing the token's owning module directly.

The same default makes **flows stateless by requirement**. A flow registers with
a bare `useClass`, so it takes the container lifetime, and `Flows.invoke`
resolves the identical instance on every call — everything an invocation needs
must live in its `execute()` parameters and locals. A per-invocation field (a
`#pending` promise, a cached lookup) compiles, passes its unit tests because
each test builds a fresh container, and corrupts the second invocation in
production only.

## Result and Option

Compose a `Result`/`AsyncResult` pipeline as a single do-notation block instead
of a chain of shadowed local variables:

```ts
attempt.in(this, function* () {
  const value = yield* someOperation();
  // ...
});
```

`attempt.in(this, ...)` binds `this` so the generator body can reach
`this.#field` without a `const self = this` shadow. Use
`yield* Option.fromNullable(x).okOrElse(...)` to turn a nullable lookup into a
short-circuiting failure.

`tap` runs on the ok branch only; `tapErr` runs on the err branch only — branch
dispatch belongs in the API the pipeline calls, not in caller-side `kind`
checks after the fact.

At Vue and other reactive boundaries, bridge an `Option` out with
`Option.getOrUndefined()` rather than `getOr(undefined as never)` or similar
casts.

Every `Error` subclass — including internal invariant errors — lives in its
feature's `errors.ts`, never declared inline at the throw site. Raw `new
Error()` is rejected in production source _(eslint)_ in favor of a named
subclass. The rule is switched off for `*.test.ts`, `*.bench.ts`, `testing.ts`,
and `**/testing/**` files, where constructing a raw `Error` to simulate a
failure (e.g. via `vi.spyOn`) is normal and common.

## Dates and union dispatch

`src/calendar/` owns every `moment` access; nothing outside it imports `moment`
at all. `no-restricted-imports` bans both routes _(eslint)_: the bare package
(`import moment from "moment"`) and the Obsidian API's own re-export
(`import { moment } from "obsidian"`), which is the one the plugin actually
reaches for. `src/calendar/**` is exempt from the second — that module is the
abstraction — and so are test files, whose fixtures build dates without the
plugin's locale coupling.

What to use instead, all from `@/calendar`:

| Need                                | Use                                        |
| ----------------------------------- | ------------------------------------------ |
| A date to work with                 | `localMoment()`                            |
| Week config, weekday / month names  | `Calendar`                                 |
| Raw locale names and parse patterns | `localeData()`, `dayOfMonthOrdinalParse()` |

Step dates with `Period.next()`/`Period.previous()` and `CalendarDate`, never a
raw `localMoment().add(...)` call in domain code. Weekday and month names come
from the locale (see `src/calendar/calendar.ts`), not from a hand-duplicated
list.

Dispatch on discriminated unions with `ts-pattern`'s `match().with().exhaustive()`
rather than a `switch` statement — `switch` is not the default here, because
`.exhaustive()` fails to compile when a new union member goes unhandled.

## Schemas and types

Valibot schemas are the source of truth for persisted and validated shapes.
Infer the TypeScript type from the schema with `v.InferOutput<typeof schema>`
rather than declaring an equivalent `interface` alongside it, and carry branded
types through with `v.transform`.

Brands are structural — `{ __brand: true }` — not a unique `symbol`. A unique
symbol trips TS4023 ("cannot be named") the moment a schema's inferred type
crosses a module boundary.

## Internationalization

User-facing copy goes in `messages/en.json` only. `compile:i18n` generates
`src/i18n/paraglide`, which is git-ignored and must never be staged.

No `m.*()` call at module scope in `src/**/*.ts` _(eslint)_: `initLocale()`
runs inside `onload()`, so a message resolved at module-evaluation time
freezes to the base locale for every user, before the user's actual locale is
known. Wrap the call in a factory (a function, arrow, or class field
initializer) invoked at use time instead. The rule doesn't run on `.vue`
files: a `<script setup>` body reads as module scope in the AST, but Vue
executes it per component instance rather than at import time, so the
eager-evaluation hazard the rule guards against doesn't arise there.

Do not wrap an `m.*()` call in `computed()` unless its arguments include
reactive data — a static string needs no reactive wrapper.

`check:i18n` checks all eleven message files (including `en.json`) against
hardcoded banned-term, literal-token, and mechanical rules in
`scripts/check-i18n-glossary.mjs`; the banned-term glossary applies only to
the ten translated locales. `docs/i18n-glossary.md` documents those rules and
the mistranslations that motivated them.

## Testing

Unit tests are colocated as `*.test.ts` beside the implementation they cover.
Vue component tests sit beside their `.vue` file (e.g.
`src/ui/UiCollapsibleBlock.test.ts`). Shared test infrastructure lives in a
sibling testing/ directory or a `testing.ts` file (e.g.
`src/journals/testing.ts`), never in a top-level mocks/ or fixtures/ folder —
that separation is what keeps test-only code out of the production bundle.

A test that reaches past its own file through a process-global is named
`*.isolated.test.ts` and runs in its own module registry; see the isolation
section of the unit testing doc for why.

How to write those tests — tiers, the `testContainer` harness, fixtures,
assertions, and the lint rules that enforce them — is documented in
[`docs/unit-testing-strategy.md`](unit-testing-strategy.md).

The end-to-end layer — what it covers, how it's structured, and why the
mock-based unit suite can't reach it — is documented in
[`docs/e2e-testing-strategy.md`](e2e-testing-strategy.md).

## Further reading

- [`CONTEXT.md`](../CONTEXT.md) — the domain vocabulary this codebase reasons
  in.
- [`CLAUDE.md`](../CLAUDE.md) — standing project rules and the traps no
  convention here covers.
- [`docs/e2e-testing-strategy.md`](e2e-testing-strategy.md) — the end-to-end
  testing layer.
- [`docs/unit-testing-strategy.md`](unit-testing-strategy.md) — the unit and
  component testing standard.
- [`docs/i18n-glossary.md`](i18n-glossary.md) — the internationalization term
  glossary.
