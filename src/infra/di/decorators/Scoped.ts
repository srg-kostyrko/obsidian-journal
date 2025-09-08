import type { ClassDecorator } from "../contracts/decorators.types";
import type { Scope } from "../contracts/scope.types";
import type { Constructor } from "../contracts/token.types";
import { getClassMetadata } from "../metadata";

export function Scoped<This, Args extends unknown[] = []>(scope: Scope): ClassDecorator<Constructor<This, Args>> {
  return (Class): undefined => {
    const metadata = getClassMetadata(Class);
    metadata.scope = scope;
  };
}
