import { inject } from "vue";

import { InvariantError } from "@/infrastructure/result";

import { ModalContextKey } from "./internal/modal-context";

import type { ModalApi } from "./types";

export function useModal<TResult = void>(): ModalApi<TResult> {
  const api = inject(ModalContextKey);
  if (!api) throw new InvariantError("useModal() must be called inside a modal opened via ModalService.");
  return {
    submit: (value) => api.submit(value),
    cancel: () => api.cancel(),
  };
}
