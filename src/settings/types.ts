export interface SliceHandle<T> {
  readonly state: T;
}

export interface CollectionHandle<T> {
  readonly entries: Readonly<Record<string, T>>;
  add(id: string, init?: Partial<T>): T;
  remove(id: string): void;
  get(id: string): T | undefined;
}
