import { Err, Ok, type ErrYield, type Result } from "./result";

// Y is inferred as the union of ErrYield<…> carriers from all yield* sites,
// then ErrorOf<Y> distributes to extract the combined error channel. Inferring
// E directly inside Generator<ErrYield<E>, …> doesn't union across yields.
type SyncGen<T, Y extends ErrYield<unknown>> = Generator<Y, T, unknown>;

type ErrorOf<Y> = Y extends ErrYield<infer E> ? E : never;

function runSync<T, Y extends ErrYield<unknown>>(iter: SyncGen<T, Y>): Result<T, ErrorOf<Y>> {
  const next = iter.next();
  if (next.done) {
    return new Ok<T, ErrorOf<Y>>(next.value);
  }
  return new Err<T, ErrorOf<Y>>(next.value.error as ErrorOf<Y>);
}

export const attempt = {
  in<This, T, Y extends ErrYield<unknown>>(self: This, fn: (this: This) => SyncGen<T, Y>): Result<T, ErrorOf<Y>> {
    return runSync(fn.call(self));
  },
};
