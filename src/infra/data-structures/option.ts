import type { AnyAsyncFunction, AnyFunction, AnyPromise, InferPromise } from "@/types/utility.types";
import { isAsyncFunction, isPromise } from "@/utils/async";

import { AsyncResult, Result } from "./result";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOption = Option<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAsyncOption = AsyncOption<any>;
type InferValue<T> = T extends Option<infer V> ? V : never;

// eslint-disable-next-line prefer-const
let none: None;

export abstract class Option<T> {
  static isOption(value: unknown): value is Option<unknown> {
    return value instanceof Option;
  }

  static none<T>(): Option<T> {
    return none as Option<T>;
  }

  static some<T>(value: T): Option<T> {
    return new Some(value);
  }

  static isSome<T>(option: Option<T>): option is Some<T> {
    return option instanceof Some;
  }

  static isSomeAnd<T>(option: Option<T>, fn: (value: T) => boolean): boolean {
    return Option.isSome(option) && fn(option.value);
  }

  static isNone<T>(option: Option<T>): option is None<T> {
    return option instanceof None;
  }

  static isNoneOr<T>(option: Option<T>, fn: (value: T) => boolean): boolean {
    return (Option.isSome(option) && fn(option.value)) || Option.isNone(option);
  }

  static fromNullable<T>(value: T | null | undefined): Option<T> {
    return value == null ? Option.none() : Option.some(value);
  }

  static try<Fn extends AnyAsyncFunction<AnyOption>, R = InferPromise<ReturnType<Fn>>>(
    fn: Fn,
  ): AsyncOption<InferValue<R>>;
  static try<Fn extends AnyFunction<AnyOption>, R = ReturnType<Fn>>(fn: Fn): Option<InferValue<R>>;
  static try<ReturnType extends AnyPromise>(fn: () => ReturnType): AsyncOption<InferPromise<ReturnType>>;
  static try<ReturnType>(fn: () => ReturnType): Option<ReturnType>;
  static try(fn: () => unknown): Option<unknown> | AsyncOption<unknown> {
    try {
      const returnValue = fn();

      if (isPromise(returnValue)) {
        return new AsyncOption((resolve) => {
          returnValue
            .then((value) => resolve(Option.isOption(value) ? value : Option.fromNullable(value)))
            .catch(() => resolve(Option.none()));
        });
      }
      return Option.isOption(returnValue) ? returnValue : Option.fromNullable(returnValue);
    } catch {
      return Option.none();
    }
  }

  static fromPromise<T extends Promise<AnyAsyncOption>>(
    value: T,
  ): T extends Promise<AsyncOption<infer V>> ? AsyncOption<V> : never;
  static fromPromise<T extends Promise<AnyOption>>(
    value: T,
  ): T extends Promise<Option<infer V>> ? AsyncOption<V> : never;
  static fromPromise<T extends AnyPromise>(value: T): T extends Promise<infer V> ? AsyncOption<V> : never;
  static fromPromise(value: unknown): unknown {
    if (isPromise(value)) {
      return new AsyncOption((resolve, reject) => {
        value.then((value) => resolve(Option.isOption(value) ? value : Option.fromNullable(value))).catch(reject);
      });
    }

    return Option.isOption(value) ? value : Option.some(value);
  }

  abstract getOrNull(): T | null;
  abstract getOrDefault(value: T): T;
  abstract getOrElse(fn: () => T): T;

  abstract map<U>(fn: (value: T) => Promise<U>): AsyncOption<U>;
  abstract map<U>(fn: (value: T) => U): Option<U>;
  abstract mapOr<U>(fn: (value: T) => U, defaultValue: U): U;
  abstract mapOrElse<U>(fn: (value: T) => U, defaultValue: () => U): U;
  abstract fold<U, V>(onSome: (value: T) => U, onNone: () => V): U | V;

  abstract andThen<U>(fn: (value: T) => Promise<Option<U>>): AsyncOption<U>;
  abstract andThen<U>(fn: (value: T) => Option<U>): Option<U>;

  abstract or(other: Option<T>): Option<T>;
  abstract orElse(fn: () => Option<T>): Option<T>;
  abstract orElse(fn: () => Promise<Option<T>>): AsyncOption<T>;

  abstract okOr<Err>(err: Err): Result<T, Err>;
  abstract okOrElse<Err>(fn: () => Err): Result<T, Err>;

  abstract tap(fn: (value: T) => void): Option<T>;

  abstract filter<U extends T>(fn: (value: T) => boolean): Option<U>;

  abstract zip<U>(other: Option<U>): Option<[T, U]>;

  abstract zipWith<U, V>(other: Option<U>, fn: (value1: T, value2: U) => V): Option<V>;
  abstract zipWith<U, V>(other: Option<U>, fn: (value1: T, value2: U) => Promise<V>): AsyncOption<V>;

