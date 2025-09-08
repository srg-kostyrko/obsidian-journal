import type { Token } from "../contracts/token.types";
import { BaseProvider } from "./base-provider";

export class ValueProvider<T, Args extends unknown[] = []> extends BaseProvider<T, Args> {
  #value: T;

  constructor(token: Token<T, Args>, value: T) {
    super(token);
    this.#value = value;
  }

  create(): T {
    return this.#value;
  }
}
