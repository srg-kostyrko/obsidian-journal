import type { ClassDecorator } from "../contracts/decorators.types";
import type { Constructor, Token } from "../contracts/token.types";
import { getClassMetadata } from "../metadata";

export function Injectable<This, Value extends This>(token: Token<This>): ClassDecorator<Constructor<Value>> {
  return (Class): undefined => {
    const metadata = getClassMetadata(Class);
    metadata.token = token;
  };
}
