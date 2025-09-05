import type { RegistrationProvider } from "../contracts/container.types";
import type { InstanceRef } from "../contracts/injection-context.types";
import type { Scope } from "../contracts/scope.types";
import type { Token } from "../contracts/token.types";

export abstract class BaseProvider<T> implements RegistrationProvider<T> {
  #scope: Scope | null = null;
  #token: Token<T>;

  public instance: InstanceRef<T> | null = null;

  constructor(token: Token<T>) {
    this.#token = token;
  }

  abstract create(): T;

  get scope() {
    return this.#scope;
  }

  scoped(scope: Scope): RegistrationProvider<T> {
    this.#scope = scope;
    return this;
  }

  toString() {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(this.#token);
  }
}
