import { InvariantError } from "./errors";
import { Err, type ErrYield, Ok, type Result } from "./result";

export class AsyncResult<T, E> implements PromiseLike<Result<T, E>> {
  static ok(): AsyncResult<void, never>;
  static ok<T>(value: T): AsyncResult<T, never>;
  static ok<T>(value?: T): AsyncResult<T | void, never> {
    return new AsyncResult<T | void, never>(Promise.resolve(new Ok<T | void, never>(value)));
  }

  static err<E>(error: E): AsyncResult<never, E> {
    return new AsyncResult<never, E>(Promise.resolve(new Err<never, E>(error)));
  }

  static fromResult<T, E>(result: Result<T, E>): AsyncResult<T, E> {
    return new AsyncResult<T, E>(Promise.resolve(result));
  }

  /** @internal Used by `attempt.in`'s async runner. Do not call directly. */
  static _fromPromiseOfResult<T, E>(promise: Promise<Result<T, E>>): AsyncResult<T, E> {
    return new AsyncResult<T, E>(promise);
  }

  static fromPromise<T, E>(promise: Promise<T>, mapErr: (cause: unknown) => E): AsyncResult<T, E> {
    return new AsyncResult<T, E>(
      promise.then(
        (value): Result<T, E> => new Ok<T, E>(value),
        (error: unknown): Result<T, E> => new Err<T, E>(mapErr(error)),
      ),
    );
  }

  // Invariant: #promise never rejects. Every constructor either resolves a
  // Result directly (ok, err, fromResult) or maps rejection into Err (fromPromise).
  readonly #promise: Promise<Result<T, E>>;

  private constructor(promise: Promise<Result<T, E>>) {
    this.#promise = promise;
  }

  then<U1 = Result<T, E>, U2 = never>(
    onFulfilled?: ((value: Result<T, E>) => U1 | PromiseLike<U1>) | null,
    onRejected?: ((reason: unknown) => U2 | PromiseLike<U2>) | null,
  ): PromiseLike<U1 | U2> {
    return this.#promise.then(onFulfilled, onRejected);
  }

  map<U>(fn: (value: T) => U): AsyncResult<U, E> {
    return new AsyncResult<U, E>(this.#promise.then((r) => r.map(fn)));
  }

  mapErr<F>(fn: (error: E) => F): AsyncResult<T, F> {
    return new AsyncResult<T, F>(this.#promise.then((r) => r.mapErr(fn)));
  }

  tap(fn: (value: T) => void): AsyncResult<T, E> {
    return new AsyncResult<T, E>(
      this.#promise.then((r) => {
        if (r.kind === "ok") fn(r.value);
        return r;
      }),
    );
  }

  tapErr(fn: (error: E) => void): AsyncResult<T, E> {
    return new AsyncResult<T, E>(
      this.#promise.then((r) => {
        if (r.kind === "err") fn(r.error);
        return r;
      }),
    );
  }

  flatMap<U, F>(fn: (value: T) => AsyncResult<U, F> | Result<U, F>): AsyncResult<U, E | F> {
    return new AsyncResult<U, E | F>(
      this.#promise.then(async (r): Promise<Result<U, E | F>> => {
        if (r.kind === "err") return new Err<U, E | F>(r.error);
        const next = fn(r.value);
        return next instanceof AsyncResult ? await next : next;
      }),
    );
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): Promise<U> {
    return this.#promise.then((r) => r.match(handlers));
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<ErrYield<E>, T, unknown> {
    const r = await this.#promise;
    if (r.kind === "err") {
      yield r;
      throw new InvariantError("Err async iterator consumed past the short-circuit yield");
    }
    return r.value;
  }
}
