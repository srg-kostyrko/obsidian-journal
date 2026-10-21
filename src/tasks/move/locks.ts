import { attempt, type AsyncResult } from "@/infrastructure/result";

/** Runs moves that share a key — a journal they write into or read from, or a source note — one after another. */
export class MoveLocks {
  readonly #running = new Map<string, Promise<unknown>>();

  // A second move planned before the first wrote would read the same lines and copy them again.
  // Every key a run names is claimed in the same synchronous step, behind whatever already held
  // it, so a run only ever waits on runs started before it and two runs cannot wait on each other.
  // The order is sorted all the same, so the claims read the same whichever way a caller lists them.
  run<T, E>(keys: readonly string[], fn: () => AsyncResult<T, E>): AsyncResult<T, E> {
    const names = [...new Set(keys)].toSorted();
    const previous = names.map((name) => this.#running.get(name) ?? Promise.resolve());
    const run = attempt(async function* () {
      await Promise.all(previous);
      return yield* fn();
    });
    // The tail never rejects: a move that throws hands its rejection to its own caller, not to the
    // next move queued behind it.
    const settled = Promise.resolve(run).then(
      () => true,
      () => false,
    );
    for (const name of names) this.#running.set(name, settled);
    void settled.then(() => {
      for (const name of names) if (this.#running.get(name) === settled) this.#running.delete(name);
    });
    return run;
  }
}
