import type { RegistrationProvider } from "../contracts/container.types";
import type { InstanceRef } from "../contracts/injection-context.types";
import type { Scope } from "../contracts/scope.types";
import type { Token } from "../contracts/token.types";

export abstract class BaseProvider<T, Args extends unknown[] = []> implements RegistrationProvider<T, Args> {
  #scope: Scope | null = null;
  #token: Token<T, Args>;

  public instance: InstanceRef<T> | null = null;

  constructor(token: Token<T, Args>) {
    this.#token = token;
  }

  abstract create(...args: Args): T;

  get scope() {
    return this.#scope;
  }

  scoped(scope: Scope): RegistrationProvider<T, Args> {
    this.#scope = scope;
    return this;
  }

  toString() {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(this.#token);
  }
}
