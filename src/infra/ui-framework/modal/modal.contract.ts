import type { AsyncOption } from "@/infra/data-structures/option";

export interface Modal<TIn, TOut> {
  openModal(input: TIn): AsyncOption<TOut>;
  close(): void;
}
