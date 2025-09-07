import type { Token } from "./contracts/token.types";
import { build } from "./token-registry";
import type { Injector as InjectorContact } from "./contracts/injector.types";
import { inject, injectAll } from "./inject";
import { ensureInjectionContext, provideInjectionContext, useInjectionContext } from "./injection-context";

export const Injector: Token<InjectorContact> = build(function Injector() {
  const context = ensureInjectionContext(Injector);
  const resolution = context.resolution;

  const dependentFrame = resolution.stack.peek();
  const dependentRef = dependentFrame && resolution.dependents.get(dependentFrame.provider);

  function withCurrentContext<R>(fn: () => R) {
    if (useInjectionContext()) {
      return fn();
    }
    const cleanups = [
      provideInjectionContext(context),
      dependentFrame && resolution.stack.push(dependentFrame.provider, dependentFrame),
      dependentRef && resolution.dependents.set(dependentFrame.provider, dependentRef),
    ];
    try {
      return fn();
    } finally {
      for (const cleanup of cleanups) cleanup?.();
    }
  }

  return {
    inject: <T>(token: Token<T>) => withCurrentContext(() => inject(token)),
    injectAll: <T>(token: Token<T>) => withCurrentContext(() => injectAll(token)),
  };
});
