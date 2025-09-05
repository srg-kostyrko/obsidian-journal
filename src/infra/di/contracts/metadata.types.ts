import type { Scope } from "./scope.types";
import type { Token } from "./token.types";

export interface ClassMetadata<T> {
  scope?: Scope;
  token?: Token<T>;
}
