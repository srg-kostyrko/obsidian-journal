export type Brand<T, V> = T & { __brand: V };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction<Returning = any> = (...args: any[]) => Returning;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAsyncFunction<Returning = any> = (...args: any[]) => Promise<Returning>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPromise = Promise<any>;

export type InferPromise<T> = T extends Promise<infer U> ? U : never;

export type Contains<T, V, U = T> = (T extends U ? (U extends V ? true : false) : false) extends false ? false : true;
