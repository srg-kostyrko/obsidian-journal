import { computed, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";
import type { Option } from "@/infrastructure/result";

import { ShelvesRepository } from "./repository";

import type { ShelfConfig } from "./config";

export class ShelvesViewModel {
  static fromRepository(repository: ShelvesRepository): ShelvesViewModel {
    return new ShelvesViewModel(repository);
  }

  readonly #repository: ShelvesRepository;

  readonly shelves: ComputedRef<ShelfConfig[]>;
  readonly shelfOptions: ComputedRef<{ value: string; label: string }[]>;
  readonly shelfCount: ComputedRef<number>;

  constructor(repository: ShelvesRepository = inject(ShelvesRepository)) {
    this.#repository = repository;
    this.shelves = computed(() => [...repository.find().list()]);
    this.shelfOptions = computed(() => [...repository.find().options()]);
    this.shelfCount = computed(() => repository.count());
  }

  getShelf(name: string): Option<ShelfConfig> {
    return this.#repository.get(name);
  }

  isShelfNameAvailable(name: string, excludeCurrent?: string): boolean {
    if (excludeCurrent !== undefined && name === excludeCurrent) return true;
    return this.#repository.get(name).isNone();
  }
}
