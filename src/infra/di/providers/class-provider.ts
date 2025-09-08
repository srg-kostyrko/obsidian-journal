import type { Constructor, Token } from "../contracts/token.types";
import { BaseProvider } from "./base-provider";

export class ClassProvider<T, Args extends unknown[] = []> extends BaseProvider<T, Args> {
  #cls: Constructor<T, Args>;

  constructor(token: Token<T, Args>, cls: Constructor<T, Args>) {
    super(token);
    this.#cls = cls;
  }

  create(...args: Args): T {
    return new this.#cls(...args);
  }
}
