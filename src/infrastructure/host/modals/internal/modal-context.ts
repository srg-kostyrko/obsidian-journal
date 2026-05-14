import type { ModalApi } from "../types";
import type { InjectionKey } from "vue";

export const ModalContextKey: InjectionKey<ModalApi<unknown>> = Symbol("host.modals.context");
