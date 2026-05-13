import { InvariantError } from "./errors";

import type { Err, Ok, Result } from "./result";

export function expectOk<T, E>(result: Result<T, E>): asserts result is Ok<T, E> {
  if (result.kind !== "ok") {
    throw new InvariantError(`Expected Ok, got Err: ${String(result.error)}`);
  }
}

export function expectErr<T, E>(result: Result<T, E>): asserts result is Err<T, E> {
  if (result.kind !== "err") {
    throw new InvariantError(`Expected Err, got Ok: ${String(result.value)}`);
  }
}
