import type { Token } from "../contracts/token.types";
import { BaseProvider } from "./base-provider";

export class FactoryProvider<T, Args extends unknown[] = []> extends BaseProvider<T, Args> {
  #factory: (...args: Args) => T;

  constructor(token: Token<T, Args>, factory: (...args: Args) => T) {
    super(token);
    this.#factory = factory;
  }

  create(...args: Args): T {
    return this.#factory(...args);
  }
}
