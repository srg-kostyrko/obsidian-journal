# v3 Logger — Design

**Stage:** Logger infrastructure for the v3 plugin rewrite
**Date:** 2026-05-13
**Status:** Draft for review

## Purpose

Give v3 a small, DI-wired logger so feature code stops reaching for `console.*`
directly (the v2 pattern) and gains a stable boundary for the eventual
"dump logs to an Obsidian note for sharing" feature.

The stage's deliverable is the logger core plus a `ConsoleSink` and a
`LoggerModule`. No level filtering, no buffer sink, no Notice integration —
those land later. The shape established here must make those additions
drop-in (a new sink registered against a multi-token), not refactors.

## Non-goals

- No level filtering (`LogLevelRef`, min-level dispatch). All emits reach all
  sinks; DevTools handles per-method filtering on the user side.
- No `BufferSink` / dump-to-note. The export feature is the explicit future
  consumer of this module but is not part of this stage.
- No per-namespace level rules, no settings UI, no `Notice` integration.
- No async sinks. Sinks are synchronous; teardown via `Symbol.dispose` /
  `Symbol.asyncDispose` if a future sink needs it (DI handles the walk).
- No logger-specific errors. DI's `TokenNotRegisteredError` covers the only
  failure mode (module not registered).
- No `useLogger(name)` Vue helper. `useService(LoggerFactoryToken).named("X")`
  is one line.

## Architecture

### Layout

```
src/infrastructure/logger/
├── index.ts          # public barrel
├── tokens.ts         # LoggerFactoryToken, LogSinkMultiToken
├── types.ts          # LogLevel, LogRecord, LogSink, Fields
├── logger.ts         # Logger (plain class)
├── factory.ts        # LoggerFactory (DI bridge)
├── console-sink.ts   # ConsoleSink
├── module.ts         # LoggerModule
└── testing.ts        # MemorySink — separate test-only barrel
```

Tests are colocated (`logger.test.ts`, `factory.test.ts`,
`console-sink.test.ts`). No `index.test.ts`, no `module.test.ts`,
no test for `MemorySink`.

### Two-class shape

`Logger` is a **plain value class with no DI knowledge**. `LoggerFactory` is
the only DI-aware piece; it uses a field-initializer `inject()` to capture the
sink list once and hands out `Logger` instances on demand. This keeps:

