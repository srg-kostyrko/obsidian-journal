import { InvariantError } from "./errors";

import type { Option } from "./option";
import type { BaseIssue, BaseSchema, SafeParseResult } from "valibot";

export class Ok<T, E> {
  readonly kind = "ok" as const;
  declare readonly _phantomE: E;

  constructor(readonly value: T) {}

  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok<U, E>(fn(this.value));
  }

  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new Ok<T, F>(this.value);
  }

  flatMap<U, F>(fn: (value: T) => Result<U, F>): Result<U, E | F> {
    return fn(this.value);
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.ok(this.value);
  }

  isOk(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return false;
  }

  [Symbol.iterator](): Iterator<never, T> {
    let consumed = false;
    return {
      next: () => {
        if (consumed) {
          return { done: true, value: undefined as never };
        }
        consumed = true;
        return { done: true, value: this.value };
      },
    };
  }
}

export class Err<T, E> {
  readonly kind = "err" as const;
  declare readonly _phantomT: T;

  constructor(readonly error: E) {}

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return new Err<U, E>(this.error);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Err<T, F>(fn(this.error));
  }

  flatMap<U, F>(_fn: (value: T) => Result<U, F>): Result<U, E | F> {
    return new Err<U, E | F>(this.error);
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.err(this.error);
  }

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return true;
  }

  *[Symbol.iterator](): Generator<Err<T, E>, never, unknown> {
    yield this;
    throw new InvariantError("Err iterator consumed past the short-circuit yield");
  }
}

export type Result<T, E> = Ok<T, E> | Err<T, E>;

export const Result = {
  ok<T>(value: T): Result<T, never> {
    return new Ok<T, never>(value);
  },
  err<E>(error: E): Result<never, E> {
    return new Err<never, E>(error);
  },
  fromThrowing<T, E>(fn: () => T, mapErr: (cause: unknown) => E): Result<T, E> {
    try {
      return new Ok<T, E>(fn());
    } catch (error) {
      return new Err<T, E>(mapErr(error));
    }
  },
  fromOption<T, E>(option: Option<T>, mkErr: () => E): Result<T, E> {
    return option.isSome() ? new Ok<T, E>(option.value) : new Err<T, E>(mkErr());
  },
  fromValibot<T, E>(
    parsed: SafeParseResult<BaseSchema<unknown, T, BaseIssue<unknown>>>,
    mkErr: (issues: readonly BaseIssue<unknown>[]) => E,
  ): Result<T, E> {
    return parsed.success ? new Ok<T, E>(parsed.output) : new Err<T, E>(mkErr(parsed.issues));
  },
};
