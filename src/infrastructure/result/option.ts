export class Some<T> {
  readonly kind = "some" as const;
  constructor(readonly value: T) {}

  map<U>(fn: (value: T) => U): Option<U> {
    return new Some<U>(fn(this.value));
  }

  flatMap<U>(fn: (value: T) => Option<U>): Option<U> {
    return fn(this.value);
  }

  filter(predicate: (value: T) => boolean): Option<T> {
    return predicate(this.value) ? this : new None<T>();
  }

  match<U>(handlers: { some: (value: T) => U; none: () => U }): U {
    return handlers.some(this.value);
  }

  getOr(_fallback: T): T {
    return this.value;
  }

  isSome(): this is Some<T> {
    return true;
  }

  isNone(): this is None<T> {
    return false;
  }
}

export class None<T = unknown> {
  readonly kind = "none" as const;
  declare readonly _phantomT: T;

  map<U>(_fn: (value: T) => U): Option<U> {
    return new None<U>();
  }

  flatMap<U>(_fn: (value: T) => Option<U>): Option<U> {
    return new None<U>();
  }

  filter(_predicate: (value: T) => boolean): Option<T> {
    return this;
  }

  match<U>(handlers: { some: (value: T) => U; none: () => U }): U {
    return handlers.none();
  }

  getOr(fallback: T): T {
    return fallback;
  }

  isSome(): this is Some<T> {
    return false;
  }

  isNone(): this is None<T> {
    return true;
  }
}

export type Option<T> = Some<T> | None<T>;

export const Option = {
  some<T>(value: T): Option<T> {
    return new Some<T>(value);
  },
  none<T = never>(): Option<T> {
    return new None<T>();
  },
  fromNullable<T>(value: T | null | undefined): Option<T> {
    return value === null || value === undefined ? new None<T>() : new Some<T>(value);
  },
};
