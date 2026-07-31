import moment from "moment";
import { load as yamlLoad } from "js-yaml";

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

export class Notice {
  constructor(public message: string | DocumentFragment) {}
  setMessage(message: string | DocumentFragment): this {
    this.message = message;
    return this;
  }
  hide(): void {}
}

// Obsidian renders its own tooltip layer; the real one attaches listeners rather than writing an
// attribute. Recording it on the element keeps it assertable without pretending to be that layer.
export function setTooltip(el: HTMLElement, tooltip: string): void {
  el.dataset.tooltip = tooltip;
}

export function getIcon(name: string): SVGSVGElement | null {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-icon", name);
  return svg;
}

export function getIconIds(): string[] {
  return ["calendar", "calendar-days", "book-open", "file-text", "terminal"];
}

interface TagSourceCache {
  tags?: { tag: string }[];
  frontmatter?: Record<string, unknown>;
}

// Stand-in for Obsidian's combiner: inline tags already carry the "#", frontmatter ones
// (tag/tags, string, comma-separated string, or array) do not and get it added.
export function getAllTags(cache: TagSourceCache): string[] | null {
  const inline = cache.tags?.map((entry) => entry.tag) ?? [];
  const raw: unknown = cache.frontmatter?.tags ?? cache.frontmatter?.tag;
  const front = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value.startsWith("#") ? value : `#${value}`));
  return [...new Set([...inline, ...front])];
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

export interface FakeMenuItemConfig {
  title?: string;
  icon?: string;
  onClick?: (event: MouseEvent | KeyboardEvent) => void;
}

export class MenuItem {
  title = "";
  icon = "";
  #onClick: (event: MouseEvent | KeyboardEvent) => void = () => {};

  setTitle(title: string): this {
    this.title = title;
    return this;
  }
  setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }
  onClick(callback: (event: MouseEvent | KeyboardEvent) => void): this {
    this.#onClick = callback;
    return this;
  }
  click(event: MouseEvent | KeyboardEvent = new MouseEvent("click")): void {
    this.#onClick(event);
  }
}

export class Menu {
  readonly items: MenuItem[] = [];
  showAtMouseEventCalls: MouseEvent[] = [];
  #onHide: (() => void) | null = null;

  addItem(build: (item: MenuItem) => unknown): this {
    const item = new MenuItem();
    build(item);
    this.items.push(item);
    return this;
  }
  onHide(callback: () => void): this {
    this.#onHide = callback;
    return this;
  }
  showAtMouseEvent(event: MouseEvent): void {
    this.showAtMouseEventCalls.push(event);
    openMenus.push(this);
  }
  showAtPosition(_position: { x: number; y: number }): void {
    openMenus.push(this);
  }
  hide(): void {
    const index = openMenus.indexOf(this);
    if (index >= 0) openMenus.splice(index, 1);
    this.#onHide?.();
  }
}

export interface WorkspaceLeaf {
  readonly containerEl: HTMLElement;
}

export class ItemView {
  readonly leaf: WorkspaceLeaf;
  readonly containerEl: HTMLElement;
  readonly contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.containerEl = (leaf as { containerEl?: HTMLElement }).containerEl ?? document.createElement("div");
    this.contentEl = document.createElement("div");
    this.containerEl.append(this.contentEl);
  }

  getViewType(): string {
    return "";
  }

  getDisplayText(): string {
    return "";
  }

  getIcon(): string {
    return "";
  }

  onOpen(): Promise<void> {
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }
}

export class MarkdownRenderChild {
  readonly containerEl: HTMLElement;
  #loaded = false;

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }

  load(): void {
    if (this.#loaded) return;
    this.#loaded = true;
    this.onload();
  }

  unload(): void {
    if (!this.#loaded) return;
    this.#loaded = false;
    this.onunload();
  }

  onload(): void {}

  onunload(): void {}
}

export interface MarkdownPostProcessorContext {
  readonly sourcePath: string;
  addChild(child: MarkdownRenderChild): void;
}

export function parseYaml(source: string): unknown {
  if (source.trim() === "") return null;
  return yamlLoad(source);
}

// Obsidian augments HTMLElement with a handful of helpers. Stub them here so
// tests that exercise code calling these APIs don't fail in happy-dom.
HTMLElement.prototype.empty = function (): void {
  while (this.firstChild) this.removeChild(this.firstChild);
};

const attachedInputSuggests: AbstractInputSuggest<unknown>[] = [];

const openModals: Modal[] = [];
const openSuggestModals: SuggestModal<unknown>[] = [];
const openMenus: Menu[] = [];

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
  get openMenus(): readonly Menu[] {
    return openMenus;
  },
  lastOpenMenu(): Menu {
    const last = openMenus.at(-1);
    if (!last) throw new Error("__testing.lastOpenMenu() called before any menu opened");
    return last;
  },
  reset(): void {
    for (const m of [...openModals]) m.close();
    openModals.length = 0;
    for (const m of [...openSuggestModals]) m.close();
    openSuggestModals.length = 0;
    for (const s of [...attachedInputSuggests]) s.close();
    attachedInputSuggests.length = 0;
    for (const m of [...openMenus]) m.hide();
    openMenus.length = 0;
  },
};
