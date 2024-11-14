import { APP_KEY } from "@/constants";
import type { App } from "obsidian";
import { inject } from "vue";

export function useApp(): App {
  const app = inject(APP_KEY);
  if (!app) throw new Error("App not provided or composable used outside of vue context");
  return app;
}
