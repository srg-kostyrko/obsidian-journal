import { match } from "ts-pattern";

import { Bindings, type StoredEntry, disposeSlots } from "./bindings";
import {
  CannotOverrideError,
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

export class Container implements Resolver {
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

  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    return match(stored.entry.lifetime)
      .with(Lifetime.Container, () => stored.slot.getOrCreate(this, token, stored.entry.factory))
      .with(Lifetime.Transient, () => withResolutionContext(this, token, stored.entry.factory))
      .with(Lifetime.Scoped, () => {
        throw new ScopedResolutionOutsideScopeError(token);
      })
      .exhaustive();
  }

  #ensureNotDisposed(): void {
    if (this.#disposed) throw new ContainerDisposedError();
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

  override<T>(token: TokenLike<T> | MultiToken<T>): RegistrationBuilder<T>;
  override<T>(token: AnyTokenLike): RegistrationBuilder<T> {
    this.#ensureNotDisposed();
    if (!isToken(token)) throw new InvalidTokenError(token);
    if (tokenKind(token) !== "single") throw new CannotOverrideError(token, "multi");
    const stored = this.#bindings.lookup(token)?.at(0);
    if (!stored) throw new CannotOverrideError(token, "unregistered");
    if (stored.entry.lifetime === Lifetime.Scoped) throw new CannotOverrideError(token, "scoped");
    // Container-lifetime instances are memoized in the slot, so replacing the entry after a
    // resolve would silently keep the old instance. Refusing is safe: overrides run before
    // autoLoad(), which is when eager bindings first resolve.
    if (stored.slot.has) throw new CannotOverrideError(token, "resolved");
    const { lifetime, eager } = stored.entry;
    return new RegistrationBuilder<T>(
      (entry) => {
        stored.entry = entry;
      },
      { lifetime, eager },
    );
  }

  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
  resolve(token: AnyTokenLike): unknown {
    this.#ensureNotDisposed();
    const entries = this.#bindings.lookup(token);
    const kind = tokenKind(token);
    if (!entries || entries.length === 0) {
      if (kind === "multi") return [];
      throw new TokenNotRegisteredError(token, currentChain());
    }
    return match(kind)
      .with("single", () => this.#resolveSingle(token, entries[0]))
      .with("multi", () => entries.map((stored) => this.#resolveSingle(token, stored)))
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
}
