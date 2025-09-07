export const TokenSymbol = Symbol("Token");

export interface Token<_T> {
  readonly name: string;
  readonly [TokenSymbol]: true;
}

export interface Constructor<Instance> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): Instance;
  readonly name: string;
}
