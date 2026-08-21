export { Container } from "./container";
export { Scope } from "./scope";

export { type Module } from "./module";

export {
  createMultiToken,
  createToken,
  isToken,
  tokenKind,
  tokenName,
  type AnyTokenLike,
  type Class,
  type MultiToken,
  type Token,
  type TokenKind,
  type TokenLike,
} from "./token";

export { inject, type Resolver } from "./inject";

export { Lifetime } from "./lifetime";

export { InjectorToken, type Injector } from "./injector";

export { provideInjector, provideInjectorOnApp, useInjector, useService } from "./vue";

export {
  CannotOverrideError,
  CircularDependencyError,
  ContainerDisposedError,
  DuplicateRegistrationError,
  InvalidTokenError,
  MissingInjectorProviderError,
  NoInjectionContextError,
  ScopedResolutionOutsideScopeError,
  TokenNotRegisteredError,
} from "./errors";
