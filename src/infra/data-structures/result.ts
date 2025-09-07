import type { AnyAsyncFunction, AnyFunction, AnyPromise, Contains, InferPromise } from "@/types/utility.types";
import { isAsyncFunction, isPromise } from "@/utils/async";

import { AsyncOption, Option } from "./option";
import { ResultMatcher } from "./result-matcher";
import { isAsyncGenerator, isGenerator } from "@/utils/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = Result<any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAsyncResult = AsyncResult<any, any>;
type InferError<T> = T extends Result<unknown, infer Error> ? Error : never;
type InferValue<T> = T extends Result<infer Value, unknown> ? Value : T;
type SyncOrAsyncGenerator<Y, R, N> = Generator<Y, R, N> | AsyncGenerator<Y, R, N>;

export type InferGeneratorReturn<T> = T extends SyncOrAsyncGenerator<unknown, infer R, unknown> ? InferValue<R> : never;
export type InferGeneratorError<T> = [T] extends [SyncOrAsyncGenerator<never, infer R, unknown>]
  ? InferError<R>
  : T extends SyncOrAsyncGenerator<{ error: infer E }, infer R, unknown>
    ? E | InferError<R>
    : never;

type IsGeneratorAsync<T> =
  T extends SyncOrAsyncGenerator<infer Info, infer R, unknown>
    ? Contains<Info, { async: true }> extends true
      ? true
      : Contains<T, AsyncGenerator<unknown, unknown, unknown>> extends true
        ? true
        : Contains<R, AnyAsyncResult> extends true
          ? true
          : false
    : false;

type IfGeneratorAsync<T, Yes, No> = IsGeneratorAsync<T> extends true ? Yes : No;

export abstract class Result<Ok, Err> {
  static isResult(value: unknown): value is Result<unknown, unknown> {
    return value instanceof Result;
  }

  static ok<Ok>(value: Ok): Result<Ok, never> {
    return new OkResult(value);
  }

  static err<T, Err>(value: Err): Result<T, Err> {
    return new ErrorResult(value);
  }

  static isOk<Ok, Err>(result: Result<Ok, Err>): result is OkResult<Ok, Err> {
    return result instanceof OkResult;
  }
  static isOkAnd<Ok, Err>(result: Result<Ok, Err>, fn: (value: Ok) => boolean): boolean {
    return Result.isOk(result) && fn(result.value);
  }

  static isErr<Ok, Err>(result: Result<Ok, Err>): result is ErrorResult<Ok, Err> {
    return result instanceof ErrorResult;
  }

  static isErrAnd<Ok, Err>(result: Result<Ok, Err>, fn: (value: Err) => boolean): boolean {
    return Result.isErr(result) && fn(result.value);
  }

  static try<Fn extends AnyAsyncFunction<AnyResult>, R = InferPromise<ReturnType<Fn>>>(
    fn: Fn,
  ): AsyncResult<InferValue<R>, InferError<R> | Error>;
  static try<Fn extends AnyFunction<AnyResult>, R = ReturnType<Fn>>(
    fn: Fn,
  ): Result<InferValue<R>, InferError<R> | Error>;
  static try<ReturnType extends AnyPromise>(fn: () => ReturnType): AsyncResult<InferPromise<ReturnType>, Error>;
  static try<ReturnType>(fn: () => ReturnType): Result<ReturnType, Error>;
  static try<ReturnType extends AnyPromise, ErrorType>(
    fn: () => ReturnType,
    transform: (error: unknown) => ErrorType,
  ): AsyncResult<InferPromise<ReturnType>, ErrorType>;
  static try<ReturnType, ErrorType>(
    fn: () => ReturnType,
    transform?: (error: unknown) => ErrorType,
  ): Result<ReturnType, ErrorType>;
  static try(fn: () => unknown, transform?: (error: unknown) => unknown) {
    try {
      const returnValue = fn();

      if (isPromise(returnValue)) {
        return new AsyncResult((resolve) => {
          returnValue
            .then((value) => resolve(Result.isResult(value) ? value : Result.ok(value)))
            .catch((caughtError) => {
              resolve(Result.err(transform?.(caughtError) ?? caughtError));
            });
        });
      }

      return Result.isResult(returnValue) ? returnValue : Result.ok(returnValue);
    } catch (caughtError: unknown) {
      return Result.err(transform?.(caughtError) ?? caughtError);
    }
  }

