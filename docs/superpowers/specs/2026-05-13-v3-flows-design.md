# v3 Flows — Design

**Stage:** Flows infrastructure for the v3 plugin rewrite
**Date:** 2026-05-13
**Status:** Draft for review

## Purpose

Give v3 a uniform abstraction for encapsulating multi-step business
operations. v2 reimplemented the same orchestration — "filter candidate
journals, branch single-vs-picker, fan out to the per-journal open" — at
every call site that opened a date. `openDate` in `journals/open-date.ts`
contained one copy; `registerPluginCommand` in `utils/plugin-commands.ts`
contained a hand-rolled second copy; `NavigationBlock.vue` and the startup
path called `openDateInJournal` directly, bypassing the picker logic. Aborts
were silent (closed modals), and exceptions were dropped through
`.catch(console.error)`.

A flow is a parameterized operation a user might initiate. It has typed
params, may have interactive sub-steps (modal pick, confirm, menu), and
returns an `AsyncResult`. Surfaces — Obsidian commands, ribbon, hotkeys,
code-block clicks, navigation arrows, other flows — invoke flows through a
typed dispatcher. The dispatcher is the one canonical entry point per
operation, so the orchestration is written once.

The stage's deliverable is the `Flow` interface, the `Flows` dispatcher, a
`FlowError` base with the universal `UserAborted` variant, and a
`FlowsModule`. No feature flows yet — those land with their feature modules
(calendar, journals, etc.). Tests exercise the dispatcher via stub flows.

## Non-goals

- No programmatic cancellation (`AbortSignal`). Abort propagates through
  user-facing interactive steps via the `UserAborted` error variant. YAGNI
  until a real flow needs background cancel.
- No registry / enumeration API on `Flows`. Surfaces map flow classes to
  their own metadata directly; nothing needs a "list all flows" query.
- No automatic Obsidian-command registration. A future commands module
  explicitly declares which flows become commands and with what palette
  metadata.
- No flow versioning, serialization, replay, or persisted state.
- No bespoke interactive ports (journal picker, confirm dialog, mouse menu).
  Whatever a future flow needs gets injected from DI and returns
  `AsyncResult`; no design here.
- No refactor of the existing `LoggerFactory` / `LoggerFactoryToken` split.
  Flows establishes "class self-binds as its own token" as the going-forward
  convention; whether logger should follow is a separate decision (see Open
  follow-ups).

## Architecture

### Layout

```
src/infrastructure/flows/
├── index.ts          # public barrel
├── types.ts          # Flow<P, R, E>
├── errors.ts         # FlowError, UserAborted
├── flows.ts          # class Flows
├── module.ts         # FlowsModule
└── testing.ts        # test helpers — separate test-only barrel
```

Tests are colocated (`flows.test.ts`, `errors.test.ts`). No `index.test.ts`,
no `module.test.ts`, no `types.test.ts`.

### Class is the handle

Per the v3 DI design, `TokenLike<T> = Token<T> | Class<T>`: a class
constructor self-identifies as its own token via reference identity. Flows
exploit this. A flow's class is the dispatch handle; `Flows#invoke` extracts
P/R/E from the class type signature. There is no parallel `XxxFlowToken`
const, no `defineFlow` factory.

### Dispatcher uses `InjectorToken`

`Flows` resolves a flow class on each `invoke` call. It does this through
`InjectorToken` (the typed proxy escape hatch the v3 DI design already
introduced for exactly this case), not by holding a `Container` reference.
Feature code never sees the injector; it sees the typed `Flows#invoke` API.

## Public API

### Flow interface

```ts
export interface Flow<P, R, E = FlowError> {
  execute(params: P): AsyncResult<R, E>;
}
```

One method. P/R/E are declared on the implementing class.

### Flow implementation

