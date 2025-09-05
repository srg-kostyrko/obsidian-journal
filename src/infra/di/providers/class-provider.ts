import type { Constructor, Token } from "../contracts/token.types";
import { BaseProvider } from "./base-provider";

export class ClassProvider<T> extends BaseProvider<T> {
  #cls: Constructor<T>;

  constructor(token: Token<T>, cls: Constructor<T>) {
    super(token);
    this.#cls = cls;
  }

  create(): T {
    return new this.#cls();
  }
}
