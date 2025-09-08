import { nanoid } from "nanoid";

import { TokenSymbol, type Token } from "./contracts/token.types";

export function createToken<T, Args extends unknown[] = []>(tokenName: string): Token<T, Args> {
  const instanceId = nanoid(10);
  return {
    name: `Token<${tokenName}>`,
    [TokenSymbol]: true,
    instanceId,
    toString() {
      return this.name;
    },
  } as Token<T, Args>;
}
