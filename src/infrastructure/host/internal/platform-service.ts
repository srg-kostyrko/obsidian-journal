import { Platform } from "obsidian";

export type DeviceKind = "desktop" | "mobile";

export class PlatformService {
  // `isMobileApp`, not `isMobile`: the question is which device is writing into a synced vault,
  // and `isMobile` is true for a desktop in mobile-emulation mode too.
  current(): DeviceKind {
    return Platform.isMobileApp ? "mobile" : "desktop";
  }

  // Obsidian binds Cmd on macOS where it binds Ctrl elsewhere; a shortcut following that
  // convention must not fire on the other key.
  usesCommandKey(): boolean {
    return Platform.isMacOS;
  }
}
