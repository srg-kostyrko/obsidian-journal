import type { ContainerRegistration } from "./contracts/container.types";
import type { Token } from "./contracts/token.types";

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
    return (this.#map.get(token) as ContainerRegistration<T>[]) ?? this.#parent?.getAll(token) ?? null;
  }

  set<T>(token: Token<T>, provider: ContainerRegistration<T>): void {
    const registrations = this.#map.get(token) ?? [];
    registrations.push(provider);
    this.#map.set(token, registrations);
  }
}
