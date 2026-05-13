import { match } from "ts-pattern";

import {
  ContainerDisposedError,
  DuplicateRegistrationError,
  InvalidTokenError,
  ScopedResolutionOutsideScopeError,
  TokenNotRegisteredError,
} from "./errors";
import { currentChain, currentResolver, type Resolver, withResolutionContext } from "./inject";
import { createInjector, InjectorToken } from "./injector";
import { Lifetime } from "./lifetime";
import { type RegistrationEntry, RegistrationBuilder } from "./registration";
import { Scope } from "./scope";
import { type AnyTokenLike, isToken, type MultiToken, type TokenLike, tokenKind } from "./token";

import type { Module } from "./module";

export interface StoredEntry {
  entry: RegistrationEntry<unknown>;
  instance: unknown;
  hasInstance: boolean;
  readonly registrationIndex: number;
}

export interface ContainerInternal {
  __getStored(token: AnyTokenLike): StoredEntry[] | undefined;
  __resolveContainerLifetime(resolver: Resolver, token: AnyTokenLike, stored: StoredEntry): unknown;
}

export class Container implements Resolver, ContainerInternal {
  readonly #registry = new Map<AnyTokenLike, StoredEntry[]>();
  #disposed = false;
  #registrationCounter = 0;

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
      throw new TokenNotRegisteredError(token, currentChain());
    }
    return match(tokenKind(token))
      .with("single", () => this.#resolveSingle(token, stored[0]))
      .with("multi", () => stored.map((s) => this.#resolveSingle(token, s)))
      .exhaustive();
  }

  #resolveSingle(token: AnyTokenLike, stored: StoredEntry): unknown {
    if (stored.entry.lifetime === Lifetime.Scoped) {
      throw new ScopedResolutionOutsideScopeError(token);
    }
    return this.__resolveContainerLifetime(this, token, stored);
  }

  __getStored(token: AnyTokenLike): StoredEntry[] | undefined {
    return this.#registry.get(token);
  }

  __resolveContainerLifetime(resolver: Resolver, token: AnyTokenLike, stored: StoredEntry): unknown {
    if (stored.entry.lifetime === Lifetime.Container && stored.hasInstance) {
      return stored.instance;
    }
    const instance = withResolutionContext(resolver, token, () => stored.entry.factory());
    if (stored.entry.lifetime === Lifetime.Container) {
      stored.instance = instance;
      stored.hasInstance = true;
    }
    return instance;
  }

  createScope(): Scope {
    this.#ensureNotDisposed();
    return new Scope(this);
  }

  async autoLoad(): Promise<void> {
    this.#ensureNotDisposed();
    const ordered = [...this.#registry.entries()]
      .flatMap(([token, list]) => list.map((stored) => ({ token, stored })))
      .filter(({ stored }) => stored.entry.eager && !stored.hasInstance)
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
    const stored = [...this.#registry.values()].flat();
    const resolved = stored
      .filter((s) => s.hasInstance && s.instance != null)
      .toSorted((a, b) => b.registrationIndex - a.registrationIndex);
    const errors: unknown[] = [];
    for (const s of resolved) {
      try {
        await disposeInstance(s.instance);
      } catch (error) {
        errors.push(error);
      }
    }
    this.#registry.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more disposers failed.");
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
