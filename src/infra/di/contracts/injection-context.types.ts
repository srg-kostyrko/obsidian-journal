import type { KeyedStack } from "../../data-structures/keyed-stack";
import type { WeakRefMap } from "../../data-structures/weak-ref-map";
import type { Container, RegistrationProvider } from "./container.types";
import type { Scope } from "./scope.types";

export interface InjectionContext {
  container: Container;
  resolution: Resolution;
}

export interface InstanceRef<T = unknown> {
  readonly current: T;
}

export interface Resolution {
  stack: KeyedStack<RegistrationProvider<unknown>, ResolutionFrame>;
  instances: WeakRefMap<RegistrationProvider<unknown>, InstanceRef>;
  dependents: WeakRefMap<RegistrationProvider<unknown>, InstanceRef>;
}

export interface ResolutionFrame {
  scope: Scope;
  provider: RegistrationProvider<unknown>;
}
