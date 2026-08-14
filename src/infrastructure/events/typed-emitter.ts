export interface TypedEmitter<E extends object> {
  on<K extends keyof E & string>(
    event: K,
    callback: E[K] extends (...arguments_: infer A) => void ? (...arguments_: A) => void : never,
  ): () => void;
  emit<K extends keyof E & string>(
    event: K,
    ...arguments_: E[K] extends (...arguments_: infer A) => void ? A : never
  ): void;
}

export interface Subscribable<E extends object> {
  on<K extends keyof E & string>(
    event: K,
    callback: E[K] extends (...arguments_: infer A) => void ? (...arguments_: A) => void : never,
  ): () => void;
}
