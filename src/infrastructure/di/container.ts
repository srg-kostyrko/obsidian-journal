import { match } from "ts-pattern";

import {
  ContainerDisposedError,
  DuplicateRegistrationError,
  InvalidTokenError,
  TokenNotRegisteredError,
} from "./errors";
import { type Resolver, withResolutionContext } from "./inject";
import { Lifetime } from "./lifetime";
import { type RegistrationEntry, RegistrationBuilder } from "./registration";
import { type AnyTokenLike, isToken, type MultiToken, type TokenLike, tokenKind } from "./token";

export interface StoredEntry {
  entry: RegistrationEntry<unknown>;
  instance: unknown;
  hasInstance: boolean;
  readonly registrationIndex: number;
}

export class Container implements Resolver {
  readonly #registry = new Map<AnyTokenLike, StoredEntry[]>();
  #disposed = false;
  #registrationCounter = 0;

  register<T>(token: TokenLike<T> | MultiToken<T>): RegistrationBuilder<T>;
  register<T>(token: AnyTokenLike): RegistrationBuilder<T> {
    this.#ensureNotDisposed();
    if (!isToken(token)) throw new InvalidTokenError(token);
    let stored: StoredEntry | undefined;
    return new RegistrationBuilder<T>((entry) => {
      if (stored) {
        stored.entry = entry;
        return;
      }
      stored = this.#commitNew(token, entry);
    });
  }

  #commitNew(token: AnyTokenLike, entry: RegistrationEntry<unknown>): StoredEntry {
    const stored: StoredEntry = {
      entry,
      instance: undefined,
      hasInstance: false,
      registrationIndex: this.#registrationCounter++,
    };
    const list = this.#registry.get(token) ?? [];
    match(tokenKind(token))
      .with("single", () => {
        if (list.length > 0) throw new DuplicateRegistrationError(token);
        this.#registry.set(token, [stored]);
      })
      .with("multi", () => {
        list.push(stored);
        this.#registry.set(token, list);
      })
      .exhaustive();
    return stored;
  }

  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
  resolve(token: AnyTokenLike): unknown {
    this.#ensureNotDisposed();
    const stored = this.#registry.get(token);
    if (!stored || stored.length === 0) {
      throw new TokenNotRegisteredError(token, []);
    }
    return match(tokenKind(token))
      .with("single", () => this.#resolveSingle(token, stored[0]))
      .with("multi", () => stored.map((s) => this.#resolveSingle(token, s)))
      .exhaustive();
  }

  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    if (stored.entry.lifetime === Lifetime.Container && stored.hasInstance) {
      return stored.instance;
    }
    const instance = withResolutionContext(this, token, () => stored.entry.factory());
    if (stored.entry.lifetime === Lifetime.Container) {
      stored.instance = instance;
      stored.hasInstance = true;
    }
    return instance;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#registry.clear();
  }

  #ensureNotDisposed(): void {
    if (this.#disposed) throw new ContainerDisposedError();
  }
}
