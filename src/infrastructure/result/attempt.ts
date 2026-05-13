import { Err, Ok, type ErrYield, type Result } from "./result";

// Y is inferred as the union of ErrYield<…> carriers from all yield* sites,
// then Y["error"] distributes to extract the combined error channel. Inferring
// E directly inside Generator<ErrYield<E>, …> doesn't union across yields.
type SyncGen<T, Y extends ErrYield<unknown>> = Generator<Y, T, unknown>;

function runSync<T, Y extends ErrYield<unknown>>(iter: SyncGen<T, Y>): Result<T, Y["error"]> {
  const next = iter.next();
  if (next.done) {
    return new Ok<T, Y["error"]>(next.value);
  }
  return new Err<T, Y["error"]>(next.value.error);
}

export const attempt = {
  in<This, T, Y extends ErrYield<unknown>>(self: This, fn: (this: This) => SyncGen<T, Y>): Result<T, Y["error"]> {
    return runSync(fn.call(self));
  },
};
