import type { Constructor } from "./token.types";

export type ClassDecorator<Class extends Constructor<unknown>> = (
  value: Class,
  context: ClassDecoratorContext<Class>,
) => Class | undefined;

export type ClassFieldDecorator<Value> = <This extends object>(
  value: undefined,
  context: ClassFieldDecoratorContext<This, Value>,
) => ((this: This, initialValue: Value) => Value) | undefined;
