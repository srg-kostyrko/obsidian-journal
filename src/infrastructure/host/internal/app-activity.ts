import { createNanoEvents } from "nanoevents";

import { inject } from "@/infrastructure/di";
import type { TypedEmitter } from "@/infrastructure/events";

import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

interface ActivityEvents {
  resume: () => void;
}

/** Tells a caller the user has come back to the app: a window regained focus or became visible. */
export class AppActivity {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #emitter: TypedEmitter<ActivityEvents> = createNanoEvents();
  readonly #popouts = new Map<Window, () => void>();

  constructor() {
    const main = this.#app.workspace.containerEl.win;
    this.#plugin.registerDomEvent(main, "focus", () => this.#emitter.emit("resume"));
    this.#plugin.registerDomEvent(main.document, "visibilitychange", () => this.#onVisibility(main.document));
    // Popout listeners are added by hand rather than through registerDomEvent, which would hold a
    // closed window's listeners until the plugin unloads.
    this.#plugin.registerEvent(this.#app.workspace.on("window-open", (_, win) => this.#watch(win)));
    this.#plugin.registerEvent(this.#app.workspace.on("window-close", (_, win) => this.#unwatch(win)));
    this.#plugin.register(() => {
      for (const win of this.#popouts.keys()) this.#unwatch(win);
    });
  }

  #onVisibility(document_: Document): void {
    if (document_.visibilityState === "visible") this.#emitter.emit("resume");
  }

  #watch(win: Window): void {
    if (this.#popouts.has(win)) return;
    const onFocus = (): void => this.#emitter.emit("resume");
    const onVisibility = (): void => this.#onVisibility(win.document);
    win.addEventListener("focus", onFocus);
    win.document.addEventListener("visibilitychange", onVisibility);
    this.#popouts.set(win, () => {
      win.removeEventListener("focus", onFocus);
      win.document.removeEventListener("visibilitychange", onVisibility);
    });
  }

  #unwatch(win: Window): void {
    this.#popouts.get(win)?.();
    this.#popouts.delete(win);
  }

  onResume(callback: () => void): () => void {
    return this.#emitter.on("resume", callback);
  }
}
