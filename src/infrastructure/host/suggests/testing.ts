import { AsyncResult, InvariantError } from "@/infrastructure/result";

import { SuggestCancelled } from "./errors";

import type { SuggestDefinition } from "./types";

export class FakeSuggestHandle<TInput, TResult> {
  readonly definition: SuggestDefinition<TInput, TResult>;
  readonly input: TInput;

  #settled = false;
  readonly #resolve: (value: TResult) => void;
  readonly #reject: (error: SuggestCancelled) => void;

  constructor(
    definition: SuggestDefinition<TInput, TResult>,
    input: TInput,
    resolve: (value: TResult) => void,
    reject: (error: SuggestCancelled) => void,
  ) {
    this.definition = definition;
    this.input = input;
    this.#resolve = resolve;
    this.#reject = reject;
  }

  choose(value: TResult): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#resolve(value);
  }

  cancel(): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#reject(new SuggestCancelled());
  }

  get settled(): boolean {
    return this.#settled;
  }
}

export class FakeSuggestService {
  readonly #opens: FakeSuggestHandle<unknown, unknown>[] = [];

  get opens(): readonly FakeSuggestHandle<unknown, unknown>[] {
    return this.#opens;
  }

  open<TInput, TResult>(
    definition: SuggestDefinition<TInput, TResult>,
    input: TInput,
  ): AsyncResult<TResult, SuggestCancelled> {
    const { promise, resolve, reject } = Promise.withResolvers<TResult>();
    const handle = new FakeSuggestHandle<TInput, TResult>(definition, input, resolve, reject);
    this.#opens.push(handle as unknown as FakeSuggestHandle<unknown, unknown>);
    return AsyncResult.fromPromise(promise, (cause) =>
      cause instanceof SuggestCancelled ? cause : new SuggestCancelled(),
    );
  }

  lastOpen<TInput = unknown, TResult = unknown>(): FakeSuggestHandle<TInput, TResult> {
    const last = this.#opens.at(-1);
    if (!last) throw new InvariantError("FakeSuggestService.lastOpen() called before any open()");
    return last as unknown as FakeSuggestHandle<TInput, TResult>;
  }
}
