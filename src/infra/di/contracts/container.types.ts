import type { TokenRegistry } from "../token-registry";
import type { Module } from "./module.types";
import type { Scope } from "./scope.types";
import type { Constructor, Token } from "./token.types";
import type { InstanceRef } from "./injection-context.types";

export interface ContainerOptions {
  parent?: Container;
  defaultScope?: Scope;
}

export interface Container {
  readonly registry: TokenRegistry;

  resolve<T, Args extends unknown[] = []>(token: Token<T, Args>, ...args: Args): T;
  resolveAll<T, Args extends unknown[] = []>(token: Token<T, Args>, ...args: Args): T[];

  isRegistered(token: Token<unknown>): boolean;
  register<T, Args extends unknown[] = []>(token: Token<T, Args>): ContainerRegistration<T, Args>;
  provide<T, Args extends unknown[] = []>(ctor: Constructor<T, Args>): RegistrationProvider<T, Args>;

  createChild(): Container;

  addModule(module: Module): this;
  addModules(modules: Module[]): this;
}

export interface ContainerRegistration<T, Args extends unknown[] = []> {
  readonly provider: RegistrationProvider<T, Args> | null;

  use(cls: Constructor<T, Args>): RegistrationProvider<T, Args>;
  useFactory(factory: (...args: Args) => T): RegistrationProvider<T, Args>;
  useValue(value: T): RegistrationProvider<T, Args>;
}

export interface RegistrationProvider<T, Args extends unknown[] = []> {
  readonly scope: Scope | null;

  instance: InstanceRef<T> | null;
  create(...args: Args): T;

  scoped(scope: Scope): RegistrationProvider<T, Args>;
}
