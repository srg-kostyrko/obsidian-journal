import type { AnyPromise, Contains } from "@/types/utility.types";
import { isAsyncFunction, isPromise } from "@/utils/async";
import { isFunction } from "@/utils/types";
import type { Constructor } from "../di/contracts/token.types";

export class NonExhaustiveError<E> extends Error {
  constructor(public readonly error: E) {
    super("Not all error cases were handled");
  }
}

export class RedundantElseClauseError<T> extends Error {
  constructor(public readonly error: T) {
    super();
  }
}

type ExtractHandledCases<T extends readonly unknown[]> = {
  [I in keyof T]: T[I] extends Constructor<infer U> ? U : T[I];
}[number];

type WhenValue<E> = Constructor<Extract<E, object>> | E;

export class ResultMatcher<out E, InferredOutput = never> {
  private cases: { value: unknown; handler: (error: unknown) => unknown }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private defaultHandler: ((error: any) => unknown) | undefined = undefined;

  constructor(private error: E) {}

  when<T extends WhenValue<E>, U extends readonly WhenValue<E>[], R, HandledCases = ExtractHandledCases<[T, ...U]>>(
    value: T,
    ...args: [...rest: U, handler: (error: HandledCases) => R]
  ) {
    const cases = [value, ...args.slice(0, -1)] as unknown[];
    const handler = args.at(-1) as (error: unknown) => R;
    this.cases.push(...cases.map((value) => ({ value, handler })));
    return this as ResultMatcher<Exclude<E, HandledCases>, InferredOutput | R>;
  }

  // eslint-disable-next-line unicorn/consistent-function-scoping
  readonly else = ((handler) => {
    if (this.defaultHandler) {
      throw new Error("already registered an 'else' handler");
    }

    this.defaultHandler = handler;
    return this as unknown;
  }) as [E] extends [never]
    ? RedundantElseClauseError<"All error cases are already handled">
    : <R>(handler: (error: E) => R) => ResultMatcher<never, InferredOutput | R>;

  readonly run = (() => {
    const isAsync = this.cases.some((item) => isAsyncFunction(item.handler));

    for (const item of this.cases) {
      const match = (isFunction(item.value) && this.error instanceof item.value) || item.value === this.error;

      if (match) {
        const value = item.handler(this.error);
        return isPromise(value) || isAsync ? Promise.resolve(value) : value;
      }
    }

    if (this.defaultHandler) {
      return this.defaultHandler(this.error);
    }

    throw new NonExhaustiveError(this.error);
  }) as [E] extends [never]
    ? () => Contains<InferredOutput, AnyPromise> extends true ? Promise<Awaited<InferredOutput>> : InferredOutput
    : NonExhaustiveError<E>;
}
