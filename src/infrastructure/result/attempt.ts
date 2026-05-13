import { AsyncResult } from "./async-result";
import { Err, Ok, type ErrYield, type Result } from "./result";

// `Y["error"]` distributes over the union of yielded ErrYield carriers,
// so the error channel widens across yield* sites in the generator.
type SyncGen<T, Y extends ErrYield<unknown>> = Generator<Y, T, unknown>;
type AsyncGen<T, Y extends ErrYield<unknown>> = AsyncGenerator<Y, T, unknown>;

function runSync<T, Y extends ErrYield<unknown>>(iter: SyncGen<T, Y>): Result<T, Y["error"]> {
  const next = iter.next();
  if (next.done) {
    return new Ok<T, Y["error"]>(next.value);
  }
  return new Err<T, Y["error"]>(next.value.error);
}

async function runAsync<T, Y extends ErrYield<unknown>>(iter: AsyncGen<T, Y>): Promise<Result<T, Y["error"]>> {
  const next = await iter.next();
  if (next.done) {
    return new Ok<T, Y["error"]>(next.value);
  }
  return new Err<T, Y["error"]>(next.value.error);
}

function isAsyncIterator(value: object): value is AsyncGen<unknown, ErrYield<unknown>> {
  return Symbol.asyncIterator in value;
}

function attemptIn<This, T, Y extends ErrYield<unknown>>(
  self: This,
  fn: (this: This) => SyncGen<T, Y>,
): Result<T, Y["error"]>;
function attemptIn<This, T, Y extends ErrYield<unknown>>(
  self: This,
  fn: (this: This) => AsyncGen<T, Y>,
): AsyncResult<T, Y["error"]>;
function attemptIn<This, T, Y extends ErrYield<unknown>>(
  self: This,
  fn: (this: This) => SyncGen<T, Y> | AsyncGen<T, Y>,
): Result<T, Y["error"]> | AsyncResult<T, Y["error"]> {
  const iter = fn.call(self);
  if (isAsyncIterator(iter)) {
    return AsyncResult.fromPromiseOfResult(runAsync(iter));
  }
  return runSync(iter);
}

export const attempt = {
  in: attemptIn,
};