  abstract async(): AsyncOption<T>;
}

class None<T = unknown> extends Option<T> {
  async(): AsyncOption<T> {
    return AsyncOption.none();
  }

  getOrNull(): T | null {
    return null;
  }

  getOrDefault(value: T): T {
    return value;
  }

  getOrElse(fn: () => T): T {
    return fn();
  }

  map<U>(fn: (value: T) => Promise<U>): AsyncOption<U>;
  map<U>(fn: (value: T) => U): Option<U>;
  map<U>(fn: AnyFunction): Option<U> | AsyncOption<U> {
    return isAsyncFunction(fn) ? AsyncOption.none() : (this as unknown as Option<U>);
  }

  mapOr<U>(_fn: (value: T) => U, defaultValue: U): U {
    return defaultValue;
  }

  mapOrElse<U>(fn: (value: T) => U, defaultValue: () => U): U {
    return defaultValue();
  }

  andThen<U>(fn: (value: T) => Option<U>): Option<U>;
  andThen<U>(fn: (value: T) => Promise<Option<U>>): AsyncOption<U>;
  andThen<U>(fn: unknown): Option<U> | AsyncOption<U> {
    return isAsyncFunction(fn) ? AsyncOption.none() : (this as unknown as Option<U>);
  }

  or(other: Option<T>): Option<T> {
    return other;
  }

  orElse(fn: () => Option<T>): Option<T>;
  orElse(fn: () => Promise<Option<T>>): AsyncOption<T>;
  orElse(fn: AnyFunction): Option<T> | AsyncOption<T> {
    const result = fn();
    return isPromise(result) ? (Option.fromPromise(result) as AsyncOption<T>) : (result as Option<T>);
  }

  okOr<Err>(err: Err): Result<T, Err> {
    return Result.err(err);
  }

  okOrElse<Err>(fn: () => Err): Result<T, Err> {
    return Result.err(fn());
  }

  fold<U, V>(_onSome: (value: T) => U, onNone: () => V): U | V {
    return onNone();
  }

  tap(_fn: (value: T) => void): Option<T> {
    return this as Option<T>;
  }

  filter<U extends T>(_fn: (value: T) => boolean): Option<U> {
    return this as unknown as Option<U>;
  }

  zip<U>(_other: Option<U>): Option<[T, U]> {
    return this as Option<[T, U]>;
  }

  zipWith<U, V>(other: Option<U>, fn: (value1: T, value2: U) => V): Option<V>;
  zipWith<U, V>(other: Option<U>, fn: (value1: T, value2: U) => Promise<V>): AsyncOption<V>;
  zipWith<V>(other: unknown, fn: unknown): Option<V> | AsyncOption<V> {
    return isAsyncFunction(fn) ? AsyncOption.none() : (this as unknown as Option<V>);
  }
}

class Some<T> extends Option<T> {
  constructor(public readonly value: T) {
    super();
  }

  async(): AsyncOption<T> {
    return AsyncOption.some(this.value);
  }

  getOrNull(): T | null {
    return this.value;
  }

  getOrDefault(_value: T): T {
    return this.value;
  }

  getOrElse(_fn: () => T): T {
    return this.value;
  }

  map<U>(fn: (value: T) => U): Option<U>;
  map<U>(fn: (value: T) => Promise<U>): AsyncOption<U>;
  map<U>(fn: AnyFunction): Option<U> | AsyncOption<U> {
    const result = fn(this.value);
    return isPromise(result) ? (Option.fromPromise(result) as AsyncOption<U>) : Option.some(result);
  }

  mapOr<U>(fn: (value: T) => U, _defaultValue: U): U {
    return fn(this.value);
  }

  mapOrElse<U>(fn: (value: T) => U, _defaultValue: () => U): U {
    return fn(this.value);
  }

  andThen<U>(fn: (value: T) => Option<U>): Option<U>;
  andThen<U>(fn: (value: T) => Promise<Option<U>>): AsyncOption<U>;
  andThen<U>(fn: AnyFunction): Option<U> | AsyncOption<U> {
    const result = fn(this.value);
    return isPromise(result) ? (Option.fromPromise(result) as AsyncOption<U>) : (result as Option<U>);
  }

  or(_other: Option<T>): Option<T> {
    return this;
  }

  orElse(fn: () => Option<T>): Option<T>;
  orElse(fn: () => Promise<Option<T>>): AsyncOption<T>;
  orElse(fn: AnyFunction): Option<T> | AsyncOption<T> {
    return isAsyncFunction(fn) ? AsyncOption.some(this.value) : this;
  }

  okOr<Err>(_err: Err): Result<T, Err> {
    return Result.ok(this.value);
  }

  okOrElse<Err>(_fn: () => Err): Result<T, Err> {
    return Result.ok(this.value);
  }

