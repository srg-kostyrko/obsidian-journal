import { inject } from "vue";
import { VueAppInjector } from "./vue.tokens";

export function useInjector() {
  return inject(VueAppInjector);
}
