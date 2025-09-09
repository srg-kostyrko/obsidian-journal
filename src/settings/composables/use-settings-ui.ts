import { useInjector } from "@/infra/ui-framework/use-injector";
import { SettingsUiState } from "../settings.tokens";

export function useSettingsUi() {
  const injector = useInjector();
  return injector.inject(SettingsUiState);
}
