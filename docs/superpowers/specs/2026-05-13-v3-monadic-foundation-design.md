# v3 Monadic Foundation — Option, Result, AsyncResult

**Status:** Approved (design)
**Date:** 2026-05-13
**Scope:** Foundational types for v3 — `Option<T>`, `Result<T, E>`, `AsyncResult<T, E>`, and the `attempt.in` do-notation runner.

## Goal

Give v3 a single, in-tree foundation for representing optional values and expected errors as values, with a do-notation runner that keeps boundary-typed code readable. Replace ad-hoc `try`/`catch` and `null`-checking at v3 seams (domain operations, host-API adapters, parsing) with a uniform vocabulary. Keep thrown errors only for invariant violations (programmer bugs).

## Non-goals

- No effect runtime, no cancellation primitives, no resource-management scope.
- No `Either` / `Validation` / `These` / `NonEmptyList` — Result + Option only.
- No retrofit of `src/infrastructure/di/`, i18n, or `src/_old-code/` v2 sources.
- No automatic Promise rejection catcher or generic safe-call helper. Each adapter declares its `mapErr` explicitly.
- No custom ESLint rule for `kind`-uniqueness. Convention is enforced in review.

## Axioms

1. **Boundary-typed adoption.** Result/Option appear at domain operations, IO, host-API adapters, and parsing. Inside a unit of work, code can be imperative. UI components consume already-mapped view state, not raw `Result`.
2. **In-tree, not a dependency.** The types live in `src/infrastructure/result/`. No external monadic library.
3. **Hybrid error model.** `E` is an `Error` subclass that declares a `readonly kind` discriminator. Per-feature `errors.ts` files keep declaring their own classes.
4. **AsyncResult is a thenable class** wrapping `Promise<Result<T, E>>` with chainable methods and async-iteration support.
5. **Invariants throw.** Programmer-bug cases throw `InvariantError`; they are never modeled as `Result<T, InvariantError>`.

## Module layout

```
src/infrastructure/result/
  option.ts          # Option<T> + methods
  option.test.ts
  result.ts          # Result<T,E> + methods + Symbol.iterator
  result.test.ts
  async-result.ts    # AsyncResult<T,E> thenable class
  async-result.test.ts
  attempt.ts         # attempt.in(self, generator) — sync + async overloads
  attempt.test.ts
  errors.ts          # InvariantError lives here
  testing.ts         # expectOk / expectErr narrowing helpers
  index.ts           # public barrel (excludes testing.ts)
```

Per the project's barrel convention, `index.ts` exports the public surface (Option, Result, AsyncResult, attempt, InvariantError). Test helpers in `testing.ts` are imported directly by test files; they are not re-exported from the public barrel, keeping test code out of the production bundle.

## Public API

### `Option<T>`

Discriminated union:

```ts
export type Option<T> = Some<T> | None<T>;
```

`None<T = unknown>` carries a phantom `T` so `Option<number>` and `Option<string>` are not assignment-compatible. The phantom is declared via `declare readonly _phantomT: T` and has no runtime cost.

Static constructors:

```ts
const Option: {
  some<T>(v: T): Option<T>;
  none<T = never>(): Option<T>;
  fromNullable<T>(v: T | null | undefined): Option<T>;
};
```

Instance methods:

- `map<U>(fn: (v: T) => U): Option<U>`
- `flatMap<U>(fn: (v: T) => Option<U>): Option<U>`
- `filter(pred: (v: T) => boolean): Option<T>`
- `match<U>(handlers: { some: (v: T) => U; none: () => U }): U`
- `getOr(fallback: T): T`
- `okOr<E>(err: E): Result<T, E>`
- `okOrElse<E>(mkErr: () => E): Result<T, E>` — the supported bridge from missing lookup to error
- `isSome(): this is Some<T>`
- `isNone(): this is None<T>`

### `Result<T, E>`

Discriminated union:

```ts
export type Result<T, E> = Ok<T> | Err<E>;
```

Static constructors:

```ts
const Result: {
  ok<T>(v: T): Result<T, never>;
  err<E>(e: E): Result<never, E>;
  fromThrowing<T, E>(fn: () => T, mapErr: (u: unknown) => E): Result<T, E>;
  fromOption<T, E>(o: Option<T>, mkErr: () => E): Result<T, E>;
  fromValibot<T, E>(
    parsed: SafeParseResult<BaseSchema<unknown, T, BaseIssue<unknown>>>,
    mkErr: (issues: readonly BaseIssue<unknown>[]) => E,
  ): Result<T, E>;
};
```

Instance methods:

- `map<U>(fn: (v: T) => U): Result<U, E>`
- `mapErr<F>(fn: (e: E) => F): Result<T, F>`
- `flatMap<U, F>(fn: (v: T) => Result<U, F>): Result<U, E | F>`
- `match<U>(handlers: { ok: (v: T) => U; err: (e: E) => U }): U`
- `isOk(): this is Ok<T>`
- `isErr(): this is Err<E>`
- `[Symbol.iterator]()` — yields the `Err` (short-circuits) or returns the `Ok` value; consumed by `yield*` inside `attempt.in`.

