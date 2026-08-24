# Unit and component testing strategy

How we write the 4,190 tests that run against `__mocks__/obsidian.ts` — the fast
suite. The end-to-end layer, which exercises a real Obsidian process, is a
separate subject with its own owner: [`docs/e2e-testing-strategy.md`](e2e-testing-strategy.md).

## Why this doc exists

Three pains, in the order they cost the most:

1. **Cost of change.** Touching source broke tests that had no behavioral stake
   in the change. A new test cost around forty lines of ceremony before its
   first assertion.
2. **Unreadable as documentation.** The intent of a test was buried in setup.
3. **Contributors invent a harness each.** With no documented pattern, every
   contributor — human or agent — wrote its own container builder and its own
   entity fixtures. The suite carried 27 local container builders and 29 local
   fixture factories.

Distrust of the suite's _signal_ is deliberately not on that list. The suite
catches what it is meant to catch; what it cost to write and read was the
problem.

## Tiers

Four tiers. Every new test is routed by one rule, and the rule is: **write it as
a pure test; descend a tier only when you cannot.**

| Tier          | Wiring                                         | Belongs here when                                                                                                |
| ------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Pure**      | none                                           | The unit takes everything it needs as arguments. Calendar periods, schemas, template rendering, config defaults. |
| **Service**   | `testContainer` + the feature's core module(s) | Behavior spanning real collaborators inside one feature.                                                         |
| **Component** | `testContainer` + `harness.render`             | Behavior a user can see or trigger.                                                                              |
| **E2E**       | real Obsidian                                  | The seam the fake host cannot reach. Owned by [`docs/e2e-testing-strategy.md`](e2e-testing-strategy.md).         |

If you reached for a container in what should have been a pure test, the unit
wants an argument, not a dependency.

`src/journals/settings/ui/use-collision-check.ts` is the worked example of doing
this right. The composable genuinely needs a container — it calls `useService` —
but its logic lives in the pure `findPathCollision` in
`name-template-collision.ts`, whose test
([`src/journals/settings/ui/name-template-collision.test.ts`](../src/journals/settings/ui/name-template-collision.test.ts))
builds no harness at all. Extract the pure core, test it pure, and the thin
composable keeps a small service test.

## Wiring

One entry point, `testContainer` from `@/testing`. It always supplies the
logger (a memory sink), flows, settings core, calendar, templates, and the host
via `createHostModule`. Everything else is opt-in, one line per feature:

```ts
const harness = await testContainer({
  modules: [journalsCoreModule],
  data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
});
```

