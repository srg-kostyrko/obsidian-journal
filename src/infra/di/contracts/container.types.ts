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

  resolve<T>(token: Token<T>): T;
  resolveAll<T>(token: Token<T>): T[];

  isRegistered(token: Token<unknown>): boolean;
  register<T>(token: Token<T>): ContainerRegistration<T>;
  provide<T>(ctor: Constructor<T>): RegistrationProvider<T>;

  createChild(): Container;

  addModule(module: Module): void;
}

export interface ContainerRegistration<T> {
  readonly provider: RegistrationProvider<T> | null;

  use(cls: Constructor<T>): RegistrationProvider<T>;
  useFactory<Args extends unknown[]>(factory: (...args: Args) => T): RegistrationProvider<T>;
  useValue(value: T): RegistrationProvider<T>;
}

export interface RegistrationProvider<T> {
  readonly scope: Scope | null;

  instance: InstanceRef<T> | null;
  create(): T;

  scoped(scope: Scope): RegistrationProvider<T>;
}
