import type { Token } from "../contracts/token.types";

export class TokenNotRegisteredError extends Error {
  constructor(token: Token<unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    super(`${String(token)} is not registered`);
  }
}
