import "obsidian";
import { SettingsRouteState } from "./contracts/settings";

declare module "obsidian" {
  interface Workspace {
    /** Sent to rendered dataview components to tell them to possibly refresh */
    on(name: "journal:settings-navigate", callback: (state: SettingsRouteState) => void, ctx?: unknown): EventRef;
    on(name: "journal:settings-save", callback: (redraw: boolean) => void, ctx?: unknown): EventRef;
    on(name: "journal:index-update", callback: () => void, ctx?: unknown): EventRef;
  }

  export interface App {
    plugins: CommunityPluginManager;
  }
  export interface CommunityPluginManager {
    getPlugin(id: string): Plugin | null;
  }
}
