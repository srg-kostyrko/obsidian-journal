import { inject } from "vue";

import { ModalContextError } from "./errors";
import { ModalContextKey } from "./internal/modal-context";

import type { ModalApi } from "./types";

export function useModal<TResult = void>(): ModalApi<TResult> {
  const api = inject(ModalContextKey);
  if (!api) throw new ModalContextError();
  return {
    submit: (value) => api.submit(value),
    cancel: () => api.cancel(),
  };
}
