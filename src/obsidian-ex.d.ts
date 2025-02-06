import "obsidian";
import { SettingsRouteState } from "./contracts/settings";

declare module "obsidian" {
  interface Workspace {
    /** Sent to rendered dataview components to tell them to possibly refresh */
    on(name: "journal:settings-navigate", callback: (state: SettingsRouteState) => void, context?: unknown): EventRef;
    on(name: "journal:settings-save", callback: (redraw: boolean) => void, context?: unknown): EventRef;
    on(name: "journal:index-update", callback: () => void, context?: unknown): EventRef;
  }

  export interface App {
    plugins: CommunityPluginManager;
  }
  export interface CommunityPluginManager {
    getPlugin(id: string): Plugin | null;
  }

  export interface LeftRibbon {
    addRibbonItemButton(id: string, icon: string, name: string, callback: () => void): HTMLElement;
    removeRibbonAction(id: string): void;
  }
}
