import type { Ref } from "vue";

export interface SliceHandle<T> {
  readonly state: T;
  readonly status: Readonly<Ref<"ok" | "reset">>;
}

export interface CollectionHandle<T> {
  readonly entries: ReadonlyMap<string, T>;
  add(id: string, init?: Partial<T>): T;
  remove(id: string): void;
  get(id: string): T | undefined;
}
