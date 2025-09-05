import type { Token } from "./contracts/token.types";
import { ensureInjectionContext } from "./injection-context";

export function inject<T>(token: Token<T>): T {
  const context = ensureInjectionContext(inject);
  return context.container.resolve(token);
}

export function injectAll<T>(token: Token<T>): T[] {
  const context = ensureInjectionContext(injectAll);
  return context.container.resolveAll(token);
}

export function injectBy<T>(thisArgument: unknown, token: Token<T>): T {
  const context = ensureInjectionContext(injectBy);
  const resolution = context.resolution;

  const currentFrame = resolution.stack.peek();
  if (!currentFrame) {
    return inject(token);
  }

  const currentRef = { current: thisArgument };
  const cleanup = resolution.dependents.set(currentFrame.provider, currentRef);
  try {
    return inject(token);
  } finally {
    cleanup();
  }
}