| Option       | What it does                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules`    | Feature **CORE** modules (plus UI modules for component tests). Never a full `<feature>Module` — see below.                                                                                                                     |
| `data`       | Seeded settings, keyed by collection or slice key, parsed by the real schema. Omit it entirely, rather than passing `{}`, to simulate a fresh install.                                                                          |
| `overrides`  | `overrideWith(Token, fake)` entries, applied after every module registers and before `autoLoad` resolves anything.                                                                                                              |
| `initialize` | Services to `initialize()` after `autoLoad`, named per test. `main.ts` initializes eight; a test opting into two modules cannot run that list, and baking one into the harness would be a second wiring definition that drifts. |
| `autoLoad`   | Defaults to `true`. `false` for a test that must not boot eager services.                                                                                                                                                       |
| `allow`      | Disarms a guard for a test whose subject **is** the guarded thing.                                                                                                                                                              |

`TestHarness` hands back:

| Handle                                                                          | Use                                                                                          |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `resolve(Token)`                                                                | the bound resolver; carries both the single- and multi-token overloads                       |
| `container`                                                                     | the raw `Container`, for the rare case `resolve` cannot cover                                |
| `render`, `renderModal`                                                         | see [Mounting](#mounting)                                                                    |
| `modals`                                                                        | for code that **opens** a modal — `modals.lastOpen()`                                        |
| `host`                                                                          | the fake vault: `putFile`, `putFolder`, `emitVault`, `emitMetadata`, `commands`, `workspace` |
| `logs`, `notices`, `suggests`, `inputSuggests`, `templater`, `data`, `settings` | the fakes and seams                                                                          |
| `dispose`                                                                       | rarely needed — the harness disposes itself via `onTestFinished`                             |

**The harness disposes itself, and the default calendar is installed globally.**
A test needs no `afterEach(cleanup)`, no `dispose()` call, and no
`installTestCalendar` triple. `installTestCalendar({ dow, doy })` remains for a
test that needs a non-default week grid; the global `beforeEach` re-pins every
test to the default grid before it runs, so a changed grid cannot reach the next
test.

`host.pluginData` is inert. It backs the fake plugin's own `loadData`/`saveData`,
but `PluginData` is overridden, so nothing in the resolved graph reaches it. The
live seam for settings persistence is the `data` handle.

### Override through the option, never the handle

`overrides` entries are applied in the one safe window — after every module has
registered, before `autoLoad` constructs anything eager. Overriding through
`harness.container` afterwards is a trap: whether it succeeds depends on whether
some eager service happened to resolve the token first, which changes whenever
an unrelated module gains a dependency. An eager one throws
`CannotOverrideError{reason:"resolved"}`.

`Container.override` is lint-restricted to test files and `testing.ts`. It
exists for the host boundary and has no production caller.

### Modules split three ways

Tests reuse production module _slices_ rather than a parallel set of test
modules — a parallel set would be a smaller instance of the disease this
standard cures.

- `<feature>CoreModule` — services and event buses. No `.eager()`, no UI
  tokens, no settings-section registrations.
- `<feature>UiModule` — UI-surface tokens, in its own file. These construct
  nothing, so a component test can take them without the host side effects.
- `<feature>StartupModule` — registrations whose constructors touch the host.
- `<feature>Module` — core + ui + startup. What `main.ts` composes; unchanged.

The full module never restates its core module's list, so the two cannot drift.

**The split rule is mechanical.** A service is _startup_ if either clause holds;
otherwise it is _core_:

1. **Construction causes a host side effect.** `JournalNavigationCommands`
   registers commands in its constructor, so including it in core would leave
   `host.commands` non-empty in every test of that feature.
2. **It injects another feature's tokens.** `.eager()` plus `autoLoad: true`
   means the service is constructed in every test including its module, so a
   cross-feature eager service in core throws `TokenNotRegisteredError` unless
   the caller also passes the other feature.

A service may be moved out of its original registration position only if it has
no disposer and its constructor's side effects are order-independent. Check that
before preserving a position; three journals services qualified and moving them
was observationally identical, confirmed against the e2e suite.

Service tests take core. Component tests take core plus ui. Only a test whose
subject **is** a host registration passes a full module, with
`allow: { hostState: true }`.

### The two guards

`testContainer` throws rather than letting a misconfigured boot pass quietly.

`TestContainerLeakedHostStateError` fires when a boot left commands, setting
tabs, or ribbon icons behind — which a core module never produces. The usual
cause is a full `<feature>Module` in `modules`. **The type system does not catch
this**: the tokens a full module adds beyond core are all multi-tokens, whose
bindings are additive, so registering one a second time succeeds silently.
`allow: { hostState: true }` is for a test that asserts on `host.commands` on
purpose — not for "the guard is in my way". A component test needing UI tokens
takes `<feature>UiModule`.

`TestContainerInvalidSeedError` fires when a `data` fixture did not survive the
settings parse unchanged. The parse never rejects an entry — it field-repairs it
or falls back to the default item, leaving only a log line — so without the guard
a test asserts against a journal it did not ask for and fails somewhere far away.
**If it fires, your fixture is incomplete; fix the fixture.**
`allow: { dataRepair: true }` is only for a test whose subject _is_ the repair
path.

## Mounting

`harness.render` and `harness.renderModal` come pre-bound to the harness's
injector, so it cannot be forgotten and no container is threaded through call
sites. Under `src/journals` — the directory converted onto this harness —
importing `@testing-library/vue`'s raw `render` in a file that already builds
a harness is a lint error; the guard is scoped to that directory only, so an
unconverted file elsewhere (`src/shelves/ui/ShelfEditSubpage.test.ts`, for
example) can still import it directly.

```ts
harness.render(JournalEditSubpage, { props: { journalName: "work", nav: noopNav } });
const { submit } = harness.renderModal(RenameJournalModal, { props: { currentName: "daily" } });
```

Both prepend the harness's own plugin — the one that provides the injector,
and for `renderModal` also the modal API — ahead of whatever plugins the
caller passed in `global.plugins`; a caller's `global.stubs` and
`global.provide` pass through untouched.

**`renderModal` and `modals` are not interchangeable.** `renderModal` mounts a
component that **is** a modal, wiring its `useModal()` to mock `submit`/`cancel`.
For a component that **opens** a modal, assert on `modals.lastOpen()` instead.
Picking the wrong one produces a test that passes without exercising anything.

## Fixtures and seeding

**A fixture never contains a literal that restates a schema default or a
production defaults function. It delegates.**

Two delegation forms. Journals has a production defaults factory, which is
richer than the schema defaults — `journalDefaultsFor` populates `navBlock`
and a per-type `nameTemplate` that the schema's own defaults do not:

```ts
export function fixedJournal(name: string, write: JournalWrite, overrides: Partial<JournalConfig> = {}): JournalConfig;
```

(`src/journals/testing.ts`.)

A feature with no defaults factory of its own parses a minimal object through
the production schema instead, then applies overrides. No fixture like this
exists yet for commands — this is the shape a Phase 3 sweep should write, not
a file to go looking for:

```ts
export function buildCommand(overrides: Partial<CommandConfig> = {}): CommandConfig {
  return { ...v.parse(commandConfigSchema, MINIMAL_COMMAND), ...overrides };
}
```

The schema-parse form fails loudly when the schema changes and cannot drift.

**Naming: `build<Entity>(overrides)`.** Keep a variant-named wrapper only where
the variant genuinely changes the shape — `fixedJournal` versus `customJournal`.

**Fixtures live in the feature's `testing.ts`**, never as a local factory in a
test file. Under `src/journals` — the only directory converted onto this
harness so far — a local `makeJournal`/`seedView`/`viewWith` is a lint error:
eslint's `no-restricted-syntax` bans a `make`/`build`/`seed`/`create`
function-name pattern there, pointing back at the feature's `testing.ts`. The
rule extends to each directory as its own sweep converts it.

### The standard for new tests

`testContainer({ data })` routes through the real settings parse. It is the
standard, and the only seeding path a new test should use: a name-keyed
record mirroring on-disk settings, not an array.

The path it is retiring still exists. Five `static fromParts` methods —
`src/journals/repository.ts:33`, `src/commands/repository.ts:22`,
`src/shelves/repository.ts:24`, `src/shelves/service.ts:11`,
`src/views/repository.ts:20` — bypass the schema entirely: each does
`Object.create(this.prototype)` to skip the constructor, then casts through a
local `Mutable` interface to write protected fields. Fourteen test files, all
in directories not yet converted, still call the matching
`fakeRepo`/`fromParts` fixture. Data seeded that way never sees the parse
defaults or the repair path, and the helpers live in production source, which
the [file-location rules](architecture.md#testing) forbid. Deleting a
feature's `fromParts` is the closing step of that feature's Phase 3 sweep —
not a decision to make ahead of the sweep that owns it.

### Fakes do not carry error queues

A fake never grows a `simulate*Error` queue. A test that needs an error path
uses `vi.spyOn` with `mockReturnValueOnce`. A baked-in queue adds a parallel
state machine — typed buffers, ordering, drain semantics — to every fake, to
serve the minority of tests that need one.

## Assertions

**Spy on a boundary you cannot see past; assert the outcome whenever the
outcome is observable.** The discriminator is whether the fake host can show
you the result.

A spy is right for `flows.invoke` in a component test: components call
`void flows.invoke(Flow, args)` fire-and-forget, so dispatching the flow _is_
the entire contract and there is no result to observe.

A spy is wrong for something like `creation.attachNote`
(`src/journals/notes/note-creation.ts`). The contract is the frontmatter
written to the note, and that is readable through the fake host's vault.
Assert the note, not the call. The suite leaned on spies partly because the
old partial fakes had no vault; the fake host removes that excuse.

### One behavior per test

> When tests share an identical arrange and act and differ only in which
> field of one result they read, they are one test. When the arrange differs,
> they stay separate.

A test name containing "and" is describing two tests. Name a test as subject
plus verb — "rejects an empty title", not "title validation". Express scope
with nested `describe()` blocks, not dashes, colons, or periods packed into
one label.

### Do not test the framework, and do not test constants

Skip a test whose only assertion is the framework's own contract: `instanceof`
on an error subclass that only calls `super()`, Promise thenable behavior, Vue
lifecycle, vee-validate, moment locale switching. Ask what application
behavior would break the test. If the answer is "only if Vue breaks", delete
it.

Likewise a test that restates one literal from a defaults function proves the
literal was copied twice. The invariant version — "accepts the unmodified
defaults for a {type} journal", asserting that the defaults satisfy the
schema — is the one worth keeping. The discriminator is **"would a user
notice if this literal changed"**, not "does it restate a literal": a default
a user sees on every newly created journal is behavior, and a test pinning it
stays.

### Query by role, text, and label — through `m.*()`

Vue components are tested through `@testing-library/vue` with `user-event`,
querying by role and text rather than by CSS class or test-only attributes.
Pass user-facing copy through the generated paraglide messages so a reword
becomes a typecheck failure instead of silent drift:

```ts
await userEvent.click(screen.getByText(m.common_action_submit()));
```

One carve-out: grid surfaces address cells positionally, and the e2e layer
already pins day cells by `data-anchor`. Those may use attribute selectors.
Everything else may not.

### No ceremony around matchers

No wrappers around `expect()` chains, and no test-local re-implementations of
library factories. A narrowing helper that returns the inner value and prints
the actual `Err` earns its place — `expectOk`/`expectErr`
(`src/infrastructure/result/testing.ts`) are the standing example — one that
hides a matcher does not.

No type ceremony in a mock assertion either. Write:

```ts
expect(submit).toHaveBeenCalledWith({ newName: "morning" });
```

Vitest's matchers take unconstrained generics and do not typecheck the
expected value. That is fine here, because a wrong key fails the assertion
loudly. Type checking earns its place only where a mistake causes a **silent
pass** — which is why `m.*()` is mandatory for user-facing copy and nothing
analogous is mandated for mock arguments.

Use `expectTypeOf` for compile-time type assertions; never `@ts-expect-error`.

### Naming

`harness`, never `h`. `container`, never `c`. Single letters are for loop
indices.

## Isolation

The unit suite runs `isolate: false` in a shared vitest project, so workers
reuse one module registry across the files they run. That is what keeps the
suite fast: the import graph is paid once per worker instead of once per file.

The cost is that a file can reach the next one through anything
process-global. A test that does belongs in `*.isolated.test.ts`, which runs
in its own registry. Two kinds are known:

- `vi.mock`, whose factory replaces the module for every later file in the
  worker. This one is eslint-enforced.
- Rewriting moment's **global** locale, which leaves the next file on a
  different week grid.

The resulting flake surfaces as a nondeterministic count in a _different_ file
than the polluting one, which is why the rule is worth following before you
have a failure to explain.

**`vi.mock` is for third-party modules only** — modules that cannot run under
happy-dom, such as `@vueuse/integrations/useSortable` and `obsidian`. Not the
project's own modules, and never a child component: mocking a child asserts
which component the parent renders rather than what the user sees. Reach for
a container override instead.

## Enforcement

All rules use `no-restricted-syntax` selectors — the mechanism the config already
uses for the `vi.mock` ban. No custom plugin.

| Rule                                                           | What it catches                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| No `new Container()` in a test                                 | Build it with `testContainer()` from `@/testing`              |
| No `.register(...).use*` inside a test body or hook            | Pass a feature CORE/UI module to `testContainer({ modules })` |
| No local entity factories                                      | Fixtures live in the feature's `testing.ts`                   |
| No raw `render` import in a file that already builds a harness | Mount through `harness.render`, which binds the injector      |
| `vi.mock` only in `*.isolated.test.ts`                         | The shared module registry, see [Isolation](#isolation)       |

**Scope is per-directory, and rolls out as each feature converts.** Today the
full set is enabled for `src/journals/**/*.test.ts`; the base `vi.mock` rule
applies to every `**/*.test.ts`. A Phase 3 sweep enables the rest for its own
directory in the same PR that converts it.

Two mechanics that have already caused a silent failure once each:

- **Flat-config rule options replace, they do not merge.** A per-directory block
  must sit _after_ the general test-file block and **re-declare the `vi.mock`
  selector**, or the ban silently lifts for that whole feature.
- **A selector matching nothing looks identical to one that works.** Verify a new
  rule by writing a violation and watching it fire, then removing it.

Two selectors are deliberately narrowed, and the narrowing is load-bearing:

- The `.register` ban matches a binding chain **inside a test body or hook**,
  because a bare `.register(` also names `JournalsIndex.register`, the domain
  method the suite seeds index entries through.
- The raw-`render` ban is conditioned on the file already importing `@/testing`,
  rather than banned outright — a pure-tier component test whose component
  injects nothing needs no injector. An allowlist of those files was rejected
  because a stale `ignores` glob that matches nothing is indistinguishable from a
  working one.

### The coverage floor

`npm run coverage` enforces a floor in `vitest.config.mts`, and `checks.yml` runs
it in place of `npm test`. It is a floor to catch silent deletion during the
conversion campaign, not a target to chase.

DI wiring files — `src/**/module.ts` and `src/**/ui-module.ts` — are excluded.
Module wiring is not testable by this standard's own rules, so counting it
measured lines nobody was permitted to act on, and every module split added a
fresh zero-covered file that dragged the floor down.

**The thresholds are never regenerated automatically.** A PR that lowers coverage
edits the numbers in the same diff, where a reviewer sees the change. An earlier
gate in this campaign counted assertions against a committed baseline and was
deleted precisely because the cheapest route past a failure was regenerating the
baseline, which trains reviewers to dismiss it.

## What not to test

Module wiring, barrel shapes, and the fakes themselves. The compiler and the
tooling already guarantee those, and a test for a fake tests test infrastructure
rather than behavior. Wiring is the e2e suite's job: dropping a startup module's
registration leaves `npm test` fully green while the e2e command-palette journey
fails immediately.

`src/testing.ts` is the exception the rule implies rather than contradicts. Its
guards and options have behavior that can fail — a seed silently repaired, a leak
undetected, an override applied after the service resolved — and a defect there
makes every test in the repo lie. Test those. Its wiring stays untested like any
other module's.

## Exemplars

Copy these rather than the prose.

| Tier              | File                                                                                                                      | What it shows                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Pure              | [`src/journals/settings/ui/name-template-collision.test.ts`](../src/journals/settings/ui/name-template-collision.test.ts) | 38 lines, no harness at all — that is the point                 |
| Service           | [`src/journals/cycle.test.ts`](../src/journals/cycle.test.ts)                                                             | both halves of the arrange rule, at scale                       |
| Component / modal | [`src/journals/settings/ui/RenameJournalModal.test.ts`](../src/journals/settings/ui/RenameJournalModal.test.ts)           | `renderModal`, a `data` seed, and copy asserted through `m.*()` |
