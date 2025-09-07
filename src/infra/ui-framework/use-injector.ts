import { inject } from "vue";
import { VueAppInjector } from "./vue.tokens";

export function useInjector() {
  const injector = inject(VueAppInjector);
  if (!injector) {
    throw new Error("No injector found");
  }
  return injector;
}