`Ok<T>` exposes a public `readonly value: T`. `Err<E>` exposes a public `readonly error: E`. Both carry a `readonly kind: "ok" | "err"` so ts-pattern can discriminate.

### `AsyncResult<T, E>`

Thenable class wrapping `Promise<Result<T, E>>`:

```ts
export class AsyncResult<T, E> implements PromiseLike<Result<T, E>> {
  static ok<T>(v: T): AsyncResult<T, never>;
  static err<E>(e: E): AsyncResult<never, E>;
  static fromPromise<T, E>(p: Promise<T>, mapErr: (u: unknown) => E): AsyncResult<T, E>;
  static fromResult<T, E>(r: Result<T, E>): AsyncResult<T, E>;

  then<U1, U2>(
    onF?: (r: Result<T, E>) => U1 | PromiseLike<U1>,
    onR?: (reason: unknown) => U2 | PromiseLike<U2>,
  ): PromiseLike<U1 | U2>;

  map<U>(fn: (v: T) => U): AsyncResult<U, E>;
  mapErr<F>(fn: (e: E) => F): AsyncResult<T, F>;
  flatMap<U, F>(fn: (v: T) => AsyncResult<U, F> | Result<U, F>): AsyncResult<U, E | F>;
  match<U>(handlers: { ok: (v: T) => U; err: (e: E) => U }): Promise<U>;

  [Symbol.asyncIterator](): AsyncIterator<Err<E>, T>;
}
```

Async-iteration semantics mirror Result's sync iterator: yields the `Err` (short-circuits) or returns the `Ok` value.

### `attempt` and `attempt.in`

Do-notation runner. Two entry points:

- `attempt(fn)` — context-free.
- `attempt.in(self, fn)` — rebinds `this` to `self` inside the generator.

Both have sync and async overloads, selected at runtime by whether the generator is `function*` or `async function*`:

```ts
function attempt<T, E>(fn: () => Generator<ErrYield<E>, T, unknown>): Result<T, E>;
function attempt<T, E>(fn: () => AsyncGenerator<ErrYield<E>, T, unknown>): AsyncResult<T, E>;

attempt.in = function inSelf<This, T, E>(
  self: This,
  fn: (this: This) => Generator<ErrYield<E>, T, unknown>,
): Result<T, E>;
attempt.in = function inSelf<This, T, E>(
  self: This,
  fn: (this: This) => AsyncGenerator<ErrYield<E>, T, unknown>,
): AsyncResult<T, E>;
```

The `.in` form invokes `fn.call(self)` so `this.#field` references inside `function*` / `async function*` resolve to the caller's instance. Arrow functions are rejected by the signature — the `(this: This) => ...` form requires a `function`-form callee.

Inside the generator, `yield* result` (where `result: Result<U, E>`) yields nothing on `Ok` and short-circuits on `Err`. The yielded value is a covariant `ErrYield<E>` carrier — TypeScript distributes `Y["error"]` over the union of yielded carriers so the runner's return type's `E` channel is the union of error types across all `yield*` sites.

### `ErrYield<E>`

```ts
export interface ErrYield<E> {
  readonly kind: "err";
  readonly error: E;
}
```

The covariant structural carrier yielded by `Result`'s `Symbol.iterator` and `AsyncResult`'s `Symbol.asyncIterator`. `Err<T, E>` is invariant in `E` (because `mapErr` puts `E` in a contravariant position); the carrier strips that invariance so error types union cleanly across `yield*` sites in a do-notation generator. The runtime yield is the `Err` instance itself; only the static type is narrowed.

### `InvariantError`

```ts
export class InvariantError extends Error {
  readonly kind = "invariant" as const;
  constructor(message: string) {
    super(message);
  }
}
```

Thrown for "this can't happen" cases in new v3 code. Not wrapped in Result.

## Error convention

Each feature continues to own an `errors.ts` file. New rule: every Error subclass declares a unique `readonly kind` discriminator literal and assigns it as `as const`.

```ts
// src/features/journals/errors.ts
export class JournalNotFoundError extends Error {
  readonly kind = "journal-not-found" as const;
  constructor(readonly journalId: string) {
    super(`Journal not found: ${journalId}`);
  }
}

export class JournalAlreadyExistsError extends Error {
  readonly kind = "journal-already-exists" as const;
  constructor(readonly journalId: string) {
    super(`Journal already exists: ${journalId}`);
  }
}

export type JournalError = JournalNotFoundError | JournalAlreadyExistsError;
```

Conventions:

- `kind` values are globally unique strings (prefix with feature name where ambiguity is possible). Enforced in review.
- Each feature exports a `<Feature>Error` union type. Call sites annotate against the union; adding a new error widens the union and ts-pattern `.exhaustive()` surfaces missing arms.
- Narrowing is done with ts-pattern on `.kind`. `P.instanceOf` remains available but is not the default.

## Boundary adapters

### Throwing host APIs

Inline at the call site:

