import type { AnyFunction } from "@/types/utility.types";

export function checkExhaustive(_value: never): never {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Unexpected value ${_value}`);
}

export function isFunction(value: unknown): value is AnyFunction {
  return typeof value === "function";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isGenerator(object: any): object is Generator {
  return (
    typeof object === "object" &&
    object !== null &&
    typeof object.next === "function" &&
    typeof object.throw === "function" &&
    typeof object.return === "function" &&
    typeof object[Symbol.iterator] === "function" &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    object[Symbol.iterator]() === object
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAsyncGenerator(object: any): object is AsyncGenerator {
  return (
    typeof object === "object" &&
    object !== null &&
    typeof object.next === "function" &&
    typeof object.throw === "function" &&
    typeof object.return === "function" &&
    typeof object[Symbol.asyncIterator] === "function" &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    object[Symbol.asyncIterator]() === object
  );
}