  static fromPromise<T extends Promise<AnyAsyncResult>>(
    value: T,
  ): T extends Promise<AsyncResult<infer V, infer E>> ? AsyncResult<V, E> : never;
  static fromPromise<T extends Promise<AnyResult>>(
    value: T,
  ): T extends Promise<Result<infer V, infer E>> ? AsyncResult<V, E> : never;
  static fromPromise<T extends AnyPromise>(value: T): T extends Promise<infer V> ? AsyncResult<V, never> : never;
  static fromPromise(value: unknown): unknown {
    if (isPromise(value)) {
      return new AsyncResult((resolve, reject) => {
        value.then((value) => resolve(Result.isResult(value) ? value : Result.ok(value))).catch(reject);
      });
    }

    return Result.isResult(value) ? value : Result.ok(value);
  }

  static flow<T extends Generator | AsyncGenerator, ErrorType = Error>(
    generator: T | (() => T),
    transformError?: (error: unknown) => ErrorType,
  ): IfGeneratorAsync<
    T,
    AsyncResult<InferGeneratorReturn<T>, InferGeneratorError<T> | ErrorType>,
    Result<InferGeneratorReturn<T>, InferGeneratorError<T> | ErrorType>
  > {
    const isGen = isGenerator(generator) || isAsyncGenerator(generator);
    try {
      const it = isGen ? generator : generator();
      const result = handleGenerator(it);

      if (result instanceof AsyncResult) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return result.catch((error) => AsyncResult.err(transformError?.(error) ?? error)) as any;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result as any;
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Result.err(transformError?.(error) ?? error) as any;
    }
  }

  static flowBinding<T extends Generator | AsyncGenerator, This, ErrorType = Error>(
    self: This,
    generator: (this: This) => T,
    transformError?: (error: unknown) => ErrorType,
  ): IfGeneratorAsync<
    T,
    AsyncResult<InferGeneratorReturn<T>, InferGeneratorError<T> | ErrorType>,
    Result<InferGeneratorReturn<T>, InferGeneratorError<T> | ErrorType>
  > {
    const isGen = isGenerator(generator) || isAsyncGenerator(generator);

    try {
      const it = isGen ? generator : generator.apply(self);
      const result = handleGenerator(it);

      if (result instanceof AsyncResult) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return result.catch((error) => AsyncResult.err(transformError?.(error) ?? error)) as any;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result as any;
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Result.err(transformError?.(error) ?? error) as any;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  *[Symbol.iterator](): Generator<{ error: Err; async: false }, Ok, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return yield this as any;
  }

  abstract getOrNull(): Ok | null;
  abstract getOrDefault(value: Ok): Ok;
  abstract getOrElse(fn: () => Ok): Ok;

  abstract ok(): Option<Ok>;
  abstract err(): Option<Err>;

  abstract map<U>(fn: (value: Ok) => U): U extends AnyPromise ? AsyncResult<InferPromise<U>, Err> : Result<U, Err>;
  abstract mapErr(fn: (value: Err) => Ok): Result<Ok, Err>;
  abstract fold<U, V>(onOk: (value: Ok) => U, onErr: (value: Err) => V): U | V;

  abstract mapOr<U>(fn: (value: Ok) => U, defaultValue: U): U;
  abstract mapOrElse<U>(fn: (value: Ok) => U, defaultValue: (err: Err) => U): U;

  abstract andThen<U>(fn: (value: Ok) => Promise<Result<U, Err>>): AsyncResult<U, Err>;
  abstract andThen<U>(fn: (value: Ok) => Result<U, Err>): Result<U, Err>;
  abstract orElse<U>(fn: (value: Err) => Result<Ok, U>): Result<Ok, U>;
  abstract orElse<U>(fn: (value: Err) => Promise<Result<Ok, U>>): AsyncResult<Ok, U>;

  abstract tap(fn: (value: Ok) => void): Result<Ok, Err>;
  abstract tapErr(fn: (value: Err) => void): Result<Ok, Err>;

  abstract match(): ResultMatcher<Err>;

  abstract async(): AsyncResult<Ok, Err>;
}

class OkResult<Ok, Err> extends Result<Ok, Err> {
  constructor(public value: Ok) {
    super();
  }

  async(): AsyncResult<Ok, Err> {
    return new AsyncResult((resolve) => {
      resolve(this);
    });
  }

  getOrNull(): Ok | null {
    return this.value;
  }

  getOrDefault(_value: Ok): Ok {
    return this.value;
  }

  getOrElse(_fn: () => Ok): Ok {
    return this.value;
  }

  ok(): Option<Ok> {
    return Option.some(this.value);
  }

  err(): Option<Err> {
    return Option.none();
  }

