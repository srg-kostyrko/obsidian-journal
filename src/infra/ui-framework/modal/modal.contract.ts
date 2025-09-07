import type { Option } from "@/infra/data-structures/option";

export interface Modal<TIn, TOut> {
  openModal(input: TIn): Promise<Option<TOut>>;
  close(): void;
}
