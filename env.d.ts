/// <reference types="vite/client" />

import type { CalendarDate } from "@/calendar";

declare module "@vue/reactivity" {
  interface RefUnwrapBailTypes {
    calendarDate: CalendarDate;
  }
}

// Augment the obsidian module to expose the __testing registry used in unit tests.
// The implementation lives in src/infrastructure/host/obsidian.testing.ts, aliased onto the bare
// `obsidian` specifier by vitest.config.mts.
import type { AbstractInputSuggest, IconName, Modal, PluginSettingTab, SuggestModal } from "obsidian";

declare module "obsidian" {
  // `Plugin.addRibbonIcon` has no counterpart for mid-lifetime removal, so the
  // ribbon-action registry methods are accessed directly to add and remove icons.
  interface WorkspaceRibbon {
    addRibbonItemButton(id: string, icon: IconName, title: string, callback: (event: MouseEvent) => void): HTMLElement;
    removeRibbonAction(id: string): void;
  }

  interface Menu {
    readonly items: { title: string; icon: string; checked: boolean | null; section: string; warning: boolean }[];
    showAtMouseEventCalls: MouseEvent[];
    pick(index: number): Promise<void>;
  }

  interface Plugin {
    readonly settingTabs: PluginSettingTab[];
    readonly protocolHandlers: Map<string, (parameters: Record<string, string>) => unknown>;
  }

  export const __testing: {
    readonly openModals: readonly Modal[];
    lastOpenModal(): Modal;
    readonly openSuggestModals: readonly SuggestModal<unknown>[];
    lastOpenSuggestModal(): SuggestModal<unknown>;
    readonly attachedInputSuggests: readonly AbstractInputSuggest<unknown>[];
    lastAttachedInputSuggest(): AbstractInputSuggest<unknown>;
    readonly openMenus: readonly Menu[];
    lastOpenMenu(): Menu;
    readonly shownNotices: readonly Notice[];
    lastShownNotice(): Notice;
    reset(): void;
    seedIcons(names: readonly string[]): void;
    resetIcons(): void;
  };
}