```ts
export class OpenDateFlow implements Flow<OpenDateParams, void, UserAborted | NoMatchingJournal> {
  readonly #journals = inject(JournalRegistryToken);
  readonly #notes = inject(NotesServiceToken);

  execute(params: OpenDateParams): AsyncResult<void, UserAborted | NoMatchingJournal> {
    return attempt.in(this, async function* () {
      // ...
    });
  }
}

c.register(OpenDateFlow).useClass(OpenDateFlow);
```

The class constructor takes no arguments; dependencies come in through
field-initializer `inject()` (per the established v3 conventions). This is
load-bearing for the dispatcher — `Flows#invoke` types the flow as
`new () => Flow<P, R, E>`.

If a flow needs caller-provided values, they go in `params`, not in `new`.
Flows are stateless dispatchable units.

### Dispatcher

```ts
export class Flows {
  invoke<P, R, E>(flow: new () => Flow<P, R, E>, params: P): AsyncResult<R, E>;
}
```

Call site:

```ts
class NavigationBlock {
  readonly #flows = inject(Flows);

  onArrowClick(date: string) {
    return this.#flows.invoke(OpenDateFlow, { date, journals: ["daily"] });
  }
}
```

`Flows` self-binds as its own token. Registered in `FlowsModule`:

```ts
export const FlowsModule: Module = {
  register(c) {
    c.register(Flows).useClass(Flows);
  },
};
```

`FlowsModule` is wired into `main.ts` alongside `LoggerModule`.

## Error / Abort Model

### FlowError base

```ts
export abstract class FlowError extends Error {
  abstract readonly kind: string;
}

export class UserAborted extends FlowError {
  readonly kind = "user-aborted" as const;
  constructor(readonly source: string) {
    super(`User aborted at ${source}`);
  }
}
```

`UserAborted` lives in `flows/errors.ts` because every flow can produce it
(any interactive step). Per-flow error subclasses live in the _flow's_
feature module's `errors.ts` (per the project rule that errors belong with
their feature). Each extends `FlowError` and declares a literal `kind`
discriminator so callers can `match(err).with({ kind: '...' }, ...)` with
ts-pattern.

### E defaults to FlowError

```ts
interface Flow<P, R, E = FlowError> { ... }
interface Flows { invoke<P, R, E>(...): AsyncResult<R, E>; }
```

A flow that doesn't care to enumerate its errors leaves `E` at its default;
exhaustive matchers fall through `kind`. A flow that does enumerate gets
full exhaustiveness on its caller's `match().exhaustive()`.

### Caller pattern

```ts
const result = await this.#flows.invoke(OpenDateFlow, params);
return result.match({
  ok: () => undefined,
  err: (e) =>
    match(e)
      .with({ kind: "user-aborted" }, () => undefined)
      .with({ kind: "no-matching-journal" }, (e) => toast(`No journal for ${e.date}`))
      .exhaustive(),
});
```

Putting abort in the error channel forces every caller to acknowledge it.
v2's silent-on-abort behavior was a bug; the type system now blocks it.

### Non-FlowError exceptions are bugs

A flow that throws a plain `Error` from outside its `AsyncResult` (e.g. a
synchronous throw in `execute` before the first `yield`) propagates as a
rejected promise. That is a programming error — the flow should be
returning `AsyncResult` end-to-end. We don't catch it at the dispatcher.

## Dispatcher Internals

```ts
export class Flows {
  readonly #logger = inject(LoggerFactoryToken).named("flows");
  readonly #injector = inject(InjectorToken);

  invoke<P, R, E>(cls: new () => Flow<P, R, E>, params: P): AsyncResult<R, E> {
    const name = cls.name;
    const started = performance.now();
    this.#logger.debug(`${name} started`);

    const instance = this.#injector.resolve(cls);
    const ar = instance.execute(params);

    // Log on settle. Mechanism: a small tap/tapErr on AsyncResult, or a
    // .then-and-rewrap. Implementation detail; public shape unchanged.
    return tappedForLogging(ar, name, started, this.#logger);
  }
}
```

### Logging contract

