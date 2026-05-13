import { inject as vueInject, provide } from "vue";

import { MissingInjectorProviderError } from "./errors";

import type { Injector } from "./injector";
import type { MultiToken, TokenLike } from "./token";

const InjectorKey = Symbol("di.vue.injector");

export function provideInjector(injector: Injector): void {
  provide(InjectorKey, injector);
}

export function useInjector(): Injector {
  const injector = vueInject<Injector>(InjectorKey);
  if (!injector) throw new MissingInjectorProviderError();
  return injector;
}

export function useService<T>(token: TokenLike<T>): T;
export function useService<T>(token: MultiToken<T>): T[];
export function useService<T>(token: TokenLike<T> | MultiToken<T>): T | T[] {
  return useInjector().resolve(token as TokenLike<T>);
}
