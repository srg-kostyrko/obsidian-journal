export const TokenSymbol = Symbol("Token");

export interface Token<_T, _Args extends unknown[] = []> {
  readonly name: string;
  readonly [TokenSymbol]: true;
}

export interface Constructor<Instance, Args extends unknown[] = []> {
  new (...args: Args): Instance;
  readonly name: string;
}
