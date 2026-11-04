import { inject } from "@/infrastructure/di";

import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

export interface InstalledVariables {
  /** Re-reads the variables and writes them to every window. */
  refresh(): void;
  /** Removes them from every window. */
  remove(): void;
}

interface Entry {
  variables: () => Record<string, string>;
  applied: Map<Window, Set<string>>;
}

/** Keeps one set of CSS custom properties on the body of every open window, main and pop-out. */
export class WindowCssVariables {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #entries = new Set<Entry>();
  readonly #windows = new Set<Window>();

  constructor() {
    this.#windows.add(this.#app.workspace.containerEl.win);
    this.#plugin.registerEvent(this.#app.workspace.on("window-open", (_, win) => this.#add(win)));
    this.#plugin.registerEvent(this.#app.workspace.on("window-close", (_, win) => this.#drop(win)));
    // A plugin enabled or reloaded mid-session sees no window-open for a popout already up, and every
    // popout holds a leaf.
    this.#app.workspace.iterateAllLeaves((leaf) => {
      this.#windows.add(leaf.getContainer().win);
    });
    // Clearing the windows is what makes install and refresh no-ops afterwards: a settings watcher
    // may still fire during teardown.
    this.#plugin.register(() => {
      for (const entry of this.#entries) this.#clear(entry);
      this.#entries.clear();
      this.#windows.clear();
    });
  }

  #add(win: Window): void {
    if (this.#windows.has(win)) return;
    this.#windows.add(win);
    for (const entry of this.#entries) this.#write(entry, win);
  }

  #drop(win: Window): void {
    this.#windows.delete(win);
    for (const entry of this.#entries) entry.applied.delete(win);
  }

  #write(entry: Entry, win: Window): void {
    const next = entry.variables();
    const root = win.document.body;
    const names = new Set(Object.keys(next));
    const previous = entry.applied.get(win) ?? new Set<string>();
    for (const name of previous) {
      if (!names.has(name)) root.style.removeProperty(name);
    }
    root.setCssProps(next);
    entry.applied.set(win, names);
  }

  #clear(entry: Entry): void {
    for (const [win, names] of entry.applied) {
      for (const name of names) win.document.body.style.removeProperty(name);
    }
    entry.applied.clear();
  }

  install(variables: () => Record<string, string>): InstalledVariables {
    const entry: Entry = { variables, applied: new Map() };
    this.#entries.add(entry);
    for (const win of this.#windows) this.#write(entry, win);
    return {
      refresh: () => {
        if (!this.#entries.has(entry)) return;
        for (const win of this.#windows) this.#write(entry, win);
      },
      remove: () => {
        this.#clear(entry);
        this.#entries.delete(entry);
      },
    };
  }
}
