import { CircularDependencyError, NoInjectionContextError } from "./errors";
import { type AnyTokenLike, type MultiToken, type Token, type TokenLike, tokenName } from "./token";

export interface Resolver {
  resolve<T>(token: TokenLike<T>): T;
  resolve<T>(token: MultiToken<T>): T[];
}

const resolverStack: Resolver[] = [];
const chain: AnyTokenLike[] = [];

export function inject<T>(token: TokenLike<T>): T;
export function inject<T>(token: MultiToken<T>): T[];
export function inject(token: AnyTokenLike): unknown {
  const resolver = resolverStack.at(-1);
  if (!resolver) {
    throw new NoInjectionContextError(`inject(${tokenName(token)})`);
  }
  return resolver.resolve(token as Token<unknown>);
}

export function withResolutionContext<T>(resolver: Resolver, token: AnyTokenLike, callback: () => T): T {
  if (chain.includes(token)) {
    throw new CircularDependencyError([...chain, token].map((t) => tokenName(t)));
  }
  resolverStack.push(resolver);
  chain.push(token);
  try {
    return callback();
  } finally {
    chain.pop();
    resolverStack.pop();
  }
}

export function currentChain(): readonly string[] {
  return chain.map((t) => tokenName(t));
}

export function currentResolver(): Resolver | undefined {
  return resolverStack.at(-1);
}
