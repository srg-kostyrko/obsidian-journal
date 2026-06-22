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
  return Object.hasOwn(value, TOKEN_BRAND) || Object.hasOwn(value, MULTI_TOKEN_BRAND);
}

export type TokenKind = "single" | "multi";

export function tokenKind(token: AnyTokenLike): TokenKind {
  if (typeof token === "function") return "single";
  if (Object.hasOwn(token, MULTI_TOKEN_BRAND)) return "multi";
  return "single";
}

export function tokenName(token: AnyTokenLike): string {
  if (typeof token === "function") return token.name || "anonymous-class";
  return token.name;
}

function isClassConstructor(value: unknown): boolean {
  return Function.prototype.toString.call(value).startsWith("class");
}
