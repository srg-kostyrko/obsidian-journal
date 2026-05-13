import { ContainerDisposedError, TokenNotRegisteredError } from "./errors";
import { currentChain, type Resolver, withResolutionContext } from "./inject";
import { Lifetime } from "./lifetime";
import { type AnyTokenLike, type MultiToken, type TokenLike, tokenKind } from "./token";

import type { Container, ContainerInternal, StoredEntry } from "./container";

export class Scope implements Resolver {
  readonly #parent: ContainerInternal;
  readonly #scopedInstances = new Map<StoredEntry, unknown>();
  readonly #scopedOrder: StoredEntry[] = [];
  #disposed = false;

  constructor(parent: Container) {
    this.#parent = parent;
  }

  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
  resolve(token: AnyTokenLike): unknown {
    this.#ensureNotDisposed();
    const stored = this.#parent.__getStored(token);
    if (!stored || stored.length === 0) {
      throw new TokenNotRegisteredError(token, currentChain());
    }
    if (tokenKind(token) === "multi") {
      return stored.map((record) => this.#resolveSingle(token, record));
    }
    return this.#resolveSingle(token, stored[0]);
  }

  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    if (stored.entry.lifetime === Lifetime.Scoped) {
      if (this.#scopedInstances.has(stored)) {
        return this.#scopedInstances.get(stored);
      }
      const instance = withResolutionContext(this, token, () => stored.entry.factory());
      this.#scopedInstances.set(stored, instance);
      this.#scopedOrder.push(stored);
      return instance;
    }
    return this.#parent.__resolveContainerLifetime(this, token, stored);
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    for (const stored of this.#scopedOrder.toReversed()) {
      const instance = this.#scopedInstances.get(stored);
      try {
        await disposeInstance(instance);
      } catch (error) {
        errors.push(error);
      }
    }
    this.#scopedInstances.clear();
    this.#scopedOrder.length = 0;
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more scope disposers failed.");
    }
  }

  #ensureNotDisposed(): void {
    if (this.#disposed) throw new ContainerDisposedError();
  }
}

async function disposeInstance(instance: unknown): Promise<void> {
  if (instance == null || (typeof instance !== "object" && typeof instance !== "function")) return;
  const asyncDispose = (instance as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
  if (typeof asyncDispose === "function") {
    await asyncDispose.call(instance);
    return;
  }
  const syncDispose = (instance as { [Symbol.dispose]?: () => void })[Symbol.dispose];
  if (typeof syncDispose === "function") {
    syncDispose.call(instance);
  }
}
