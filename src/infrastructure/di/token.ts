const TOKEN_BRAND = Symbol("di.token");
const MULTI_TOKEN_BRAND = Symbol("di.multiToken");

export interface Token<T> {
  readonly [TOKEN_BRAND]: true;
  readonly name: string;
  readonly __type?: T;
}

export interface MultiToken<T> {
  readonly [MULTI_TOKEN_BRAND]: true;
  readonly name: string;
  readonly __type?: T;
}

export type Class<T> = new (...arguments_: never[]) => T;

export type TokenLike<T> = Token<T> | Class<T>;

export type AnyTokenLike = Token<unknown> | MultiToken<unknown> | Class<unknown>;

export function createToken<T>(name: string): Token<T> {
  return { [TOKEN_BRAND]: true, name };
}

export function createMultiToken<T>(name: string): MultiToken<T> {
  return { [MULTI_TOKEN_BRAND]: true, name };
}

export function isToken(value: unknown): value is AnyTokenLike {
  if (typeof value === "function") {
    return isClassConstructor(value);
  }
  if (typeof value !== "object" || value === null) return false;
  return TOKEN_BRAND in value || MULTI_TOKEN_BRAND in value;
}

export type TokenKind = "single" | "multi";

export function tokenKind(token: AnyTokenLike): TokenKind {
  if (typeof token === "function") return "single";
  if (MULTI_TOKEN_BRAND in token) return "multi";
  return "single";
}

export function tokenName(token: AnyTokenLike): string {
  if (typeof token === "function") return token.name || "anonymous-class";
  return token.name;
}

function isClassConstructor(function_: (...arguments_: unknown[]) => unknown): boolean {
  const source = Function.prototype.toString.call(function_);
  return source.startsWith("class");
}
