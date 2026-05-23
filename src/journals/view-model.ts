import { computed, shallowRef, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";
import type { Option } from "@/infrastructure/result";

import { JournalsRepository } from "./repository";

import type { JournalConfig } from "./config";

export class JournalsViewModel {
  readonly #repository: JournalsRepository;

  // Incremented on every repository mutation so computed refs re-evaluate.
  readonly #version = shallowRef(0);

  readonly journals: ComputedRef<JournalConfig[]>;
  readonly journalOptions: ComputedRef<{ value: string; label: string }[]>;
  readonly journalCount: ComputedRef<number>;

  constructor(repository: JournalsRepository = inject(JournalsRepository)) {
    this.#repository = repository;

    const bump = () => {
      this.#version.value++;
    };
    repository.onChange(bump);

    this.journals = computed(() => {
      void this.#version.value;
      return [...repository.find().list()];
    });
    this.journalOptions = computed(() => {
      void this.#version.value;
      return [...repository.find().options()];
    });
    this.journalCount = computed(() => {
      void this.#version.value;
      return repository.count();
    });
  }

  static fromRepository(repository: JournalsRepository): JournalsViewModel {
    return new JournalsViewModel(repository);
  }

  getJournal(name: string): Option<JournalConfig> {
    return this.#repository.get(name);
  }

  isJournalNameAvailable(name: string, excludeCurrent?: string): boolean {
    if (excludeCurrent !== undefined && name === excludeCurrent) return true;
    return this.#repository.get(name).isNone();
  }
}
