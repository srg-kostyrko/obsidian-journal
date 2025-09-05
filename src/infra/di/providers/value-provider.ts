import type { Token } from "../contracts/token.types";
import { BaseProvider } from "./base-provider";

export class ValueProvider<T> extends BaseProvider<T> {
  #value: T;

  constructor(token: Token<T>, value: T) {
    super(token);
    this.#value = value;
  }

  create(): T {
    return this.#value;
  }
}
