import type { RegistrationProvider } from "./contracts/container.types";
import { Scope } from "./contracts/scope.types";
import type { Token } from "./contracts/token.types";
import { ContainerRegistration } from "./providers/container-registration";
import { createToken } from "./token";

const internals = new WeakMap<Token<unknown>, ContainerRegistration<unknown>>();
const builders = new WeakSet<RegistrationProvider<unknown>>();

export class TokenRegistry {
  #map = new Map<Token<unknown>, ContainerRegistration<unknown>[]>();
  #parent: TokenRegistry | null;

  constructor(parent: TokenRegistry | null = null) {
    this.#parent = parent;
  }

  get<T>(token: Token<T>): ContainerRegistration<T> | null {
    return this.getAll(token)?.at(-1) ?? null;
  }

  getAll<T>(token: Token<T>): ContainerRegistration<T>[] | null {
    const internal = internals.get(token);
    return internal
      ? [internal as ContainerRegistration<T>]
      : ((this.#map.get(token) as ContainerRegistration<T>[]) ?? this.#parent?.getAll(token) ?? null);
  }

  set<T>(token: Token<T>, provider: ContainerRegistration<T>): void {
    const registrations = this.#map.get(token) ?? [];
    registrations.push(provider);
    this.#map.set(token, registrations);
  }
}

export function isBuilder(registration: RegistrationProvider<unknown>): boolean {
  return builders.has(registration);
}

export function build<Value>(factory: () => Value, name?: string): Token<Value> {
  const token = createToken<Value>(name ?? `Build<${factory.name || "<unnamed>"}>`);
  const registration = new ContainerRegistration(token);
  registration.useFactory(factory).scoped(Scope.Transient);

  internals.set(token, registration);
  if (registration.provider) builders.add(registration.provider);
  return token;
}
