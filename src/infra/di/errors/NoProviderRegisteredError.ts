import type { ContainerRegistration } from "../contracts/container.types";

export class NoProviderRegisteredError extends Error {
  constructor(registration: ContainerRegistration<unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    super(`No provider is registered for ${String(registration)}`);
  }
}
