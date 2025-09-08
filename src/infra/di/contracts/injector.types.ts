import type { Token } from "./token.types";

export interface Injector {
  inject<Value, Args extends unknown[] = []>(token: Token<Value>, ...args: Args): Value;
  injectAll<Value, Args extends unknown[] = []>(token: Token<Value>, ...args: Args): Value[];
}