  map<U>(fn: (value: Ok) => Promise<U>): AsyncResult<U, Err>;
  map<U>(fn: (value: Ok) => U): Result<U, Err>;
  map<U>(fn: AnyFunction): Result<U, Err> | AsyncResult<U, Err> {
    const mapped = fn(this.value);
    return isPromise(mapped) ? (Result.fromPromise(mapped) as AsyncResult<U, Err>) : Result.ok(mapped);
  }

  mapErr(_fn: (value: Err) => Ok): Result<Ok, Err> {
    return this;
  }

  mapOr<U>(fn: (value: Ok) => U, _defaultValue: U): U {
    return fn(this.value);
  }

  mapOrElse<U>(fn: (value: Ok) => U, _defaultValue: (err: Err) => U): U {
    return fn(this.value);
  }

  fold<U, V>(onOk: (value: Ok) => U, _onErr: (value: Err) => V): U | V {
    return onOk(this.value);
  }

  andThen<U>(fn: (value: Ok) => Result<U, Err>): Result<U, Err>;
  andThen<U>(fn: (value: Ok) => Promise<Result<U, Err>>): AsyncResult<U, Err>;
  andThen<U>(fn: AnyFunction): Result<U, Err> | AsyncResult<U, Err> {
    const transformed = fn(this.value);
    return isPromise(transformed) ? (Result.fromPromise(transformed) as AsyncResult<U, Err>) : transformed;
  }

  orElse<U>(_fn: (value: Err) => Result<Ok, U>): Result<Ok, U>;
  orElse<U>(_fn: (value: Err) => Promise<Result<Ok, U>>): AsyncResult<Ok, U>;
  orElse<U>(_fn: AnyFunction): Result<Ok, U> | AsyncResult<Ok, U> {
    return isAsyncFunction(_fn)
      ? (Result.fromPromise(Promise.resolve(this)) as AsyncResult<Ok, U>)
      : (this as unknown as Result<Ok, U>);
  }

  tap(fn: (value: Ok) => void): Result<Ok, Err> {
    fn(this.value);
    return this;
  }

  tapErr(_fn: (value: Err) => void): Result<Ok, Err> {
    return this;
  }

  match(): never {
    throw new Error("'match()' can only be called on a failed result.");
  }
}

class ErrorResult<Ok, Err> extends Result<Ok, Err> {
  constructor(public value: Err) {
    super();
  }

  async(): AsyncResult<Ok, Err> {
    return new AsyncResult((_, reject) => {
      reject(this.value);
    });
  }

  getOrNull(): Ok | null {
    return null;
  }

  getOrDefault(value: Ok): Ok {
    return value;
  }

  getOrElse(fn: () => Ok): Ok {
    return fn();
  }

  ok(): Option<Ok> {
    return Option.none();
  }
  err(): Option<Err> {
    return Option.some(this.value);
  }
  map<U>(_fn: (value: Ok) => U): Result<U, Err>;
  map<U>(_fn: (value: Ok) => Promise<U>): AsyncResult<U, Err>;
  map<U>(_fn: AnyFunction): Result<U, Err> | AsyncResult<U, Err> {
    return isAsyncFunction(_fn) ? AsyncResult.err(this.value) : (this as unknown as Result<U, Err>);
  }

  mapErr(fn: (value: Err) => Ok): Result<Ok, Err> {
    return Result.ok(fn(this.value));
  }

  mapOr<U>(fn: (value: Ok) => U, defaultValue: U): U {
    return defaultValue;
  }

  mapOrElse<U>(fn: (value: Ok) => U, defaultValue: (err: Err) => U): U {
    return defaultValue(this.value);
  }

  andThen<U>(_fn: (value: Ok) => Result<U, Err>): Result<U, Err>;
  andThen<U>(_fn: (value: Ok) => Promise<Result<U, Err>>): AsyncResult<U, Err>;
  andThen<U>(_fn: AnyFunction): Result<U, Err> | AsyncResult<U, Err> {
    return isAsyncFunction(_fn) ? AsyncResult.err(this.value) : (this as unknown as Result<U, Err>);
  }

  orElse<U>(fn: (value: Err) => Result<Ok, U>): Result<Ok, U>;
  orElse<U>(fn: (value: Err) => Promise<Result<Ok, U>>): AsyncResult<Ok, U>;
  orElse<U>(fn: AnyFunction): Result<Ok, U> | AsyncResult<Ok, U> {
    const transformed = fn(this.value);
    return isPromise(transformed) ? (Result.fromPromise(transformed) as AsyncResult<Ok, U>) : transformed;
  }

  fold<U, V>(_onOk: (value: Ok) => U, onErr: (value: Err) => V): U | V {
    return onErr(this.value);
  }

  tap(_fn: (value: Ok) => void): Result<Ok, Err> {
    return this;
  }

