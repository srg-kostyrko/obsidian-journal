import { attempt, type AsyncResult } from "@/infrastructure/result";

/** Runs moves that write into the same journal one after another. */
export class MoveLocks {
  readonly #running = new Map<string, Promise<unknown>>();

  // A second move planned before the first wrote would read the same lines and copy them again.
  run<T, E>(journalName: string, fn: () => AsyncResult<T, E>): AsyncResult<T, E> {
    const previous = this.#running.get(journalName) ?? Promise.resolve();
    const run = attempt(async function* () {
      await previous;
      return yield* fn();
    });
    // The tail never rejects: a move that throws hands its rejection to its own caller, not to the
    // next move queued behind it.
    const settled = Promise.resolve(run).then(
      () => true,
      () => false,
    );
    this.#running.set(journalName, settled);
    void settled.then(() => {
      if (this.#running.get(journalName) === settled) this.#running.delete(journalName);
    });
    return run;
  }
}
