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
- `defineModal()` calls are only allowed in `<feature>/ui/modals.ts`.
- `src/**/*.ts` filenames are kebab-case, `src/**/*.vue` filenames are
  PascalCase.

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
Error()` is rejected _(eslint)_ in favor of a named subclass.

## Dates and union dispatch

`moment` is reachable only through the calendar abstraction in `src/calendar/`
_(eslint)_ — feature code never imports `moment` directly.

Step dates with `Period.next()`/`Period.previous()` and `CalendarDate`, never a
raw `localMoment().add(...)` call in domain code. Weekday and month names come
from `moment.localeData()` (see `src/calendar/calendar.ts`), not from a
hand-duplicated list.

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

No `m.*()` call at module scope _(eslint)_: `initLocale()` runs inside
`onload()`, so a message resolved at module-evaluation time freezes to the base
locale for every user, before the user's actual locale is known. Wrap the call
in a factory (a function, arrow, or class field initializer) invoked at use
time instead.

Do not wrap an `m.*()` call in `computed()` unless its arguments include
reactive data — a static string needs no reactive wrapper.

`check:i18n` guards the glossary in `docs/i18n-glossary.md` against terms used
inconsistently across messages.

## Testing

Unit tests are colocated as `*.test.ts` beside the implementation they cover.
Shared test infrastructure lives in a sibling testing/ directory or a
`testing.ts` file (e.g. `src/journals/testing.ts`), never in a top-level
mocks/ or fixtures/ folder.

Vue components are tested through `@testing-library/vue` with `user-event`,
querying by role and text rather than by CSS class or test-only attributes.

Assert observable outcomes. Reach for a spy or a call-count assertion only when
the side effect itself is the contract being tested.

One behavior per test — a test name with "and" in it is describing two tests.
Name tests as subject plus verb ("rejects an empty title", not "title
validation"). Express test scope with nested `describe()` blocks rather than
dashes, colons, or periods packed into one label.

Use `expectTypeOf` for compile-time type assertions; never `@ts-expect-error`.

Don't test module wiring, barrel shapes, or the fakes/mocks themselves — the
compiler and the tooling already guarantee those, and a test for a fake tests
test infrastructure rather than behavior.

The e2e layer — what it covers, how it's structured, and why the mock-based
unit suite can't reach it — is documented separately in
[`docs/e2e-testing-strategy.md`](e2e-testing-strategy.md).

## Further reading

- [`CONTEXT.md`](../CONTEXT.md) — the domain vocabulary this codebase reasons
  in.
- [`docs/e2e-testing-strategy.md`](e2e-testing-strategy.md) — the end-to-end
  testing layer.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — the specs and
  plans behind larger features.
- [`docs/i18n-glossary.md`](i18n-glossary.md) — the internationalization term
  glossary.
