import { nanoid } from "nanoid";

import { TokenSymbol, type Token } from "./contracts/token.types";

export function createToken<T>(tokenName: string): Token<T> {
  const instanceId = nanoid(10);
  return {
    name: `Token<${tokenName}>`,
    [TokenSymbol]: true,
    instanceId,
    toString() {
      return this.name;
    },
  } as Token<T>;
}
