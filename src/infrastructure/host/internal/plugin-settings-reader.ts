import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";

import { InternalObsidianAppToken } from "./tokens";

interface CommunityPluginRegistry {
  getPlugin?: (id: string) => unknown;
}

interface CorePluginRegistry {
  getEnabledPluginById?: (id: string) => unknown;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** Another plugin's live instance, only while that plugin is enabled. */
export class PluginSettingsReader {
  readonly #app = inject(InternalObsidianAppToken);

  // `app.plugins` is undocumented: every hop is checked so a changed registry reads as "not
  // installed" rather than throwing out of a settings page.
  communityPlugin(id: string): Option<object> {
    const registry = (this.#app as { plugins?: CommunityPluginRegistry }).plugins;
    const plugin = typeof registry?.getPlugin === "function" ? registry.getPlugin(id) : undefined;
    return isObject(plugin) ? Option.some(plugin) : Option.none();
  }

  // getEnabledPluginById, not getPluginById: the latter returns a disabled plugin's wrapper, whose
  // options stay empty until it has been enabled once in this session.
  corePlugin(id: string): Option<object> {
    const registry = (this.#app as { internalPlugins?: CorePluginRegistry }).internalPlugins;
    const instance =
      typeof registry?.getEnabledPluginById === "function" ? registry.getEnabledPluginById(id) : undefined;
    return isObject(instance) ? Option.some(instance) : Option.none();
  }
}