```ts
const content = Result.fromThrowing(
  () => app.vault.read(file),
  (u) => new VaultReadError(file.path, u),
);

const content = AsyncResult.fromPromise(app.vault.read(file), (u) => new VaultReadError(file.path, u));
```

Every Obsidian-throw goes through `Result.fromThrowing` / `AsyncResult.fromPromise`. The `mapErr` always produces a feature-specific error with a `kind` — never bare `Error` or the raw `unknown`. No centralized "Obsidian adapter layer"; each feature owns its wrappers.

### valibot parsing

valibot returns its own `SafeParseResult`. `Result.fromValibot` (listed in the Result statics above) is the single bridge:

```ts
const parsed = v.safeParse(JournalConfigSchema, raw);
const journal = Result.fromValibot(parsed, (issues) => new JournalConfigParseError(issues));
```

Call sites translate the issue array into a feature error (`SettingsParseError`, `JournalConfigParseError`, etc.) that carries whatever issue summary the feature needs. The raw issue array does not propagate further into the domain.

`Result.fromValibot` lives in `result.ts` next to the other static constructors; if valibot-specific helpers grow, they move to a sibling `valibot.ts` and re-attach via the static object.

### Option → Result for lookups

```ts
const journal = yield * Option.fromNullable(this.#registry.get(id)).okOrElse(() => new JournalNotFoundError(id));
```

`okOrElse` is the single supported bridge from missing-lookup to error. No additional `Option.toResult` / `Option.unwrapOrError` aliases.

## UI / Vue consumption

Composables run Result/AsyncResult internally and project the outcome to a domain-specific view-state discriminated union. Templates never see `Ok`, `Err`, `.unwrap()`, or `.isOk()`.

```ts
type JournalViewState =
  | { kind: "loading" }
  | { kind: "ready"; journal: Journal }
  | { kind: "missing"; journalId: string }
  | { kind: "broken-config"; reason: string };

export function useJournal(id: string): {
  state: Readonly<Ref<JournalViewState>>;
} { ... }
```

The component renders per `state.kind`. Loading is a `kind`, not a separate ref. User-facing strings (i18n via `m.*()`) are produced inside the composable.

Top-level Obsidian command callbacks are the unwrap boundary:

```ts
this.addCommand({
  id: "create-journal",
  callback: async () => {
    const result = await createJournal(...);
    match(result)
      .with({ kind: "ok" }, () => new Notice(m.journal.created()))
      .with({ kind: "err" }, ({ error }) => {
        console.error(error);
        new Notice(errorMessage(error));
      })
      .exhaustive();
  },
});
```

`errorMessage(error)` is a per-feature function in `errors.ts` mapping `kind` to an i18n string.

No global `useResult()` / `useAsyncResult()` composable. No DI-wired error toaster. Each feature handles its own error-to-message translation, so users see feature-specific messages rather than generic ones.

## Testing

Test helpers — narrow assertion helpers only — live in `src/infrastructure/result/testing.ts`:

```ts
export function expectOk<T, E>(r: Result<T, E>): asserts r is Ok<T>;
export function expectErr<T, E>(r: Result<T, E>): asserts r is Err<E>;
```

Async equivalents are not exported; tests `await` the `AsyncResult` first (it is thenable), then use `expectOk` / `expectErr` on the resolved `Result`.

Usage:

```ts
const result = await createJournal({ ... });
expectOk(result);
expect(result.value.id).toBe("daily");

expectErr(result);
expect(result.error.kind).toBe("journal-already-exists");
expect(result.error.journalId).toBe("daily");
```

No custom matchers. No wrappers around `expect`. No `expectOkWith(r, v)` helpers — these collapse to `expectOk(r); expect(r.value).toEqual(v)` and offer no leverage.

## Adoption strategy

- **Greenfield only.** Every new v3 feature module (`src/features/...`) uses Result/Option at its boundaries from day one.
- **DI is not retrofitted.** Missing bindings and configuration mistakes in `src/infrastructure/di/` are invariant violations; existing throws are correct.
- **`InvariantError`** replaces ad-hoc thrown `Error` in new v3 code only.
- **Mixed-style features are not allowed.** A feature either uses Result at its boundaries or doesn't exist as v3 yet.
- **Wrapping legacy utilities:** if a new feature must call a not-yet-Result'ified utility, it wraps the call with `Result.fromThrowing` at the call site.

## Quality gates

Per-task during foundation work:

- `npm test` — vitest passes
- `npm run check:types` — vue-tsc passes
- `npm run check:lint` — eslint passes

No e2e smoke is required for foundation code (no UI surface). Standard per-push e2e in CI applies once features start consuming the foundation.

## Out of scope (explicit recap)

- Effect runtime, cancellation, structured concurrency, resource scopes.
- `Either`, `Validation`, `These`, `NonEmptyList`, or other algebraic types.
- Retrofit of DI, i18n, `_old-code/`.
- Centralized Obsidian adapter module; `fromJSON` / `fromDate` / numeric parse helpers.
- ESLint rule for `kind`-uniqueness.
- Bundle-size CI gate.
- Global `useResult()` composable or DI-wired error toaster.
