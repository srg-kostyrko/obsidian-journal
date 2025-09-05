import type { RegistrationProvider } from "../contracts/container.types";
import type { ResolutionFrame } from "../contracts/injection-context.types";
import type { KeyedStack } from "../../data-structures/keyed-stack";

export class CircularDependencyError extends Error {
  constructor(
    stack: KeyedStack<RegistrationProvider<unknown>, ResolutionFrame>,
    provider: RegistrationProvider<unknown>,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    super(`Circular dependency detected: ${stack.toString()} -> ${String(provider)}`);
  }
}
