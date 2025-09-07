import { checkExhaustive } from "@/utils/types";
import type {
  Container as ContainerContract,
  ContainerOptions,
  ContainerRegistration as ContainerRegistrationContract,
  RegistrationProvider,
} from "./contracts/container.types";
import type { Module } from "./contracts/module.types";
import { Scope } from "./contracts/scope.types";
import type { Constructor, Token } from "./contracts/token.types";
import { CircularDependencyError } from "./errors/CircularDependencyError";
import { NoProviderRegisteredError } from "./errors/NoProviderRegisteredError";
import { TokenNotRegisteredError } from "./errors/TokenNotRegisteredError";
import { createResolution, provideInjectionContext, useInjectionContext } from "./injection-context";
import { getClassMetadata } from "./metadata";
import { ContainerRegistration } from "./providers/container-registration";
import { isBuilder, TokenRegistry } from "./token-registry";
import { NotInjectableClassError } from "./errors/NotInjectableClassError";

export class Container implements ContainerContract {
  #parent: ContainerContract | null = null;
  #defaultScope: Scope = Scope.Container;

  #registry: TokenRegistry;

  constructor(options?: ContainerOptions) {
    if (options?.defaultScope) {
      this.#defaultScope = options.defaultScope;
    }
    if (options?.parent) {
      this.#parent = options.parent;
    }
    this.#registry = new TokenRegistry(this.#parent?.registry);
  }

  get registry(): TokenRegistry {
    return this.#registry;
  }

  resolve<T>(token: Token<T>): T {
    const registration = this.#registry.get(token);
    if (!registration) throw new TokenNotRegisteredError(token);
    return this.#create(registration);
  }

  resolveAll<T>(token: Token<T>): T[] {
    const registrations = this.#registry.getAll(token);
    if (!registrations) throw new TokenNotRegisteredError(token);
    return registrations.map((registration) => this.#create(registration));
  }

  isRegistered(token: Token<unknown>): boolean {
    return this.#registry.get(token) !== null;
  }

  register<T>(token: Token<T>): ContainerRegistrationContract<T> {
    const registration = new ContainerRegistration(token);
    this.#registry.set(token, registration);
    return registration;
  }

  provide<T>(ctor: Constructor<T>): RegistrationProvider<T> {
    const metadata = getClassMetadata(ctor);
    if (!metadata?.token) {
      throw new NotInjectableClassError(ctor.name);
    }
    const registration = this.register(metadata.token).use(ctor);
    if (metadata.scope) {
      registration.scoped(metadata.scope);
    }
    return registration;
  }

  createChild(): ContainerContract {
    return new Container({ parent: this, defaultScope: this.#defaultScope });
  }

  addModule(module: Module): void {
    for (const providedCtor of module.provides ?? []) {
      this.provide(providedCtor);
    }
    module.load?.(this);
  }

  #create<T>(registration: ContainerRegistrationContract<T>): T {
    const provider = registration.provider;
    if (!provider) throw new NoProviderRegisteredError(registration);

    return this.#resolveScopedInstance(provider);
  }

  #resolveScopedInstance<T>(provider: RegistrationProvider<T>): T {
    let context = useInjectionContext();

    if (!context || context.container !== this) {
      context = {
        container: this,
        resolution: createResolution(),
      };
    }

    const resolution = context.resolution;
    if (resolution.stack.has(provider)) {
      const dependentRef = resolution.dependents.get(provider);
      if (dependentRef) return dependentRef.current as T;
      throw new CircularDependencyError(resolution.stack, provider);
    }

    const scope = provider.scope ?? this.#defaultScope;

    const cleanups = [
      provideInjectionContext(context),
      !isBuilder(provider) && resolution.stack.push(provider, { provider, scope }),
    ].filter(Boolean) as (() => void)[];

    try {
      switch (scope) {
        case Scope.Transient: {
          return provider.create();
        }
        case Scope.Resolution: {
          const instanceRef = resolution.instances.get(provider);
          if (instanceRef) return instanceRef.current as T;
          const instance = provider.create();
          resolution.instances.set(provider, { current: instance });
          return instance;
        }
        case Scope.Container: {
          const instanceRef = provider.instance;
          if (instanceRef) return instanceRef.current;
          const instance = provider.create();
          provider.instance = { current: instance };
          return instance;
        }
        default: {
          return checkExhaustive(scope);
        }
      }
    } finally {
      for (const cleanup of cleanups) cleanup?.();
    }
  }
}