  tapErr(fn: (value: Err) => void): Result<Ok, Err> {
    fn(this.value);
    return this;
  }

  match() {
    return new ResultMatcher(this.value);
  }
}

export class AsyncResult<Ok, Err> extends Promise<Result<Ok, Err>> {
  static ok<Ok>(value: Ok): AsyncResult<Ok, never> {
    return new AsyncResult((resolve) => resolve(Result.ok(value)));
  }

  static err<T, Err>(value: Err): AsyncResult<T, Err> {
    return new AsyncResult((resolve) => resolve(Result.err(value)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  *[Symbol.iterator](): Generator<{ error: Err; async: true }, Ok, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return yield this as any;
  }

  async getOrNull(): Promise<Ok | null> {
    const result = await this;
    return result.getOrNull();
  }

  async getOrDefault(value: Ok): Promise<Ok> {
    const result = await this;
    return result.getOrDefault(value);
  }

  async getOrElse(fn: () => Ok): Promise<Ok> {
    const result = await this;
    return result.getOrElse(fn);
  }

  ok(): AsyncOption<Ok> {
    return new AsyncOption((resolve, reject) => {
      this.then((result) => {
        resolve(result.ok());
      }).catch(reject);
    });
  }

  err(): AsyncOption<Err> {
    return new AsyncOption((resolve, reject) => {
      this.then((result) => {
        resolve(result.err());
      }).catch(reject);
    });
  }

  map<U>(fn: (value: Ok) => U): AsyncResult<U, Err> {
    return new AsyncResult((resolve, reject) => {
      this.then((result) => {
        resolve(result.map((element) => fn(element)));
      }).catch(reject);
    });
  }
  mapErr(fn: (value: Err) => Ok): AsyncResult<Ok, Err> {
    return new AsyncResult((resolve, reject) => {
      this.then((result) => {
        resolve(result.mapErr((element) => fn(element)));
      }).catch(reject);
    });
  }

  async fold<U, V>(onOk: (value: Ok) => U, onErr: (value: Err) => V): Promise<U | V> {
    const result = await this;
    return result.fold(onOk, onErr);
  }

  async mapOr<U>(fn: (value: Ok) => U, defaultValue: U): Promise<U> {
    const result = await this;
    return result.mapOr(fn, defaultValue);
  }

  async mapOrElse<U>(fn: (value: Ok) => U, defaultValue: (err: Err) => U): Promise<U> {
    const result = await this;
    return result.mapOrElse(fn, defaultValue);
  }

  andThen<U>(fn: (value: Ok) => Result<U, Err>): AsyncResult<U, Err> {
    return new AsyncResult((resolve, reject) => {
      this.then((result) => {
        resolve(result.andThen<U>(fn));
      }).catch(reject);
    });
  }

  orElse<U>(fn: (value: Err) => Result<Ok, U>): AsyncResult<Ok, U> {
    return new AsyncResult((resolve, reject) => {
      this.then((result) => {
        resolve(result.orElse((element) => fn(element)));
      }).catch(reject);
    });
  }

  tap(fn: (value: Ok) => void): AsyncResult<Ok, Err> {
    return new AsyncResult((resolve, reject) => {
      this.then((result) => {
        resolve(result.tap((element) => fn(element)));
      }).catch(reject);
    });
  }

  tapErr(fn: (value: Err) => void): AsyncResult<Ok, Err> {
    return new AsyncResult((resolve, reject) => {
      this.then((result) => {
        resolve(result.tapErr((element) => fn(element)));
      }).catch(reject);
    });
  }
}

function handleGenerator(it: Generator | AsyncGenerator) {
  function handleResult(result: AnyResult) {
    if (!result.ok) {
      return iterate(it.return(result));
    }

    return iterate(it.next(result.getOrNull()));
  }

  function handleStep(step: IteratorResult<unknown>): AnyResult | Promise<AnyResult> {
    if (step.done) {
      if (step.value instanceof Result || step.value instanceof AsyncResult) {
        return step.value;
      }

      return Result.ok(step.value);
    }

    if (step.value instanceof Result) {
      return handleResult(step.value);
    }

    if (step.value instanceof AsyncResult) {
      return step.value.then(handleResult);
    }

    return iterate(it.next(step.value)); // unlikely to happen, but just in case
  }

  function iterate(iteratorResult: IteratorResult<unknown> | Promise<IteratorResult<unknown>>) {
    return isPromise(iteratorResult) ? iteratorResult.then(handleStep) : handleStep(iteratorResult);
  }

  const result = iterate(it.next());

  return isPromise(result) ? Result.fromPromise(result) : result;
}
