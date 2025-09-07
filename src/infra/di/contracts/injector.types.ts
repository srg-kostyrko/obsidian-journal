import type { Token } from "./token.types";

export interface Injector {
  inject<Value>(token: Token<Value>): Value;
  injectAll<Value>(token: Token<Value>): Value[];
}
