import { match } from "ts-pattern";

import { type Bindings, Slot, type StoredEntry, disposeSlots } from "./bindings";
import { ContainerDisposedError, TokenNotRegisteredError } from "./errors";
import { currentChain, type Resolver, withResolutionContext } from "./inject";
import { Lifetime } from "./lifetime";
import { type AnyTokenLike, type MultiToken, type TokenLike, tokenKind } from "./token";

export class Scope implements Resolver {
  readonly #bindings: Bindings;
  readonly #scopedSlots = new Map<StoredEntry, Slot>();
  readonly #scopedOrder: Slot[] = [];
  #disposed = false;

  constructor(bindings: Bindings) {
    this.#bindings = bindings;
  }

  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    return match(stored.entry.lifetime)
      .with(Lifetime.Container, () => stored.slot.getOrCreate(this, token, stored.entry.factory))
      .with(Lifetime.Transient, () => withResolutionContext(this, token, stored.entry.factory))
      .with(Lifetime.Scoped, () => this.#scopedSlotFor(stored).getOrCreate(this, token, stored.entry.factory))
      .exhaustive();
  }

  #scopedSlotFor(stored: StoredEntry): Slot {
    let slot = this.#scopedSlots.get(stored);
    if (!slot) {
      slot = new Slot();
      this.#scopedSlots.set(stored, slot);
      this.#scopedOrder.push(slot);
    }
    return slot;
  }

  #ensureNotDisposed(): void {
    if (this.#disposed) throw new ContainerDisposedError();
  }

  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
  resolve(token: AnyTokenLike): unknown {
    this.#ensureNotDisposed();
    const entries = this.#bindings.lookup(token);
    if (!entries || entries.length === 0) {
      throw new TokenNotRegisteredError(token, currentChain());
    }
    return match(tokenKind(token))
      .with("single", () => this.#resolveSingle(token, entries[0]))
      .with("multi", () => entries.map((stored) => this.#resolveSingle(token, stored)))
      .exhaustive();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const slots = this.#scopedOrder.toReversed();
    this.#scopedSlots.clear();
    this.#scopedOrder.length = 0;
    const errors = await disposeSlots(slots);
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more scope disposers failed.");
    }
  }
}
