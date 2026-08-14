import { type MultiToken, type TokenLike, createToken } from "./token";

import type { Resolver } from "./inject";

export interface Injector {
  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
}

export const InjectorToken = createToken<Injector>("Injector");

export function createInjector(resolver: Resolver): Injector {
  return {
    resolve<T>(token: TokenLike<T> | MultiToken<T>): T | T[] {
      return resolver.resolve(token as TokenLike<T>);
    },
  };
}
