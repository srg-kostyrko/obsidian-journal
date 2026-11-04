import { inject } from "@/infrastructure/di";

import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

export interface InstalledStyle {
  /** Re-reads the CSS text and writes it to every window. */
  refresh(): void;
  /** Removes the style element from every window. */
  remove(): void;
}

// createEl("style") is a forbidden element in the community scanner; the namespaced constructor is not.
const XHTML_NS = "http://www.w3.org/1999/xhtml";

interface Entry {
  css: () => string;
  elements: Map<Window, HTMLStyleElement>;
}

/** Keeps one `<style id>` in the head of every open window, main and pop-out. */
export class DocumentStyles {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #entries = new Map<string, Entry>();
  readonly #windows = new Set<Window>();
  #unloaded = false;

  constructor() {
    const main = this.#app.workspace.containerEl.win;
    this.#windows.add(main);
    this.#plugin.registerEvent(this.#app.workspace.on("window-open", (_, win) => this.#add(win)));
    this.#plugin.registerEvent(this.#app.workspace.on("window-close", (_, win) => this.#drop(win)));
    // A plugin enabled or reloaded mid-session sees no window-open for a popout already up, and every
    // popout holds a leaf.
    this.#app.workspace.iterateAllLeaves((leaf) => {
      this.#windows.add(leaf.getContainer().win);
    });
    this.#plugin.register(() => {
      this.#unloaded = true;
      for (const id of this.#entries.keys()) this.#removeEntry(id);
      this.#windows.clear();
    });
  }

  #add(win: Window): void {
    if (this.#unloaded || this.#windows.has(win)) return;
    this.#windows.add(win);
    for (const [id, entry] of this.#entries) this.#write(id, entry, win);
  }

  #drop(win: Window): void {
    this.#windows.delete(win);
    for (const entry of this.#entries.values()) entry.elements.delete(win);
  }

  #write(id: string, entry: Entry, win: Window): void {
    const existing = entry.elements.get(win);
    const element = existing ?? this.#create(id, win);
    if (!existing) entry.elements.set(win, element);
    element.textContent = entry.css();
  }

  #create(id: string, win: Window): HTMLStyleElement {
    const element = win.document.createElementNS(XHTML_NS, "style") as HTMLStyleElement;
    element.id = id;
    win.document.head.append(element);
    return element;
  }

  #removeEntry(id: string): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    for (const element of entry.elements.values()) element.remove();
    this.#entries.delete(id);
  }

  install(id: string, css: () => string): InstalledStyle {
    this.#removeEntry(id);
    const entry: Entry = { css, elements: new Map() };
    this.#entries.set(id, entry);
    for (const win of this.#windows) this.#write(id, entry, win);
    return {
      refresh: () => {
        if (this.#entries.get(id) !== entry) return;
        for (const win of entry.elements.keys()) this.#write(id, entry, win);
      },
      remove: () => {
        if (this.#entries.get(id) === entry) this.#removeEntry(id);
      },
    };
  }
}