  fold<U, V>(onSome: (value: T) => U, _onNone: () => V): U | V {
    return onSome(this.value);
  }

  tap(fn: (value: T) => void): Option<T> {
    fn(this.value);
    return this;
  }

  filter<U extends T>(fn: (value: T) => boolean): Option<U> {
    return fn(this.value) ? (this as unknown as Option<U>) : Option.none();
  }

  zip<U>(other: Option<U>): Option<[T, U]> {
    if (Option.isSome(other)) {
      return Option.some([this.value, other.value]);
    }
    return other as Option<[T, U]>;
  }

  zipWith<U, V>(other: Option<U>, fn: (value1: T, value2: U) => V): Option<V>;
  zipWith<U, V>(other: Option<U>, fn: (value1: T, value2: U) => Promise<V>): AsyncOption<V>;
  zipWith<U, V>(other: Option<U>, fn: (value1: T, value2: U) => V | Promise<V>): Option<V> | AsyncOption<V> {
    if (Option.isSome(other)) {
      const result = fn(this.value, other.value);
      return isPromise(result) ? Option.fromPromise(result) : Option.some(result);
    }
    return other as unknown as Option<V>;
  }
}

export class AsyncOption<T> extends Promise<Option<T>> {
  static some<T>(value: T): AsyncOption<T> {
    return new AsyncOption((resolve) => {
      resolve(Option.some(value));
    });
  }

  static none<T>(): AsyncOption<T> {
    return new AsyncOption((resolve) => {
      resolve(Option.none());
    });
  }

  async getOrNull(): Promise<T | null> {
    const option = await this;
    return option.getOrNull();
  }

  async getOrDefault(value: T): Promise<T> {
    const option = await this;
    return option.getOrDefault(value);
  }

  async getOrElse(fn: () => T): Promise<T> {
    const option = await this;
    return option.getOrElse(fn);
  }

  map<U>(fn: (value: T) => U): AsyncOption<U> {
    return new AsyncOption((resolve, reject) => {
      this.then((option) => {
        resolve(option.map(fn));
      }).catch(reject);
    });
  }
  async mapOr<U>(fn: (value: T) => U, defaultValue: U): Promise<U> {
    const option = await this;
    return option.mapOr(fn, defaultValue);
  }

  async mapOrElse<U>(fn: (value: T) => U, defaultValue: () => U): Promise<U> {
    const option = await this;
    return option.mapOrElse(fn, defaultValue);
  }

  async fold<U, V>(onSome: (value: T) => U, onNone: () => V): Promise<U | V> {
    const option = await this;
    return option.fold(onSome, onNone);
  }

  andThen<U>(fn: (value: T) => Option<U>): AsyncOption<U> {
    return new AsyncOption((resolve, reject) => {
      this.then((option) => {
        resolve(option.andThen(fn));
      }).catch(reject);
    });
  }

  or(other: Option<T>): AsyncOption<T> {
    return new AsyncOption((resolve, reject) => {
      this.then((option) => {
        resolve(option.or(other));
      }).catch(reject);
    });
  }

  orElse(fn: () => Option<T>): AsyncOption<T> {
    return new AsyncOption((resolve, reject) => {
      this.then((option) => {
        resolve(option.orElse(fn));
      }).catch(reject);
    });
  }

  okOr<Err>(err: Err): AsyncResult<T, Err> {
    return new AsyncResult((resolve, reject) => {
      this.then((option) => {
        resolve(option.okOr(err));
      }).catch(reject);
    });
  }

  okOrElse<Err>(fn: () => Err): AsyncResult<T, Err> {
    return new AsyncResult((resolve, reject) => {
      this.then((option) => {
        resolve(option.okOrElse(fn));
      }).catch(reject);
    });
  }

  tap(fn: (value: T) => Promise<void> | void): AsyncOption<T> {
    return new AsyncOption((resolve, reject) => {
      this.then((option) => {
        if (Option.isSome(option)) Promise.resolve(fn(option.value)).catch(reject);
        resolve(option);
      }).catch(reject);
    });
  }

  filter<U extends T>(fn: (value: T) => boolean): AsyncOption<U> {
    return new AsyncOption((resolve, reject) => {
      this.then((option) => {
        resolve(option.filter(fn));
      }).catch(reject);
    });
  }

  zip<U>(other: Option<U>): AsyncOption<[T, U]> {
    return new AsyncOption((resolve, reject) => {
      this.then((option) => {
        resolve(option.zip(other));
      }).catch(reject);
    });
  }

  zipWith<U, V>(other: Option<U>, fn: (value1: T, value2: U) => V): AsyncOption<V> {
    return new AsyncOption((resolve, reject) => {
      this.then((option) => {
        resolve(option.zipWith(other, fn));
      }).catch(reject);
    });
  }
}

none = new None();
