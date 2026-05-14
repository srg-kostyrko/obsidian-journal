import { AsyncResult, InvariantError } from "@/infrastructure/result";

import { ModalCancelled } from "./errors";

import type { ModalDefinition } from "./types";

export class FakeModalHandle<TProps, TResult> {
  readonly definition: ModalDefinition<TProps, TResult>;
  readonly props: TProps;
  readonly resolvedTitle: string;
  readonly resolvedWidth: number | undefined;
  readonly resolvedCssClass: readonly string[];

  #settled = false;
  readonly #resolve: (value: TResult) => void;
  readonly #reject: (error: ModalCancelled) => void;

  constructor(
    definition: ModalDefinition<TProps, TResult>,
    props: TProps,
    resolve: (value: TResult) => void,
    reject: (error: ModalCancelled) => void,
  ) {
    this.definition = definition;
    this.props = props;
    this.resolvedTitle = definition.title(props);
    this.resolvedWidth = definition.width?.(props);
    this.resolvedCssClass = definition.cssClass;
    this.#resolve = resolve;
    this.#reject = reject;
  }

  submit(value: TResult): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#resolve(value);
  }

  cancel(): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#reject(new ModalCancelled());
  }

  get settled(): boolean {
    return this.#settled;
  }
}

export class FakeModalService {
  readonly #opens: FakeModalHandle<unknown, unknown>[] = [];

  get opens(): readonly FakeModalHandle<unknown, unknown>[] {
    return this.#opens;
  }

  open<TProps, TResult>(
    definition: ModalDefinition<TProps, TResult>,
    props: TProps,
  ): AsyncResult<TResult, ModalCancelled> {
    const { promise, resolve, reject } = Promise.withResolvers<TResult>();
    const handle = new FakeModalHandle<TProps, TResult>(definition, props, resolve, reject);
    this.#opens.push(handle as unknown as FakeModalHandle<unknown, unknown>);
    return AsyncResult.fromPromise(promise, (cause) =>
      cause instanceof ModalCancelled ? cause : new ModalCancelled(),
    );
  }

  lastOpen<TProps = unknown, TResult = unknown>(): FakeModalHandle<TProps, TResult> {
    const last = this.#opens.at(-1);
    if (!last) throw new InvariantError("FakeModalService.lastOpen() called before any open()");
    return last as unknown as FakeModalHandle<TProps, TResult>;
  }

  dismissAll(): void {
    for (const handle of this.#opens) handle.cancel();
  }
}
