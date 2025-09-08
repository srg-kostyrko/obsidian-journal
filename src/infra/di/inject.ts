import type { Token } from "./contracts/token.types";
import { ensureInjectionContext } from "./injection-context";

export function inject<T, Args extends unknown[] = []>(token: Token<T, Args>, ...args: Args): T {
  const context = ensureInjectionContext(inject);
  return context.container.resolve(token, ...args);
}

export function injectAll<T, Args extends unknown[] = []>(token: Token<T, Args>, ...args: Args): T[] {
  const context = ensureInjectionContext(injectAll);
  return context.container.resolveAll(token, ...args);
}

export function injectBy<T, Args extends unknown[] = []>(
  thisArgument: unknown,
  token: Token<T, Args>,
  ...args: Args
): T {
  const context = ensureInjectionContext(injectBy);
  const resolution = context.resolution;

  const currentFrame = resolution.stack.peek();
  if (!currentFrame) {
    return inject(token, ...args);
  }

  const currentRef = { current: thisArgument };
  const cleanup = resolution.dependents.set(currentFrame.provider, currentRef);
  try {
    return inject(token, ...args);
  } finally {
    cleanup();
  }
}
