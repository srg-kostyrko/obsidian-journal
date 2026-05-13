import { match } from "ts-pattern";

import { Bindings, type StoredEntry, disposeSlots } from "./bindings";
import {
  ContainerDisposedError,
  InvalidTokenError,
  ScopedResolutionOutsideScopeError,
  TokenNotRegisteredError,
} from "./errors";
import { currentChain, currentResolver, type Resolver, withResolutionContext } from "./inject";
import { createInjector, InjectorToken } from "./injector";
import { Lifetime } from "./lifetime";
import { RegistrationBuilder } from "./registration";
import { Scope } from "./scope";
import { type AnyTokenLike, isToken, type MultiToken, type TokenLike, tokenKind } from "./token";

import type { Module } from "./module";

export interface ContainerInternal {
  __getStored(token: AnyTokenLike): readonly StoredEntry[] | undefined;
  __resolveContainerLifetime(resolver: Resolver, token: AnyTokenLike, stored: StoredEntry): unknown;
}

export class Container implements Resolver, ContainerInternal {
  readonly #bindings = new Bindings();
  #disposed = false;

  constructor() {
    this.#registerBuiltins();
  }

  #registerBuiltins(): void {
    this.register(InjectorToken)
      .useFactory(() => {
        const resolver = currentResolver() ?? this;
        return createInjector(resolver);
      })
      .lifetime(Lifetime.Transient);
  }

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
      stored = this.#bindings.commit(token, entry);
    });
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

  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    return this.__resolveContainerLifetime(this, token, stored);
  }

  __getStored(token: AnyTokenLike): readonly StoredEntry[] | undefined {
    return this.#bindings.lookup(token);
  }

  __resolveContainerLifetime(resolver: Resolver, token: AnyTokenLike, stored: StoredEntry): unknown {
    return match(stored.entry.lifetime)
      .with(Lifetime.Container, () => stored.slot.getOrCreate(resolver, token, stored.entry.factory))
      .with(Lifetime.Transient, () => withResolutionContext(resolver, token, stored.entry.factory))
      .with(Lifetime.Scoped, () => {
        throw new ScopedResolutionOutsideScopeError(token);
      })
      .exhaustive();
  }

  createScope(): Scope {
    this.#ensureNotDisposed();
    return new Scope(this.#bindings);
  }

  async autoLoad(): Promise<void> {
    this.#ensureNotDisposed();
    const ordered = this.#bindings
      .all()
      .filter(({ stored }) => stored.entry.eager && !stored.slot.has)
      .toSorted((a, b) => a.stored.registrationIndex - b.stored.registrationIndex);
    for (const { token, stored } of ordered) {
      this.#resolveSingle(token, stored);
    }
  }

  addModule(module: Module): this {
    this.#ensureNotDisposed();
    module.register(this);
    return this;
  }

  addModules(modules: readonly Module[]): this {
    for (const moduleEntry of modules) this.addModule(moduleEntry);
    return this;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const slots = this.#bindings
      .all()
      .filter(({ stored }) => stored.slot.has)
      .toSorted((a, b) => b.stored.registrationIndex - a.stored.registrationIndex)
      .map(({ stored }) => stored.slot);
    const errors = await disposeSlots(slots);
    this.#bindings.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more disposers failed.");
    }
  }

  #ensureNotDisposed(): void {
    if (this.#disposed) throw new ContainerDisposedError();
  }
}