| Outcome                         | Level | Fields           |
| ------------------------------- | ----- | ---------------- |
| Flow started                    | debug | name             |
| Ok                              | info  | name, ms         |
| Err, `instanceof UserAborted`   | info  | name, ms, source |
| Err, other `FlowError` subclass | error | name, ms, error  |

Params are not logged — they may contain user data (paths, dates). The
flow's own internals log whatever it considers relevant via its
constructor-injected logger.

### Flow lifetime

Flows register at the DI default (Container lifetime) — no
`.lifetime(...)` overrides. Flows are stateless: per-call state lives on
the call stack inside `execute`. The default-cached instance is reused
across invocations; this is safe because flows hold no per-call state.

### AsyncResult helpers

The dispatcher needs to peek at the settled `Result` without consuming it.
The existing `AsyncResult` exposes `then/map/mapErr/flatMap/match`; there is
no `tap`/`tapErr`. If a small `tap`/`tapErr` falls out cleanly during
implementation we add it to `async-result.ts`; otherwise the dispatcher
inspects via `.then(r => ...)` and re-wraps. This is an implementation
detail and does not change the public shape.

## Testing

### What gets tested

- `Flows#invoke` (in `flows.test.ts`, split per
  `feedback_one_behavior_per_test.md`):
  - resolves the flow class through the injector and calls `execute` with
    the params
  - logs `info` with `ms` on completion
  - logs `info` with `source` and `ms` on `UserAborted`
  - logs `error` with the error and `ms` on other `FlowError` subclasses
  - propagates the Ok value unchanged
  - propagates the Err value unchanged
- `UserAborted` (in `errors.test.ts`): the `source` field is on the
  instance and feeds into the `message`. No `instanceof FlowError` test
  (trivial parent-class check, banned by `feedback_no_trivial_tests.md`).

Stub flows in tests:

```ts
class OkFlow implements Flow<void, "done"> {
  execute() {
    return AsyncResult.ok("done");
  }
}
class AbortFlow implements Flow<void, never, UserAborted> {
  execute() {
    return AsyncResult.err(new UserAborted("test"));
  }
}
```

A fake `Injector` returns the right stub instance for the right class. No
real DI container is needed for `flows.test.ts`.

### What does not get tested

- `index.ts` barrel (per `feedback_no_wiring_tests.md`).
- `module.ts` — that `FlowsModule` registers `Flows` is wiring; tested
  indirectly when the v3 vertical-slice integration test resolves `Flows`
  from a container with `FlowsModule` installed.
- `types.ts` — pure type file.
- `Flow` interface — no runtime behavior.
- Helpers in `testing.ts` (per `feedback_no_mock_fake_tests.md`).

### Testing barrel

`testing.ts` is the separate test-only barrel
(per `feedback_barrel_files.md`) — not re-exported from `index.ts`.
Production code does not see it.

## Integration with main.ts

```ts
const container = new Container();
container.register(PluginToken).useValue(this);
container.register(ObsidianAppToken).useValue(this.app);
container.addModule(LoggerModule);
container.addModule(FlowsModule);
await container.autoLoad();
```

`Flows` itself does not require eager autoLoad — feature modules that
register flows must run before any caller invokes one, which is guaranteed
by `addModule` ordering. The `Flow` classes themselves register at default
lifetime; first invocation resolves and caches.

## Open follow-ups

These are not in scope for this stage but are recorded so they are not
forgotten:

- **Logger convention reconciliation.** `LoggerFactory` /
  `LoggerFactoryToken` predates the "class self-binds as its own token"
  decision made here. A steering note (in `.kiro/steering/structure.md`
  once that lands) should pick the canonical rule and either accept the
  inconsistency or refactor logger.
- **Per-flow interactive ports.** When the first feature flow with an
  interactive step lands (likely `OpenDateFlow`'s journal picker), the
  port shape — single coarse `Prompter` vs per-concept ports — gets
  decided in that feature's design, not here.
- **AsyncResult `tap`/`tapErr`.** If implementation produces a clean
  inline version, lift it into `async-result.ts`. Otherwise leave the
  dispatcher's `.then`-and-rewrap inline.
