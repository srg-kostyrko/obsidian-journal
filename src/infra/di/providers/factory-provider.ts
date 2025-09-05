import type { Token } from "../contracts/token.types";
import { BaseProvider } from "./base-provider";

export class FactoryProvider<T> extends BaseProvider<T> {
  #factory: () => T;

  constructor(token: Token<T>, factory: () => T) {
    super(token);
    this.#factory = factory;
  }

  create(): T {
    return this.#factory();
  }
}
