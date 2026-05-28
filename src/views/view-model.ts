import { computed, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";
import type { Option } from "@/infrastructure/result";

import { ViewsRepository } from "./repository";

import type { View, ViewId } from "./config";

export class ViewsViewModel {
  readonly #repository: ViewsRepository;

  readonly views: ComputedRef<View[]>;
  readonly viewCount: ComputedRef<number>;

  constructor(repository: ViewsRepository = inject(ViewsRepository)) {
    this.#repository = repository;
    this.views = computed(() => [...repository.find().list()].toSorted((a, b) => a.name.localeCompare(b.name)));
    this.viewCount = computed(() => repository.count());
  }

  static fromRepository(repository: ViewsRepository): ViewsViewModel {
    return new ViewsViewModel(repository);
  }

  getView(id: ViewId): Option<View> {
    return this.#repository.get(id);
  }
}
