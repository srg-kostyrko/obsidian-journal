import { browser } from "@wdio/globals";

import { NativeMenuItemMissingError, NativeMenuUnavailableError } from "./errors.js";

// Obsidian's Menu has two renderings and only one of them is a DOM node. `nativeMenus`
// defaults to on for macOS, and `showAtPosition` then hands the items to Electron:
// `remote.Menu.buildFromTemplate(...)`, `M.on("menu-will-close", () => this.hide())`,
// `M.popup(...)`. Nothing lands in the document, so every `.menu-item-title` assertion reads
// as "menu did not open" — which is why the macOS lane failed wholesale rather than telling
// anyone what broke.
//
// This module makes that path drivable, and drivable *anywhere*: it flips Obsidian's static
// default so Linux and Windows take the native branch too, and swaps `buildFromTemplate` for
// a capture, so the items arrive as data instead of an OS popup no WebDriver can click.
//
// The capture also preserves what makes the native menu different: Electron closes the menu
// first and delivers the pick afterwards, the reverse of the DOM menu, which runs the item
// callback and *then* hides. `pickNativeItem` replays that order, so a promise that resolves
// on the pick and cancels on the close is exercised the way macOS exercises it.

interface CapturedItem {
  label?: string;
  type?: string;
  enabled?: boolean;
  click?: (item: unknown, win: unknown, event: Record<string, unknown>) => void;
}

interface CapturedMenu {
  template: CapturedItem[];
  closers: (() => void)[];
}

interface Capture {
  menus: CapturedMenu[];
  original: unknown;
  previousStatic: unknown;
}

interface RemoteMenu {
  buildFromTemplate?: unknown;
}

interface CaptureWindow extends Window {
  __journalsNativeMenuCapture?: Capture;
  electron?: { remote?: { Menu?: RemoteMenu } };
}

// Flips every menu opened from here on to the native path and captures it instead of popping
// it. Pair with `restoreMenus` in an `after` hook: the static is global, so a leaked override
// would send Obsidian's own menus down the native path for the rest of the worker.
export async function forceNativeMenus(): Promise<void> {
  const installed = await browser.executeObsidian(({ obsidian }) => {
    const win = window as CaptureWindow;
    const MenuClass = (obsidian as unknown as { Menu: { useNativeMenu?: unknown } }).Menu;
    const remoteMenu = win.electron?.remote?.Menu;
    if (!remoteMenu) return false;

    const capture: Capture = {
      menus: [],
      original: remoteMenu.buildFromTemplate,
      previousStatic: MenuClass.useNativeMenu,
    };
    win.__journalsNativeMenuCapture = capture;

    remoteMenu.buildFromTemplate = (template: CapturedItem[]) => {
      const entry: CapturedMenu = { template, closers: [] };
      capture.menus.push(entry);
      return {
        on: (event: string, callback: () => void) => {
          if (event === "menu-will-close") entry.closers.push(callback);
        },
        popup() {
          // The capture stands in for the OS popup, so there is nothing to show.
        },
      };
    };
    MenuClass.useNativeMenu = true;
    return true;
  });
  if (!installed) throw new NativeMenuUnavailableError();
}

export async function restoreMenus(): Promise<void> {
  await browser.executeObsidian(({ obsidian }) => {
    const win = window as CaptureWindow;
    const capture = win.__journalsNativeMenuCapture;
    if (!capture) return;
    const remoteMenu = win.electron?.remote?.Menu;
    if (remoteMenu) remoteMenu.buildFromTemplate = capture.original;
    (obsidian as unknown as { Menu: { useNativeMenu?: unknown } }).Menu.useNativeMenu = capture.previousStatic;
    delete win.__journalsNativeMenuCapture;
  });
}

// One label list per native menu opened since `forceNativeMenus`. Separators come through as
// empty strings, so a test can still assert an item's position within its menu.
export function nativeMenuLabels(): Promise<string[][]> {
  return browser.execute(() => {
    const capture = (window as CaptureWindow).__journalsNativeMenuCapture;
    return (capture?.menus ?? []).map((menu) => menu.template.map((item) => item.label ?? ""));
  });
}

// Picks an item the way Electron does: close first, then deliver the click a task later.
// Anything deciding "no pick arrived by the time we closed" fails here exactly as on macOS.
export async function pickNativeItem(menuIndex: number, itemIndex: number): Promise<void> {
  const picked = await browser.execute(
    (menuAt: number, itemAt: number) => {
      const capture = (window as CaptureWindow).__journalsNativeMenuCapture;
      const menu = capture?.menus[menuAt];
      const click = menu?.template[itemAt]?.click;
      if (!menu || !click) return false;
      for (const close of menu.closers) close();
      window.setTimeout(() => {
        click(null, null, {});
      }, 0);
      return true;
    },
    menuIndex,
    itemIndex,
  );
  if (!picked) throw new NativeMenuItemMissingError(menuIndex, itemIndex);
}
