import type { AnyAsyncFunction } from "@/types/utility.types";

export function isAsyncFunction(fn: unknown): fn is AnyAsyncFunction {
  return typeof fn === "function" && fn.constructor.name === "AsyncFunction";
}

export function isPromise<T>(value: unknown): value is Promise<T> {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value !== "object") {
    return false;
  }

  return value instanceof Promise || "then" in value;
}
