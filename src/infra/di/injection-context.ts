import type { InjectionContext, Resolution } from "./contracts/injection-context.types";
import { KeyedStack } from "../data-structures/keyed-stack";
import { WeakRefMap } from "../data-structures/weak-ref-map";
import { NoInjectionContextError } from "./errors/NoInjectionContextError";

function createContext<T extends object>() {
  let current: T | null = null;

  function provide(next: T) {
    const previous = current;
    current = next;
    return () => (current = previous);
  }

  function use() {
    return current;
  }

  return [provide, use] as const;
}

export function createResolution(): Resolution {
  return {
    stack: new KeyedStack(),
    instances: new WeakRefMap(),
    dependents: new WeakRefMap(),
  };
}

export const [provideInjectionContext, useInjectionContext] = createContext<InjectionContext>();

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function ensureInjectionContext(fn: Function) {
  const context = useInjectionContext();
  if (!context) throw new NoInjectionContextError(fn.name);
  return context;
}
