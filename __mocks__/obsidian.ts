import moment from "moment";

export { moment };

export class TAbstractFile {
  path = "";
  name = "";
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
  stat = { ctime: 0, mtime: 0, size: 0 };
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];

  isRoot(): boolean {
    return this.parent === null;
  }
}

export function normalizePath(path: string): string {
  return path
    .replaceAll(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/|\/$/g, "");
}

export type App = unknown;

const openModals: Modal[] = [];

export const __testing = {
  get openModals(): readonly Modal[] {
    return openModals;
  },
  lastOpenModal(): Modal {
    const last = openModals.at(-1);
    if (!last) throw new Error("__testing.lastOpenModal() called before any modal opened");
    return last;
  },
  reset(): void {
    for (const m of [...openModals]) m.close();
    openModals.length = 0;
  },
};

export class Modal {
  readonly app: App;
  readonly titleEl: HTMLElement;
  readonly modalEl: HTMLElement;
  readonly contentEl: HTMLElement;
  #opened = false;

  constructor(app: App) {
    this.app = app;
    this.modalEl = document.createElement("div");
    this.titleEl = document.createElement("div");
    this.contentEl = document.createElement("div");
    this.modalEl.append(this.titleEl, this.contentEl);
  }

  open(): void {
    if (this.#opened) return;
    this.#opened = true;
    openModals.push(this);
    document.body.append(this.modalEl);
    this.onOpen();
  }

  close(): void {
    if (!this.#opened) return;
    this.#opened = false;
    const index = openModals.indexOf(this);
    if (index >= 0) openModals.splice(index, 1);
    this.onClose();
    this.modalEl.remove();
  }

  onOpen(): void {
    /* override */
  }

  onClose(): void {
    /* override */
  }
}
