import { computed, ref, type ComputedRef } from "vue";

import { inject } from "@/infrastructure/di";

import { NotImplementedError } from "../errors";
import { DashboardBlockToken } from "../tokens";

import type { AnySubpage, DashboardBlock, Subpage } from "./schema";

export interface SubpageFrame {
  readonly subpage: AnySubpage;
  readonly props: unknown;
}

export class SettingsUiService {
  readonly #blocks: readonly DashboardBlock[];
  readonly #stack = ref<readonly SubpageFrame[]>([]);
  readonly #current: ComputedRef<SubpageFrame | null>;

  constructor() {
    const blocks = [...inject(DashboardBlockToken)];
    blocks.sort((a, b) => a.order - b.order);
    this.#blocks = blocks;

    this.#current = computed(() => this.#stack.value.at(-1) ?? null);
  }

  get blocks(): readonly DashboardBlock[] {
    return this.#blocks;
  }

  get current(): ComputedRef<SubpageFrame | null> {
    return this.#current;
  }

  push<TProps>(_subpage: Subpage<TProps>, _props: TProps): void {
    throw new NotImplementedError();
  }

  pop(): void {
    throw new NotImplementedError();
  }

  reset(): void {
    throw new NotImplementedError();
  }
}
