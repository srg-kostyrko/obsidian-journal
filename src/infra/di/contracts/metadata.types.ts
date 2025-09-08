import type { Scope } from "./scope.types";
import type { Token } from "./token.types";

export interface ClassMetadata<T, Args extends unknown[] = []> {
  scope?: Scope;
  token?: Token<T, Args>;
}
