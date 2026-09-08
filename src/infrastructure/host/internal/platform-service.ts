import { Platform } from "obsidian";

export type DeviceKind = "desktop" | "mobile";

export class PlatformService {
  // `isMobileApp`, not `isMobile`: the question is which device is writing into a synced vault,
  // and `isMobile` is true for a desktop in mobile-emulation mode too.
  current(): DeviceKind {
    return Platform.isMobileApp ? "mobile" : "desktop";
  }
}
