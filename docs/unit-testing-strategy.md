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
sites. Importing `@testing-library/vue`'s raw `render` in a file that already
builds a harness is a lint error.

```ts
harness.render(ShelfEditSubpage, { props: { shelfName: "Work", nav } });
const { submit, cancel } = harness.renderModal(RenameJournalModal, { props });
```

Both merge a caller's `global.plugins`, `stubs`, and `provide`.

**`renderModal` and `modals` are not interchangeable.** `renderModal` mounts a
component that **is** a modal, wiring its `useModal()` to mock `submit`/`cancel`.
For a component that **opens** a modal, assert on `modals.lastOpen()` instead.
Picking the wrong one produces a test that passes without exercising anything.
