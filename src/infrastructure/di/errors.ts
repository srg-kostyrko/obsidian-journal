import { type AnyTokenLike, tokenName } from "./token";

export class TokenNotRegisteredError extends Error {
  readonly tokenName: string;
  readonly chain: readonly string[];

  constructor(token: AnyTokenLike, chain: readonly string[]) {
    const name = tokenName(token);
    super(`Token "${name}" is not registered. Resolution chain: [${chain.join(" -> ") || "(empty)"}]`);
    this.name = "TokenNotRegisteredError";
    this.tokenName = name;
    this.chain = chain;
  }
}

export class DuplicateRegistrationError extends Error {
  readonly tokenName: string;

  constructor(token: AnyTokenLike) {
    const name = tokenName(token);
    super(
      `Token "${name}" already has a single-binding registration. Use createMultiToken for multi-binding semantics.`,
    );
    this.name = "DuplicateRegistrationError";
    this.tokenName = name;
  }
}

export class CircularDependencyError extends Error {
  readonly chain: readonly string[];

  constructor(chain: readonly string[]) {
    super(`Circular dependency detected: ${chain.join(" -> ")}`);
    this.name = "CircularDependencyError";
    this.chain = chain;
  }
}

export class NoInjectionContextError extends Error {
  readonly callsite: string | undefined;

  constructor(callsite?: string) {
    super(
      callsite
        ? `${callsite} called outside any active resolution context.`
        : "inject() called outside any active resolution context.",
    );
    this.name = "NoInjectionContextError";
    this.callsite = callsite;
  }
}

export class ContainerDisposedError extends Error {
  constructor() {
    super("Operation attempted on a disposed container or scope.");
    this.name = "ContainerDisposedError";
  }
}

export class ScopedResolutionOutsideScopeError extends Error {
  readonly tokenName: string;

  constructor(token: AnyTokenLike) {
    const name = tokenName(token);
    super(`Scoped token "${name}" cannot be resolved from the root container. Create a scope first.`);
    this.name = "ScopedResolutionOutsideScopeError";
    this.tokenName = name;
  }
}

export class InvalidTokenError extends Error {
  readonly received: unknown;

  constructor(received: unknown) {
    super(`Expected a Token, MultiToken, or class constructor; received ${describeValue(received)}.`);
    this.name = "InvalidTokenError";
    this.received = received;
  }
}

export class MissingInjectorProviderError extends Error {
  constructor() {
    super("useService / useInjector requires a provideInjector ancestor in the Vue tree.");
    this.name = "MissingInjectorProviderError";
  }
}

export type CannotOverrideReason = "unregistered" | "multi" | "resolved";

const OVERRIDE_MESSAGES: Record<CannotOverrideReason, (name: string) => string> = {
  unregistered: (name) => `Token "${name}" has no registration to override. Register it first.`,
  multi: (name) => `Token "${name}" is a multi-token; its bindings are additive and cannot be overridden.`,
  resolved: (name) =>
    `Token "${name}" was already resolved, so an override would leave the existing instance in place. Override before the first resolve.`,
};

export class CannotOverrideError extends Error {
  readonly tokenName: string;
  readonly reason: CannotOverrideReason;

  constructor(token: AnyTokenLike, reason: CannotOverrideReason) {
    const name = tokenName(token);
    super(OVERRIDE_MESSAGES[reason](name));
    this.name = "CannotOverrideError";
    this.tokenName = name;
    this.reason = reason;
  }
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "object") return "object";
  return typeof value;
}
