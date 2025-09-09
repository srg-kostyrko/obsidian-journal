import { useInjector } from "@/infra/ui-framework/use-injector";
import { Settings } from "../settings.tokens";

export function useSettings() {
  const injector = useInjector();
  return injector.inject(Settings);
}
