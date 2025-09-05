import type { ClassFieldDecorator } from "../contracts/decorators.types";
import type { Token } from "../contracts/token.types";
import { injectAll, injectBy } from "../inject";

export function Inject<T>(token: Token<T>): ClassFieldDecorator<T> {
  return () =>
    // eslint-disable-next-line unicorn/consistent-function-scoping
    function (this) {
      return injectBy(this, token);
    };
}

export function InjectAll<T>(token: Token<T>): ClassFieldDecorator<T[]> {
  return () =>
    // eslint-disable-next-line unicorn/consistent-function-scoping
    function () {
      return injectAll(token);
    };
}