- registration to `useClass` only (no `useFactory(() => new X(inject(...)))`),
- the field-initializer preference satisfied,
- `Logger#child()` working without a DI resolution context (it clones the
  parent's sink-array reference).

## Public API

### Types

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export type Fields = Readonly<Record<string, unknown>>;

export interface LogRecord {
  readonly timestamp: number; // Date.now() — required by future BufferSink
  readonly level: LogLevel;
  readonly name: string; // "" for root, "journals.weekly" for children
  readonly message: string;
  readonly fields?: Fields;
}

export interface LogSink {
  write(record: LogRecord): void;
}
```

`LogLevel` is a string union rather than an enum: no filtering arithmetic
needed, and the strings appear in `LogRecord` and serialize cleanly.

`timestamp` is set on every record from day one. The future "dump logs to
note" sink needs absolute time for ordering and human-readable formatting;
adding it later would mean rewriting `Logger`'s emit path.

Errors travel inside `fields` (e.g., `{ error: err, path }`). DevTools' built-in
`Error` rendering handles stacks — no positional `Error` argument, no
special-casing in the sink.

### Logger

```ts
export class Logger {
  readonly #sinks: readonly LogSink[];

  constructor(
    readonly name: string,
    sinks: readonly LogSink[],
  ) {
    this.#sinks = sinks;
  }

  debug(message: string, fields?: Fields): void {
    this.#emit("debug", message, fields);
  }
  info(message: string, fields?: Fields): void {
    this.#emit("info", message, fields);
  }
  warn(message: string, fields?: Fields): void {
    this.#emit("warn", message, fields);
  }
  error(message: string, fields?: Fields): void {
    this.#emit("error", message, fields);
  }

  child(name: string): Logger {
    const composed = this.name === "" ? name : `${this.name}.${name}`;
    return new Logger(composed, this.#sinks);
  }

  #emit(level: LogLevel, message: string, fields?: Fields): void {
    const record: LogRecord = {
      timestamp: Date.now(),
      level,
      name: this.name,
      message,
      fields,
    };
    for (const sink of this.#sinks) {
      try {
        sink.write(record);
      } catch {
        // Swallow: a logging failure must not break the caller and must not
        // suppress emission to subsequent sinks.
      }
    }
  }
}
```

- No `inject()` anywhere. `Logger` is constructible by any caller (including
  `child()`) outside a DI context.
- The same `#sinks` reference is shared by every child — one DI resolution
  feeds the entire logger tree.

### LoggerFactory

```ts
export class LoggerFactory {
  readonly #sinks = inject(LogSinkMultiToken);

  named(name: string): Logger {
    return new Logger(name, this.#sinks);
  }
}
```

One field, one method. The factory is the only DI-aware piece in the module.

### Tokens

```ts
export const LoggerFactoryToken = createToken<LoggerFactory>("LoggerFactory");
export const LogSinkMultiToken = createMultiToken<LogSink>("LogSink");
```

No `LoggerToken`. Every consumer asks the factory for a named logger; the
unnamed root is an internal concept of `child()` composition, not a public
binding.

### ConsoleSink

```ts
export class ConsoleSink implements LogSink {
  write(record: LogRecord): void {
    const tag = record.name === "" ? "[journals]" : `[journals:${record.name}]`;
    const args = record.fields === undefined ? [tag, record.message] : [tag, record.message, record.fields];

    match(record.level)
      .with("debug", () => {
        console.debug(...args);
      })
      .with("info", () => {
        console.info(...args);
      })
      .with("warn", () => {
        console.warn(...args);
      })
      .with("error", () => {
        console.error(...args);
      })
      .exhaustive();
  }
}
```

- Prefix uses the plugin id (`journals`, from `manifest.json`) so logs are
  grep-able in a noisy DevTools console.
- Fields are passed as a separate console argument — not interpolated — so
  DevTools renders an expandable object and `Error` values keep their stack.
- `ts-pattern` dispatch per the codebase convention.

### Module

```ts
export const LoggerModule: Module = {
  register(c) {
    c.register(LogSinkMultiToken).useClass(ConsoleSink);
    c.register(LoggerFactoryToken).useClass(LoggerFactory);
  },
};
```

`useClass` only — no factories, no inject-in-constructor-arg. The module is
added in `main.ts` alongside any other infrastructure modules:

```ts
// src/main.ts
const c = new Container();
c.register(PluginToken).useValue(this);
c.register(ObsidianAppToken).useValue(this.app);
c.addModule(LoggerModule);
await c.autoLoad();
```

`LoggerFactoryToken` resolves at `Container` lifetime (default); `ConsoleSink`
similarly. The factory captures the sink list once at construction.

## Usage

### In feature classes

```ts
class JournalsService {
  readonly #logger = inject(LoggerFactoryToken).named("journals");

  open(path: string) {
    this.#logger.info("opened", { path });
  }
}
```

### Nested scopes via `.child()`

```ts
class WeeklyJournal {
  readonly #logger: Logger;
  constructor(parent: Logger) {
    this.#logger = parent.child("weekly");
  }
  // emits with name "journals.weekly"
}
```

### In Vue components

```ts
// <script setup lang="ts">
const logger = useService(LoggerFactoryToken).named("CalendarView");
logger.debug("mounted");
```

### Errors

```ts
this.#logger.error("failed to open journal", { error: err, path });
```

`err` is rendered with its stack by DevTools because it's a separate object
in the console call.

## Data flow

```
FeatureService.openWeekly()
  └─ this.#logger.info("opened", { path, journal })
       └─ Logger#emit("info", "opened", { path, journal })
            ├─ build LogRecord {
            │     timestamp: Date.now(),
            │     level: "info",
            │     name: "journals.weekly",
            │     message: "opened",
            │     fields: { path, journal },
            │  }
            └─ for sink of #sinks: try { sink.write(record) } catch { swallow }

ConsoleSink.write(record)
  └─ console.info("[journals:journals.weekly]", "opened", { path, journal })
```

No per-emit DI lookup. No per-emit allocation beyond the record itself.

## Lifetimes & disposal

- `LogSinkMultiToken` bindings → `Container` (default). One `ConsoleSink` per
  plugin load.
- `LoggerFactoryToken` → `Container`.
- `Logger` instances are not registered; they are plain values minted by the
  factory.

`ConsoleSink` has no `Symbol.dispose` (nothing to flush). Future sinks
(buffer-to-note, file dump) may implement `Symbol.dispose` /
`Symbol.asyncDispose`; DI's existing reverse-order disposal walk picks them up
automatically. No per-sink teardown hook is added to `LogSink`.

## Error handling

`Logger#emit` wraps each `sink.write` in a `try/catch` and swallows. Two
reasons:

- A throwing sink (e.g., a future buffer sink hitting an internal limit)
  must not break the feature code that called `logger.info`.
- A throwing sink must not suppress emission to its siblings; later sinks
  still receive the record.

No recursive "failed to log" logging. No reporting channel. If silent loss
becomes a real problem, a dedicated diagnostic path can be added — out of
scope here.

## Testing

Colocated `*.test.ts`. Behavior assertions only; no shape/wiring tests.

### `logger.test.ts`

- `debug` / `info` / `warn` / `error` each produce a record with the matching
  `level`.
- `fields` is passed through verbatim (object identity, not deep-equal of a
  rebuild).
- `name` propagates: root constructed with `""` emits `name === ""`;
  `factory.named("a").child("b")` emits `name === "a.b"`;
  `new Logger("", sinks).child("b")` emits `name === "b"` (no leading dot).
- Every registered sink receives the same record, in registration order.
- A throwing sink does not prevent the next sink from receiving the record,
  and does not throw out to the caller.
- `timestamp` is set on each record (assert from a mocked `Date.now`).

Built with `MemorySink` from `testing.ts` and a one-off `ThrowingSink`
declared inline for the swallow case.

### `factory.test.ts`

- `factory.named("x")` returns a `Logger` whose emit reaches the injected
  sinks with `name === "x"`.

One observable test on the factory's only public method. Not a wiring/shape
assertion.

### `console-sink.test.ts`

- Each `LogLevel` dispatches to the matching `console.*` method (spy on
  `console.debug/info/warn/error`).
- Tag format: `name === ""` → `"[journals]"`; non-empty `name` →
  `"[journals:<name>]"`.
- `fields` present → passed as the third console argument (object identity,
  not stringified). `fields` absent → console call has two args.

### Not tested

- `index.ts` barrel shape.
- `LoggerModule` wiring (DI tests already cover container behavior).
- `MemorySink` itself (it is test infrastructure, used in tests, not the
  subject of any test).
- `Date.now()` / `console.*` / `ts-pattern` framework behavior.

## Future hooks (informative, not in scope)

- **Dump-to-note** lands as a new module that registers another
  `LogSinkMultiToken` binding (`BufferSink`) and a feature command that reads
  the buffer and writes a markdown note. No change to `Logger`, `LoggerFactory`,
  or any call site.
- **Level filtering** would add a `LogLevelRef` injected by `LoggerFactory`
  (or by a wrapper `LoggerCore`) and a min-level check at the top of `#emit`.
  Additive; no API change at call sites.
- **Notice integration** would be its own sink, again drop-in.
