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

export function getIcon(name: string): SVGSVGElement | null {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-icon", name);
  return svg;
}

export function normalizePath(path: string): string {
  return path
    .replaceAll(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/|\/$/g, "");
}

export type App = unknown;

export class PluginSettingTab {
  readonly app: App;
  readonly containerEl: HTMLElement;

  constructor(app: App, _plugin: unknown) {
    this.app = app;
    this.containerEl = document.createElement("div");
  }

  display(): void {}

  hide(): void {}
}

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

  onOpen(): void {}

  onClose(): void {}
}

export class SuggestModal<T> {
  readonly app: App;
  readonly inputEl: HTMLInputElement;
  #opened = false;
  #placeholder = "";

  constructor(app: App) {
    this.app = app;
    this.inputEl = document.createElement("input");
  }

  setPlaceholder(text: string): void {
    this.#placeholder = text;
  }

  get placeholder(): string {
    return this.#placeholder;
  }

  open(): void {
    if (this.#opened) return;
    this.#opened = true;
    openSuggestModals.push(this as unknown as SuggestModal<unknown>);
  }

  close(): void {
    if (!this.#opened) return;
    this.#opened = false;
    const index = openSuggestModals.indexOf(this as unknown as SuggestModal<unknown>);
    if (index >= 0) openSuggestModals.splice(index, 1);
    this.onClose();
  }

  getSuggestions(_query: string): T[] | Promise<T[]> {
    return [];
  }

  renderSuggestion(_item: T, _element: HTMLElement): void {}

  onChooseSuggestion(_item: T, _event: MouseEvent | KeyboardEvent): void {}

  onClose(): void {}
}

export class AbstractInputSuggest<T> {
  readonly app: App;
  readonly inputEl: HTMLInputElement;
  #attached = false;

  constructor(app: App, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;
    this.#attached = true;
    attachedInputSuggests.push(this as unknown as AbstractInputSuggest<unknown>);
  }

  getSuggestions(_query: string): T[] | Promise<T[]> {
    return [];
  }

  renderSuggestion(_item: T, _element: HTMLElement): void {}

  selectSuggestion(_item: T, _event: MouseEvent | KeyboardEvent): void {}

  close(): void {
    if (!this.#attached) return;
    this.#attached = false;
    const index = attachedInputSuggests.indexOf(this as unknown as AbstractInputSuggest<unknown>);
    if (index >= 0) attachedInputSuggests.splice(index, 1);
  }

  get isAttached(): boolean {
    return this.#attached;
  }
}

const attachedInputSuggests: AbstractInputSuggest<unknown>[] = [];

const openModals: Modal[] = [];
const openSuggestModals: SuggestModal<unknown>[] = [];

export const __testing = {
  get openModals(): readonly Modal[] {
    return openModals;
  },
  lastOpenModal(): Modal {
    const last = openModals.at(-1);
    if (!last) throw new Error("__testing.lastOpenModal() called before any modal opened");
    return last;
  },
  get openSuggestModals(): readonly SuggestModal<unknown>[] {
    return openSuggestModals;
  },
  lastOpenSuggestModal(): SuggestModal<unknown> {
    const last = openSuggestModals.at(-1);
    if (!last) throw new Error("__testing.lastOpenSuggestModal() called before any suggest opened");
    return last;
  },
  get attachedInputSuggests(): readonly AbstractInputSuggest<unknown>[] {
    return attachedInputSuggests;
  },
  lastAttachedInputSuggest(): AbstractInputSuggest<unknown> {
    const last = attachedInputSuggests.at(-1);
    if (!last) throw new Error("__testing.lastAttachedInputSuggest() called before any input-suggest attached");
    return last;
  },
  reset(): void {
    for (const m of [...openModals]) m.close();
    openModals.length = 0;
    for (const m of [...openSuggestModals]) m.close();
    openSuggestModals.length = 0;
    for (const s of [...attachedInputSuggests]) s.close();
    attachedInputSuggests.length = 0;
  },
};
